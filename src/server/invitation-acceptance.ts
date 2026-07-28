import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  type AppVariables,
  type ClientRole,
  type Role,
  createSessionToken,
  getMemberships,
  roleAtLeast,
  tokenFromCookieHeader,
  verifySessionToken,
} from "./auth.js";
import { config } from "./config.js";
import { one, transaction } from "./db.js";
import { hashToken } from "./tokens.js";

const invitations = new Hono<{ Variables: AppVariables }>();

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: config.sessionTtlDays * 24 * 60 * 60,
  };
}

function higherRole(first: Role, second: Role): Role {
  return roleAtLeast(first, second) ? first : second;
}

function higherClientRole(first: ClientRole, second: ClientRole): ClientRole {
  return first === "EDITOR" || second === "EDITOR" ? "EDITOR" : "VIEWER";
}

invitations.post("/api/invitations/:token/accept", async (c) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    password: z.string().min(8).max(72).optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues.map((issue) => issue.message).join(", "),
    });
  }
  const input = parsed.data;
  const tokenHash = hashToken(c.req.param("token"));
  const cookieToken = tokenFromCookieHeader(c.req.header("cookie"));
  const sessionUser = cookieToken ? await verifySessionToken(cookieToken) : null;
  const invitation = await one<any>(
    `SELECT * FROM invitations
      WHERE token_hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()`,
    [tokenHash],
  );
  if (!invitation) {
    throw new HTTPException(404, { message: "Invitation is invalid or expired" });
  }

  const existing = await one<any>(
    "SELECT id,email,name,password_hash,disabled FROM users WHERE email=$1",
    [invitation.email],
  );
  if (existing?.disabled) throw new HTTPException(403, { message: "This account is disabled" });
  if (existing && sessionUser?.id !== existing.id) {
    if (!input.password || !(await bcrypt.compare(input.password, existing.password_hash))) {
      throw new HTTPException(401, {
        message: "Sign in with the invited account or enter its current password",
      });
    }
  }
  if (!existing && (!input.name || !input.password)) {
    throw new HTTPException(400, { message: "Name and password are required" });
  }

  const user = await transaction(async (client) => {
    const locked = await client.query<any>(
      `SELECT * FROM invitations
        WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()
        FOR UPDATE`,
      [invitation.id],
    );
    const activeInvitation = locked.rows[0];
    if (!activeInvitation) {
      throw new HTTPException(409, { message: "Invitation has already been used" });
    }

    let account = existing;
    if (!account) {
      const created = await client.query<{ id: string; email: string; name: string }>(
        `INSERT INTO users(email,name,password_hash)
         VALUES ($1,$2,$3) RETURNING id,email,name`,
        [activeInvitation.email, input.name, await bcrypt.hash(input.password!, 12)],
      );
      account = created.rows[0];
    }

    const currentMembershipResult = await client.query<{ role: Role; all_clients: boolean }>(
      `SELECT role,all_clients FROM organization_members
        WHERE organization_id=$1 AND user_id=$2 FOR UPDATE`,
      [activeInvitation.organization_id, account.id],
    );
    const currentMembership = currentMembershipResult.rows[0];
    const permissions = activeInvitation.client_permissions as Array<{
      client_id: string;
      role: ClientRole;
    }>;
    const invitationAllClients = permissions.length === 0;
    const mergedRole = currentMembership
      ? higherRole(currentMembership.role, activeInvitation.role as Role)
      : activeInvitation.role as Role;
    const mergedAllClients = Boolean(currentMembership?.all_clients || invitationAllClients);

    await client.query(
      `INSERT INTO organization_members(organization_id,user_id,role,all_clients)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organization_id,user_id)
       DO UPDATE SET role=EXCLUDED.role,all_clients=EXCLUDED.all_clients`,
      [activeInvitation.organization_id, account.id, mergedRole, mergedAllClients],
    );

    for (const permission of permissions) {
      const current = await client.query<{ role: ClientRole }>(
        "SELECT role FROM client_members WHERE client_id=$1 AND user_id=$2",
        [permission.client_id, account.id],
      );
      const mergedClientRole = current.rows[0]
        ? higherClientRole(current.rows[0].role, permission.role)
        : permission.role;
      await client.query(
        `INSERT INTO client_members(client_id,user_id,role)
         VALUES ($1,$2,$3)
         ON CONFLICT (client_id,user_id)
         DO UPDATE SET role=EXCLUDED.role,updated_at=now()`,
        [permission.client_id, account.id, mergedClientRole],
      );
    }

    await client.query(
      "UPDATE invitations SET accepted_at=now(),accepted_by=$1 WHERE id=$2",
      [account.id, activeInvitation.id],
    );
    return { id: account.id, email: account.email, name: account.name };
  });

  setCookie(
    c,
    config.sessionCookieName,
    await createSessionToken(user),
    sessionCookieOptions(),
  );
  return c.json({ user, organizations: await getMemberships(user.id) });
});

export default invitations;
