import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  type AppVariables,
  type ClientRole,
  type Role,
  canAccessClient,
  canAccessDesign,
  createSessionToken,
  getAccessibleClientIds,
  getMemberships,
  requireAuth,
  requireOrganization,
  requireRole,
  roleAtLeast,
  tokenFromCookieHeader,
  verifySessionToken,
} from "./auth.js";
import { config } from "./config.js";
import { one, pool, query, transaction } from "./db.js";
import { sendInvitationEmail, sendPasswordResetEmail } from "./mailer.js";
import { getObject, putObject } from "./storage.js";
import { createOneTimeToken, expiresInHours, expiresInMinutes, hashToken } from "./tokens.js";

const advanced = new Hono<{ Variables: AppVariables }>();

advanced.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

async function parseBody<T extends z.ZodTypeAny>(c: any, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues.map((issue) => issue.message).join(", "),
    });
  }
  return parsed.data;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: config.sessionTtlDays * 24 * 60 * 60,
  };
}

const emailSchema = z.string().email().transform((value) => value.trim().toLowerCase());
const passwordSchema = z.string().min(8).max(72);
const clientPermissionSchema = z.object({
  client_id: z.string().uuid(),
  role: z.enum(["EDITOR", "VIEWER"]),
});
const editRulesSchema = z.object({
  mode: z.enum(["unlocked", "locked", "regions"]).default("unlocked"),
  editableObjectIds: z.array(z.string().min(1).max(120)).default([]),
  lockedObjectIds: z.array(z.string().min(1).max(120)).default([]),
});
const brandKitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  client_id: z.string().uuid().nullable().optional(),
  colors: z.array(z.string().max(80)).default([]),
  fonts: z.array(z.string().max(160)).default([]),
  logos: z.array(z.string().max(1000)).default([]),
  text_styles: z.array(z.record(z.unknown())).default([]),
  is_default: z.boolean().default(false),
});

async function optionalSessionUser(c: any) {
  const token = tokenFromCookieHeader(c.req.header("cookie"));
  return token ? verifySessionToken(token) : null;
}

async function assertClientPermissions(
  organizationId: string,
  permissions: Array<{ client_id: string; role: ClientRole }>,
): Promise<void> {
  if (permissions.length === 0) return;
  const uniqueIds = [...new Set(permissions.map((permission) => permission.client_id))];
  const rows = await query<{ id: string }>(
    "SELECT id FROM clients WHERE organization_id = $1 AND id = ANY($2::uuid[])",
    [organizationId, uniqueIds],
  );
  if (rows.length !== uniqueIds.length) throw new HTTPException(400, { message: "Invalid client access" });
}

async function listAccessibleClients(userId: string, organizationId: string) {
  const ids = await getAccessibleClientIds(userId, organizationId);
  if (ids === null) {
    return query("SELECT * FROM clients WHERE organization_id = $1 ORDER BY name", [organizationId]);
  }
  if (ids.length === 0) return [];
  return query(
    `SELECT c.*, cm.role AS access_role
       FROM clients c
       JOIN client_members cm ON cm.client_id = c.id AND cm.user_id = $2
      WHERE c.organization_id = $1 AND c.id = ANY($3::uuid[])
      ORDER BY c.name`,
    [organizationId, userId, ids],
  );
}

async function snapshotDesign(designId: string, organizationId: string) {
  const design = await one<any>(
    `SELECT id, organization_id, client_id, name, canvas_json, width, height,
            thumbnail_url, template_id, template_edit_rules, created_at, updated_at
       FROM designs WHERE id = $1 AND organization_id = $2`,
    [designId, organizationId],
  );
  if (!design) throw new HTTPException(404, { message: "Design not found" });
  const pages = await query<any>(
    `SELECT id, title, canvas_json, sort_order, created_at, updated_at
       FROM pages WHERE design_id = $1 ORDER BY sort_order, created_at`,
    [designId],
  );
  return { design, pages };
}

async function createDesignVersion(input: {
  designId: string;
  organizationId: string;
  userId: string;
  label?: string | null;
  source: "manual" | "save" | "restore" | "system";
}) {
  const snapshot = await snapshotDesign(input.designId, input.organizationId);
  return one<any>(
    `INSERT INTO design_versions(design_id, organization_id, created_by, label, source, snapshot)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, design_id, created_by, label, source, created_at`,
    [
      input.designId,
      input.organizationId,
      input.userId,
      input.label ?? null,
      input.source,
      JSON.stringify(snapshot),
    ],
  );
}

// Password reset -------------------------------------------------------------

advanced.post("/api/auth/forgot-password", async (c) => {
  const input = await parseBody(c, z.object({ email: emailSchema }));
  const user = await one<{ id: string; email: string; name: string; disabled: boolean }>(
    "SELECT id, email, name, disabled FROM users WHERE email = $1",
    [input.email],
  );
  if (user && !user.disabled) {
    const token = createOneTimeToken();
    const expiresAt = expiresInMinutes(config.passwordResetTtlMinutes);
    await transaction(async (client) => {
      await client.query(
        "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
        [user.id],
      );
      await client.query(
        `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, token.hash, expiresAt],
      );
    });
    const resetUrl = `${config.appUrl}/?reset=${encodeURIComponent(token.token)}`;
    await sendPasswordResetEmail({
      email: user.email,
      name: user.name,
      resetUrl,
      expiresMinutes: config.passwordResetTtlMinutes,
    });
  }
  return c.json({ ok: true });
});

advanced.get("/api/auth/reset-password/:token", async (c) => {
  const record = await one<{ email: string; name: string; expires_at: string }>(
    `SELECT u.email, u.name, prt.expires_at
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = $1 AND prt.used_at IS NULL AND prt.expires_at > now()`,
    [hashToken(c.req.param("token"))],
  );
  if (!record) throw new HTTPException(404, { message: "Reset link is invalid or expired" });
  return c.json(record);
});

advanced.post("/api/auth/reset-password", async (c) => {
  const input = await parseBody(
    c,
    z.object({ token: z.string().min(20).max(200), password: passwordSchema }),
  );
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await transaction(async (client) => {
    const tokenRecord = await client.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [hashToken(input.token)],
    );
    const row = tokenRecord.rows[0];
    if (!row) throw new HTTPException(404, { message: "Reset link is invalid or expired" });
    const updated = await client.query<{ id: string; email: string; name: string }>(
      `UPDATE users SET password_hash = $1, updated_at = now()
        WHERE id = $2 RETURNING id, email, name`,
      [passwordHash, row.user_id],
    );
    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1", [
      row.user_id,
    ]);
    return updated.rows[0];
  });
  setCookie(c, config.sessionCookieName, await createSessionToken(user), sessionCookieOptions());
  return c.json({ user, organizations: await getMemberships(user.id) });
});

// Email invitations ----------------------------------------------------------

advanced.get("/api/invitations/:token", async (c) => {
  const invitation = await one<any>(
    `SELECT i.id, i.email, i.role, i.client_permissions, i.expires_at,
            o.name AS organization_name,
            EXISTS(SELECT 1 FROM users u WHERE u.email = i.email) AS existing_account
       FROM invitations i
       JOIN organizations o ON o.id = i.organization_id
      WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
        AND i.expires_at > now()`,
    [hashToken(c.req.param("token"))],
  );
  if (!invitation) throw new HTTPException(404, { message: "Invitation is invalid or expired" });
  const clientIds = (invitation.client_permissions as Array<{ client_id: string }>).map(
    (permission) => permission.client_id,
  );
  const clients = clientIds.length
    ? await query<{ id: string; name: string }>(
        "SELECT id, name FROM clients WHERE id = ANY($1::uuid[]) ORDER BY name",
        [clientIds],
      )
    : [];
  return c.json({ ...invitation, clients });
});

advanced.post("/api/invitations/:token/accept", async (c) => {
  const input = await parseBody(
    c,
    z.object({ name: z.string().trim().min(2).max(80).optional(), password: passwordSchema.optional() }),
  );
  const hash = hashToken(c.req.param("token"));
  const sessionUser = await optionalSessionUser(c);
  const invitation = await one<any>(
    `SELECT * FROM invitations
      WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`,
    [hash],
  );
  if (!invitation) throw new HTTPException(404, { message: "Invitation is invalid or expired" });

  const existing = await one<any>(
    "SELECT id, email, name, password_hash, disabled FROM users WHERE email = $1",
    [invitation.email],
  );
  if (existing?.disabled) throw new HTTPException(403, { message: "This account is disabled" });
  if (existing && sessionUser?.id !== existing.id) {
    if (!input.password || !(await bcrypt.compare(input.password, existing.password_hash))) {
      throw new HTTPException(401, { message: "Sign in or enter the existing account password" });
    }
  }
  if (!existing && (!input.name || !input.password)) {
    throw new HTTPException(400, { message: "Name and password are required" });
  }

  const user = await transaction(async (client) => {
    const lockedInvitation = await client.query<any>(
      `SELECT * FROM invitations
        WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [invitation.id],
    );
    if (!lockedInvitation.rows[0]) {
      throw new HTTPException(409, { message: "Invitation has already been used" });
    }
    let account = existing;
    if (!account) {
      const created = await client.query<{ id: string; email: string; name: string }>(
        `INSERT INTO users(email, name, password_hash)
         VALUES ($1, $2, $3) RETURNING id, email, name`,
        [invitation.email, input.name, await bcrypt.hash(input.password!, 12)],
      );
      account = created.rows[0];
    }
    const permissions = invitation.client_permissions as Array<{
      client_id: string;
      role: ClientRole;
    }>;
    const allClients = permissions.length === 0;
    await client.query(
      `INSERT INTO organization_members(organization_id, user_id, role, all_clients)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, all_clients = EXCLUDED.all_clients`,
      [invitation.organization_id, account.id, invitation.role, allClients],
    );
    await client.query(
      `DELETE FROM client_members
        WHERE user_id = $1
          AND client_id IN (SELECT id FROM clients WHERE organization_id = $2)`,
      [account.id, invitation.organization_id],
    );
    for (const permission of permissions) {
      await client.query(
        `INSERT INTO client_members(client_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (client_id, user_id)
         DO UPDATE SET role = EXCLUDED.role, updated_at = now()`,
        [permission.client_id, account.id, permission.role],
      );
    }
    await client.query(
      "UPDATE invitations SET accepted_at = now(), accepted_by = $1 WHERE id = $2",
      [account.id, invitation.id],
    );
    return { id: account.id, email: account.email, name: account.name };
  });
  setCookie(c, config.sessionCookieName, await createSessionToken(user), sessionCookieOptions());
  return c.json({ user, organizations: await getMemberships(user.id) });
});

advanced.get(
  "/api/organization/invitations",
  requireAuth,
  requireOrganization,
  requireRole("ADMIN"),
  async (c) => {
    return c.json(
      await query(
        `SELECT i.id, i.email, i.role, i.client_permissions, i.expires_at, i.accepted_at,
                i.revoked_at, i.email_sent_at, i.created_at, u.name AS invited_by_name
           FROM invitations i JOIN users u ON u.id = i.invited_by
          WHERE i.organization_id = $1 ORDER BY i.created_at DESC LIMIT 200`,
        [c.get("organizationId")],
      ),
    );
  },
);

advanced.post(
  "/api/organization/invitations",
  requireAuth,
  requireOrganization,
  requireRole("ADMIN"),
  async (c) => {
    const input = await parseBody(
      c,
      z.object({
        email: emailSchema,
        role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
        all_clients: z.boolean().default(true),
        clients: z.array(clientPermissionSchema).default([]),
      }),
    );
    if (input.role === "ADMIN" && !input.all_clients) {
      throw new HTTPException(400, { message: "Administrators must have access to all clients" });
    }
    const permissions = input.all_clients ? [] : input.clients;
    if (!input.all_clients && permissions.length === 0) {
      throw new HTTPException(400, { message: "Select at least one client" });
    }
    await assertClientPermissions(c.get("organizationId"), permissions);
    const organization = await one<{ name: string }>("SELECT name FROM organizations WHERE id = $1", [
      c.get("organizationId"),
    ]);
    const clientNames = permissions.length
      ? await query<{ name: string }>(
          "SELECT name FROM clients WHERE id = ANY($1::uuid[]) ORDER BY name",
          [permissions.map((permission) => permission.client_id)],
        )
      : [];
    const token = createOneTimeToken();
    const invitation = await one<any>(
      `INSERT INTO invitations(
         organization_id, email, role, token_hash, invited_by, expires_at, client_permissions
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id, email, role, expires_at, created_at`,
      [
        c.get("organizationId"),
        input.email,
        input.role,
        token.hash,
        c.get("user").id,
        expiresInHours(config.invitationTtlHours),
        JSON.stringify(permissions),
      ],
    );
    const invitationUrl = `${config.appUrl}/?invite=${encodeURIComponent(token.token)}`;
    try {
      await sendInvitationEmail({
        email: input.email,
        inviterName: c.get("user").name,
        organizationName: organization?.name ?? "DDone Design",
        role: input.role,
        clientNames: clientNames.map((client) => client.name),
        invitationUrl,
        expiresHours: config.invitationTtlHours,
      });
      await pool.query("UPDATE invitations SET email_sent_at = now() WHERE id = $1", [invitation.id]);
    } catch (error) {
      await pool.query("DELETE FROM invitations WHERE id = $1", [invitation.id]);
      console.error("Invitation email delivery failed", error);
      throw new HTTPException(502, { message: "Unable to send invitation email" });
    }
    return c.json(invitation, 201);
  },
);

advanced.delete(
  "/api/organization/invitations/:id",
  requireAuth,
  requireOrganization,
  requireRole("ADMIN"),
  async (c) => {
    const result = await pool.query(
      `UPDATE invitations SET revoked_at = now()
        WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL
        RETURNING id`,
      [c.req.param("id"), c.get("organizationId")],
    );
    if (result.rowCount === 0) throw new HTTPException(404, { message: "Invitation not found" });
    return c.json({ ok: true });
  },
);

// Members and client ACLs -----------------------------------------------------

advanced.get(
  "/api/organization/members",
  requireAuth,
  requireOrganization,
  requireRole("ADMIN"),
  async (c) => {
    const members = await query<any>(
      `SELECT u.id, u.email, u.name, om.role, om.all_clients, om.created_at
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
        WHERE om.organization_id = $1 ORDER BY u.name`,
      [c.get("organizationId")],
    );
    const permissions = await query<any>(
      `SELECT cm.user_id, cm.client_id, cm.role, c.name AS client_name
         FROM client_members cm
         JOIN clients c ON c.id = cm.client_id
        WHERE c.organization_id = $1 ORDER BY c.name`,
      [c.get("organizationId")],
    );
    return c.json(
      members.map((member) => ({
        ...member,
        clients: permissions.filter((permission) => permission.user_id === member.id),
      })),
    );
  },
);

advanced.put(
  "/api/organization/members/:userId/access",
  requireAuth,
  requireOrganization,
  requireRole("ADMIN"),
  async (c) => {
    const input = await parseBody(
      c,
      z.object({
        role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
        all_clients: z.boolean(),
        clients: z.array(clientPermissionSchema).default([]),
      }),
    );
    if (input.role === "ADMIN" && !input.all_clients) {
      throw new HTTPException(400, { message: "Administrators must have all-client access" });
    }
    const permissions = input.all_clients ? [] : input.clients;
    await assertClientPermissions(c.get("organizationId"), permissions);
    await transaction(async (client) => {
      const update = await client.query(
        `UPDATE organization_members SET role = $1, all_clients = $2
          WHERE organization_id = $3 AND user_id = $4 AND role <> 'OWNER'`,
        [input.role, input.all_clients, c.get("organizationId"), c.req.param("userId")],
      );
      if (update.rowCount === 0) {
        throw new HTTPException(404, { message: "Member not found or owner access cannot be changed" });
      }
      await client.query(
        `DELETE FROM client_members
          WHERE user_id = $1
            AND client_id IN (SELECT id FROM clients WHERE organization_id = $2)`,
        [c.req.param("userId"), c.get("organizationId")],
      );
      for (const permission of permissions) {
        await client.query(
          `INSERT INTO client_members(client_id, user_id, role) VALUES ($1, $2, $3)`,
          [permission.client_id, c.req.param("userId"), permission.role],
        );
      }
    });
    return c.json({ ok: true });
  },
);

advanced.get("/api/clients", requireAuth, requireOrganization, async (c) => {
  return c.json(await listAccessibleClients(c.get("user").id, c.get("organizationId")));
});

advanced.get(
  "/api/clients/:id/members",
  requireAuth,
  requireOrganization,
  requireRole("ADMIN"),
  async (c) => {
    const client = await one("SELECT id FROM clients WHERE id = $1 AND organization_id = $2", [
      c.req.param("id"),
      c.get("organizationId"),
    ]);
    if (!client) throw new HTTPException(404, { message: "Client not found" });
    return c.json(
      await query(
        `SELECT u.id, u.email, u.name, cm.role
           FROM client_members cm JOIN users u ON u.id = cm.user_id
          WHERE cm.client_id = $1 ORDER BY u.name`,
        [c.req.param("id")],
      ),
    );
  },
);

// Secure designs and pages ---------------------------------------------------

advanced.get("/api/designs", requireAuth, requireOrganization, async (c) => {
  const ids = await getAccessibleClientIds(c.get("user").id, c.get("organizationId"));
  if (ids === null) {
    return c.json(
      await query(
        `SELECT id, organization_id, client_id, name, canvas_json, width, height,
                thumbnail_url, template_id, template_edit_rules, created_at, updated_at
           FROM designs WHERE organization_id = $1 ORDER BY updated_at DESC`,
        [c.get("organizationId")],
      ),
    );
  }
  if (ids.length === 0) return c.json([]);
  return c.json(
    await query(
      `SELECT id, organization_id, client_id, name, canvas_json, width, height,
              thumbnail_url, template_id, template_edit_rules, created_at, updated_at
         FROM designs
        WHERE organization_id = $1 AND client_id = ANY($2::uuid[])
        ORDER BY updated_at DESC`,
      [c.get("organizationId"), ids],
    ),
  );
});

advanced.post("/api/designs", requireAuth, requireOrganization, async (c) => {
  const input = await parseBody(
    c,
    z.object({
      name: z.string().trim().min(1).max(180).default("Untitled Design"),
      canvas_json: z.string().default("{}"),
      width: z.number().int().min(64).max(16000).default(1080),
      height: z.number().int().min(64).max(16000).default(1080),
      client_id: z.string().uuid().nullable().optional(),
      template_id: z.string().max(160).nullable().optional(),
    }),
  );
  const clientId = input.client_id ?? c.get("clientId");
  if (!clientId && !c.get("allClients")) {
    throw new HTTPException(400, { message: "A permitted client must be selected" });
  }
  if (clientId && !(await canAccessClient(c.get("user").id, c.get("organizationId"), clientId, "EDITOR"))) {
    throw new HTTPException(403, { message: "Client editor access required" });
  }
  if (!clientId && !roleAtLeast(c.get("organizationRole"), "EDITOR")) {
    throw new HTTPException(403, { message: "Editor access required" });
  }
  let editRules = editRulesSchema.parse({});
  if (input.template_id) {
    const template = await one<{ edit_rules: unknown; client_id: string | null }>(
      `SELECT edit_rules, client_id FROM templates
        WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)`,
      [input.template_id, c.get("organizationId")],
    );
    if (!template) throw new HTTPException(400, { message: "Template not found" });
    if (template.client_id && template.client_id !== clientId) {
      throw new HTTPException(403, { message: "Template belongs to another client" });
    }
    editRules = editRulesSchema.parse(template.edit_rules);
  }
  const design = await transaction(async (client) => {
    const created = await client.query<any>(
      `INSERT INTO designs(
         organization_id, client_id, created_by, name, canvas_json, width, height,
         template_id, template_edit_rules
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       RETURNING *`,
      [
        c.get("organizationId"),
        clientId ?? null,
        c.get("user").id,
        input.name,
        input.canvas_json,
        input.width,
        input.height,
        input.template_id ?? null,
        JSON.stringify(editRules),
      ],
    );
    await client.query(
      "INSERT INTO pages(design_id, title, canvas_json, sort_order) VALUES ($1, 'Page 1', $2, 0)",
      [created.rows[0].id, input.canvas_json],
    );
    return created.rows[0];
  });
  await createDesignVersion({
    designId: design.id,
    organizationId: c.get("organizationId"),
    userId: c.get("user").id,
    label: "Initial version",
    source: "system",
  });
  return c.json(design, 201);
});

advanced.get("/api/designs/:id", requireAuth, requireOrganization, async (c) => {
  const access = await canAccessDesign(c.get("user").id, c.req.param("id"), "VIEWER");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(404, { message: "Design not found" });
  }
  const snapshot = await snapshotDesign(c.req.param("id"), c.get("organizationId"));
  return c.json({ ...snapshot.design, pages: snapshot.pages, effective_role: access.role });
});

advanced.put("/api/designs/:id", requireAuth, requireOrganization, async (c) => {
  const access = await canAccessDesign(c.get("user").id, c.req.param("id"), "EDITOR");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(403, { message: "Design editor access required" });
  }
  const input = await parseBody(
    c,
    z.object({
      name: z.string().trim().min(1).max(180).optional(),
      canvas_json: z.string().optional(),
      width: z.number().int().min(64).max(16000).optional(),
      height: z.number().int().min(64).max(16000).optional(),
      thumbnail_url: z.string().nullable().optional(),
      client_id: z.string().uuid().nullable().optional(),
    }),
  );
  const existing = await one<any>("SELECT * FROM designs WHERE id = $1", [c.req.param("id")]);
  if (input.client_id !== undefined && input.client_id !== existing.client_id) {
    if (!roleAtLeast(c.get("organizationRole"), "ADMIN")) {
      throw new HTTPException(403, { message: "Only administrators can move designs between clients" });
    }
    if (input.client_id && !(await canAccessClient(c.get("user").id, c.get("organizationId"), input.client_id))) {
      throw new HTTPException(400, { message: "Invalid client" });
    }
  }
  const updated = await one<any>(
    `UPDATE designs SET name=$1, canvas_json=$2, width=$3, height=$4,
                        thumbnail_url=$5, client_id=$6, updated_at=now()
      WHERE id=$7 RETURNING *`,
    [
      input.name ?? existing.name,
      input.canvas_json ?? existing.canvas_json,
      input.width ?? existing.width,
      input.height ?? existing.height,
      input.thumbnail_url === undefined ? existing.thumbnail_url : input.thumbnail_url,
      input.client_id === undefined ? existing.client_id : input.client_id,
      existing.id,
    ],
  );
  return c.json(updated);
});

advanced.delete("/api/designs/:id", requireAuth, requireOrganization, async (c) => {
  const access = await canAccessDesign(c.get("user").id, c.req.param("id"), "EDITOR");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(403, { message: "Design editor access required" });
  }
  await pool.query("DELETE FROM designs WHERE id = $1", [c.req.param("id")]);
  await pool.query("DELETE FROM collaboration_documents WHERE room = $1", [`design:${c.req.param("id")}`]);
  return c.json({ ok: true });
});

async function pageAccess(userId: string, pageId: string, minimum: Role) {
  const page = await one<{ id: string; design_id: string }>(
    "SELECT id, design_id FROM pages WHERE id = $1",
    [pageId],
  );
  if (!page) return null;
  const access = await canAccessDesign(userId, page.design_id, minimum);
  return access ? { ...page, ...access } : null;
}

advanced.post("/api/designs/:id/pages", requireAuth, requireOrganization, async (c) => {
  const access = await canAccessDesign(c.get("user").id, c.req.param("id"), "EDITOR");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(403, { message: "Design editor access required" });
  }
  const input = await parseBody(
    c,
    z.object({
      title: z.string().trim().max(120).optional(),
      canvas_json: z.string().optional(),
      after_sort_order: z.number().int().optional(),
    }),
  );
  const page = await transaction(async (client) => {
    const maximum = await client.query<{ value: number }>(
      "SELECT COALESCE(MAX(sort_order), -1)::int AS value FROM pages WHERE design_id = $1",
      [c.req.param("id")],
    );
    let order = maximum.rows[0].value + 1;
    if (input.after_sort_order !== undefined) {
      await client.query(
        "UPDATE pages SET sort_order=sort_order+1 WHERE design_id=$1 AND sort_order>$2",
        [c.req.param("id"), input.after_sort_order],
      );
      order = input.after_sort_order + 1;
    }
    const count = await client.query<{ value: number }>(
      "SELECT COUNT(*)::int AS value FROM pages WHERE design_id=$1",
      [c.req.param("id")],
    );
    const created = await client.query<any>(
      `INSERT INTO pages(design_id,title,canvas_json,sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [
        c.req.param("id"),
        input.title ?? `Page ${count.rows[0].value + 1}`,
        input.canvas_json ?? "{}",
        order,
      ],
    );
    return created.rows[0];
  });
  return c.json(page, 201);
});

advanced.post("/api/pages/:pageId/duplicate", requireAuth, requireOrganization, async (c) => {
  const access = await pageAccess(c.get("user").id, c.req.param("pageId"), "EDITOR");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(403, { message: "Page editor access required" });
  }
  const original = await one<any>("SELECT * FROM pages WHERE id=$1", [access.id]);
  const page = await transaction(async (client) => {
    await client.query(
      "UPDATE pages SET sort_order=sort_order+1 WHERE design_id=$1 AND sort_order>$2",
      [original.design_id, original.sort_order],
    );
    const created = await client.query<any>(
      `INSERT INTO pages(design_id,title,canvas_json,sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [original.design_id, `${original.title} (copy)`, original.canvas_json, original.sort_order + 1],
    );
    return created.rows[0];
  });
  return c.json(page, 201);
});

advanced.put("/api/pages/:pageId", requireAuth, requireOrganization, async (c) => {
  const access = await pageAccess(c.get("user").id, c.req.param("pageId"), "EDITOR");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(403, { message: "Page editor access required" });
  }
  const input = await parseBody(
    c,
    z.object({ title: z.string().trim().max(120).optional(), canvas_json: z.string().optional() }),
  );
  const existing = await one<any>("SELECT * FROM pages WHERE id=$1", [access.id]);
  const updated = await one<any>(
    `UPDATE pages SET title=$1, canvas_json=$2, updated_at=now() WHERE id=$3 RETURNING *`,
    [input.title ?? existing.title, input.canvas_json ?? existing.canvas_json, existing.id],
  );
  await pool.query("UPDATE designs SET updated_at=now() WHERE id=$1", [existing.design_id]);
  return c.json(updated);
});

advanced.delete("/api/pages/:pageId", requireAuth, requireOrganization, async (c) => {
  const access = await pageAccess(c.get("user").id, c.req.param("pageId"), "EDITOR");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(403, { message: "Page editor access required" });
  }
  const count = await one<{ value: number }>(
    "SELECT COUNT(*)::int AS value FROM pages WHERE design_id=$1",
    [access.design_id],
  );
  if ((count?.value ?? 0) <= 1) throw new HTTPException(400, { message: "Cannot delete the last page" });
  await pool.query("DELETE FROM pages WHERE id=$1", [access.id]);
  return c.json({ ok: true });
});

// Version history ------------------------------------------------------------

advanced.get("/api/designs/:id/versions", requireAuth, requireOrganization, async (c) => {
  const access = await canAccessDesign(c.get("user").id, c.req.param("id"), "VIEWER");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(404, { message: "Design not found" });
  }
  return c.json(
    await query(
      `SELECT dv.id, dv.design_id, dv.label, dv.source, dv.created_at,
              u.name AS created_by_name, u.email AS created_by_email
         FROM design_versions dv LEFT JOIN users u ON u.id=dv.created_by
        WHERE dv.design_id=$1 AND dv.organization_id=$2
        ORDER BY dv.created_at DESC LIMIT 200`,
      [c.req.param("id"), c.get("organizationId")],
    ),
  );
});

advanced.post("/api/designs/:id/versions", requireAuth, requireOrganization, async (c) => {
  const access = await canAccessDesign(c.get("user").id, c.req.param("id"), "EDITOR");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(403, { message: "Design editor access required" });
  }
  const input = await parseBody(c, z.object({ label: z.string().trim().max(160).optional(), source: z.enum(["manual", "save"]).default("manual") }));
  return c.json(
    await createDesignVersion({
      designId: c.req.param("id"),
      organizationId: c.get("organizationId"),
      userId: c.get("user").id,
      label: input.label,
      source: input.source,
    }),
    201,
  );
});

advanced.post("/api/designs/:id/versions/:versionId/restore", requireAuth, requireOrganization, async (c) => {
  const access = await canAccessDesign(c.get("user").id, c.req.param("id"), "EDITOR");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(403, { message: "Design editor access required" });
  }
  const version = await one<{ snapshot: any }>(
    `SELECT snapshot FROM design_versions
      WHERE id=$1 AND design_id=$2 AND organization_id=$3`,
    [c.req.param("versionId"), c.req.param("id"), c.get("organizationId")],
  );
  if (!version) throw new HTTPException(404, { message: "Version not found" });
  await createDesignVersion({
    designId: c.req.param("id"),
    organizationId: c.get("organizationId"),
    userId: c.get("user").id,
    label: "Before restore",
    source: "system",
  });
  await transaction(async (client) => {
    const design = version.snapshot.design;
    await client.query(
      `UPDATE designs SET name=$1, canvas_json=$2, width=$3, height=$4,
                          thumbnail_url=$5, template_id=$6, template_edit_rules=$7::jsonb,
                          updated_at=now()
        WHERE id=$8`,
      [
        design.name,
        design.canvas_json,
        design.width,
        design.height,
        design.thumbnail_url,
        design.template_id,
        JSON.stringify(design.template_edit_rules ?? editRulesSchema.parse({})),
        c.req.param("id"),
      ],
    );
    await client.query("DELETE FROM pages WHERE design_id=$1", [c.req.param("id")]);
    for (const page of version.snapshot.pages ?? []) {
      await client.query(
        `INSERT INTO pages(id,design_id,title,canvas_json,sort_order,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,now()),now())`,
        [page.id, c.req.param("id"), page.title, page.canvas_json, page.sort_order, page.created_at ?? null],
      );
    }
    await client.query("DELETE FROM collaboration_documents WHERE room=$1", [`design:${c.req.param("id")}`]);
  });
  await createDesignVersion({
    designId: c.req.param("id"),
    organizationId: c.get("organizationId"),
    userId: c.get("user").id,
    label: "Restored version",
    source: "restore",
  });
  return c.json(await snapshotDesign(c.req.param("id"), c.get("organizationId")));
});

// Templates with selective locking ------------------------------------------

advanced.get("/api/templates", requireAuth, requireOrganization, async (c) => {
  const ids = await getAccessibleClientIds(c.get("user").id, c.get("organizationId"));
  if (ids === null) {
    return c.json(
      await query(
        `SELECT id,name,category,canvas_json,width,height,thumbnail_url,sort_order,
                organization_id,client_id,is_locked,edit_rules
           FROM templates
          WHERE organization_id IS NULL OR organization_id=$1
          ORDER BY sort_order,name`,
        [c.get("organizationId")],
      ),
    );
  }
  return c.json(
    await query(
      `SELECT id,name,category,canvas_json,width,height,thumbnail_url,sort_order,
              organization_id,client_id,is_locked,edit_rules
         FROM templates
        WHERE organization_id IS NULL
           OR (organization_id=$1 AND (client_id IS NULL OR client_id=ANY($2::uuid[])))
        ORDER BY sort_order,name`,
      [c.get("organizationId"), ids],
    ),
  );
});

advanced.post("/api/templates", requireAuth, requireOrganization, requireRole("EDITOR"), async (c) => {
  const input = await parseBody(
    c,
    z.object({
      id: z.string().trim().min(2).max(160).regex(/^[a-z0-9][a-z0-9-]*$/),
      name: z.string().trim().min(1).max(160),
      category: z.string().trim().min(1).max(80),
      canvas_json: z.string().min(2),
      width: z.number().int().min(64).max(16000),
      height: z.number().int().min(64).max(16000),
      thumbnail_url: z.string().nullable().optional(),
      client_id: z.string().uuid().nullable().optional(),
      edit_rules: editRulesSchema.default({ mode: "unlocked", editableObjectIds: [], lockedObjectIds: [] }),
    }),
  );
  if (input.client_id && !(await canAccessClient(c.get("user").id, c.get("organizationId"), input.client_id, "EDITOR"))) {
    throw new HTTPException(403, { message: "Client editor access required" });
  }
  const template = await one<any>(
    `INSERT INTO templates(id,organization_id,client_id,name,category,canvas_json,width,height,
                           thumbnail_url,is_locked,edit_rules)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING *`,
    [
      input.id,
      c.get("organizationId"),
      input.client_id ?? null,
      input.name,
      input.category,
      input.canvas_json,
      input.width,
      input.height,
      input.thumbnail_url ?? null,
      input.edit_rules.mode !== "unlocked",
      JSON.stringify(input.edit_rules),
    ],
  );
  return c.json(template, 201);
});

advanced.put("/api/templates/:id", requireAuth, requireOrganization, requireRole("EDITOR"), async (c) => {
  const existing = await one<any>(
    "SELECT * FROM templates WHERE id=$1 AND organization_id=$2",
    [c.req.param("id"), c.get("organizationId")],
  );
  if (!existing) throw new HTTPException(404, { message: "Template not found" });
  if (existing.client_id && !(await canAccessClient(c.get("user").id, c.get("organizationId"), existing.client_id, "EDITOR"))) {
    throw new HTTPException(403, { message: "Client editor access required" });
  }
  const input = await parseBody(
    c,
    z.object({
      name: z.string().trim().min(1).max(160).optional(),
      category: z.string().trim().min(1).max(80).optional(),
      canvas_json: z.string().min(2).optional(),
      thumbnail_url: z.string().nullable().optional(),
      edit_rules: editRulesSchema.optional(),
    }),
  );
  const rules = input.edit_rules ?? existing.edit_rules;
  return c.json(
    await one(
      `UPDATE templates SET name=$1,category=$2,canvas_json=$3,thumbnail_url=$4,
                            edit_rules=$5::jsonb,is_locked=$6
        WHERE id=$7 RETURNING *`,
      [
        input.name ?? existing.name,
        input.category ?? existing.category,
        input.canvas_json ?? existing.canvas_json,
        input.thumbnail_url === undefined ? existing.thumbnail_url : input.thumbnail_url,
        JSON.stringify(rules),
        rules.mode !== "unlocked",
        existing.id,
      ],
    ),
  );
});

advanced.delete("/api/templates/:id", requireAuth, requireOrganization, requireRole("EDITOR"), async (c) => {
  const result = await pool.query(
    "DELETE FROM templates WHERE id=$1 AND organization_id=$2",
    [c.req.param("id"), c.get("organizationId")],
  );
  if (result.rowCount === 0) throw new HTTPException(404, { message: "Template not found" });
  return c.json({ ok: true });
});

// Brand kits per client ------------------------------------------------------

advanced.get("/api/brand-kits", requireAuth, requireOrganization, async (c) => {
  const ids = await getAccessibleClientIds(c.get("user").id, c.get("organizationId"));
  if (ids === null) {
    return c.json(
      await query("SELECT * FROM brand_kits WHERE organization_id=$1 ORDER BY is_default DESC,name", [
        c.get("organizationId"),
      ]),
    );
  }
  return c.json(
    await query(
      `SELECT * FROM brand_kits WHERE organization_id=$1
        AND (client_id IS NULL OR client_id=ANY($2::uuid[]))
        ORDER BY is_default DESC,name`,
      [c.get("organizationId"), ids],
    ),
  );
});

advanced.post("/api/brand-kits", requireAuth, requireOrganization, requireRole("EDITOR"), async (c) => {
  const input = await parseBody(c, brandKitSchema);
  if (input.client_id && !(await canAccessClient(c.get("user").id, c.get("organizationId"), input.client_id, "EDITOR"))) {
    throw new HTTPException(403, { message: "Client editor access required" });
  }
  const kit = await transaction(async (client) => {
    if (input.is_default) {
      await client.query(
        "UPDATE brand_kits SET is_default=false WHERE organization_id=$1 AND client_id IS NOT DISTINCT FROM $2::uuid",
        [c.get("organizationId"), input.client_id ?? null],
      );
    }
    const created = await client.query<any>(
      `INSERT INTO brand_kits(organization_id,client_id,name,colors,fonts,logos,text_styles,is_default,updated_by)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9) RETURNING *`,
      [
        c.get("organizationId"),
        input.client_id ?? null,
        input.name,
        JSON.stringify(input.colors),
        JSON.stringify(input.fonts),
        JSON.stringify(input.logos),
        JSON.stringify(input.text_styles),
        input.is_default,
        c.get("user").id,
      ],
    );
    return created.rows[0];
  });
  return c.json(kit, 201);
});

advanced.put("/api/brand-kits/:id", requireAuth, requireOrganization, requireRole("EDITOR"), async (c) => {
  const existing = await one<any>(
    "SELECT * FROM brand_kits WHERE id=$1 AND organization_id=$2",
    [c.req.param("id"), c.get("organizationId")],
  );
  if (!existing) throw new HTTPException(404, { message: "Brand kit not found" });
  if (existing.client_id && !(await canAccessClient(c.get("user").id, c.get("organizationId"), existing.client_id, "EDITOR"))) {
    throw new HTTPException(403, { message: "Client editor access required" });
  }
  const input = await parseBody(c, brandKitSchema.partial());
  const clientId = input.client_id === undefined ? existing.client_id : input.client_id;
  const isDefault = input.is_default ?? existing.is_default;
  const kit = await transaction(async (client) => {
    if (isDefault) {
      await client.query(
        "UPDATE brand_kits SET is_default=false WHERE organization_id=$1 AND client_id IS NOT DISTINCT FROM $2::uuid AND id<>$3",
        [c.get("organizationId"), clientId, existing.id],
      );
    }
    const updated = await client.query<any>(
      `UPDATE brand_kits SET client_id=$1,name=$2,colors=$3::jsonb,fonts=$4::jsonb,
                             logos=$5::jsonb,text_styles=$6::jsonb,is_default=$7,
                             updated_by=$8,updated_at=now()
        WHERE id=$9 RETURNING *`,
      [
        clientId,
        input.name ?? existing.name,
        JSON.stringify(input.colors ?? existing.colors),
        JSON.stringify(input.fonts ?? existing.fonts),
        JSON.stringify(input.logos ?? existing.logos),
        JSON.stringify(input.text_styles ?? existing.text_styles),
        isDefault,
        c.get("user").id,
        existing.id,
      ],
    );
    return updated.rows[0];
  });
  return c.json(kit);
});

advanced.delete("/api/brand-kits/:id", requireAuth, requireOrganization, requireRole("EDITOR"), async (c) => {
  const existing = await one<any>(
    "SELECT * FROM brand_kits WHERE id=$1 AND organization_id=$2",
    [c.req.param("id"), c.get("organizationId")],
  );
  if (!existing) throw new HTTPException(404, { message: "Brand kit not found" });
  if (existing.client_id && !(await canAccessClient(c.get("user").id, c.get("organizationId"), existing.client_id, "EDITOR"))) {
    throw new HTTPException(403, { message: "Client editor access required" });
  }
  await pool.query("DELETE FROM brand_kits WHERE id=$1", [existing.id]);
  return c.json({ ok: true });
});

// Client-scoped assets -------------------------------------------------------

advanced.get("/api/assets", requireAuth, requireOrganization, async (c) => {
  const category = c.req.query("category");
  const search = c.req.query("q")?.trim();
  const ids = await getAccessibleClientIds(c.get("user").id, c.get("organizationId"));
  const values: unknown[] = [c.get("organizationId")];
  const filters = ["organization_id=$1"];
  if (ids !== null) {
    values.push(ids);
    filters.push(`(client_id IS NULL OR client_id=ANY($${values.length}::uuid[]))`);
  }
  if (category) {
    values.push(category);
    filters.push(`category=$${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    filters.push(`(name ILIKE $${values.length} OR array_to_string(tags,' ') ILIKE $${values.length})`);
  }
  return c.json(
    await query(
      `SELECT id,client_id,name,category,tags,mime_type,size_bytes,license,author,source_url,
              attribution_required,created_at,'/api/assets/'||id||'/content' AS url
         FROM assets WHERE ${filters.join(" AND ")} ORDER BY created_at DESC LIMIT 200`,
      values,
    ),
  );
});

advanced.post("/api/uploads", requireAuth, requireOrganization, requireRole("EDITOR"), async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === "string") throw new HTTPException(400, { message: "No file provided" });
  if (file.size > 25 * 1024 * 1024) throw new HTTPException(413, { message: "File exceeds 25 MB" });
  const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
  if (!allowed.has(file.type)) throw new HTTPException(400, { message: "Unsupported image format" });
  const clientId = typeof form.client_id === "string" ? form.client_id : c.get("clientId");
  if (clientId && !(await canAccessClient(c.get("user").id, c.get("organizationId"), clientId, "EDITOR"))) {
    throw new HTTPException(403, { message: "Client editor access required" });
  }
  const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
  const key = `${c.get("organizationId")}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await putObject(key, bytes, file.type);
  const asset = await one<any>(
    `INSERT INTO assets(organization_id,client_id,uploaded_by,name,category,mime_type,size_bytes,storage_key)
     VALUES ($1,$2,$3,$4,'uploads',$5,$6,$7) RETURNING id`,
    [c.get("organizationId"), clientId ?? null, c.get("user").id, file.name, file.type, file.size, key],
  );
  return c.json({ url: `/api/assets/${asset.id}/content`, asset_id: asset.id }, 201);
});

advanced.get("/api/assets/:id/content", requireAuth, requireOrganization, async (c) => {
  const asset = await one<any>(
    "SELECT storage_key,mime_type,client_id FROM assets WHERE id=$1 AND organization_id=$2",
    [c.req.param("id"), c.get("organizationId")],
  );
  if (!asset) throw new HTTPException(404, { message: "Asset not found" });
  if (asset.client_id && !(await canAccessClient(c.get("user").id, c.get("organizationId"), asset.client_id))) {
    throw new HTTPException(404, { message: "Asset not found" });
  }
  const stored = await getObject(asset.storage_key, asset.mime_type);
  if (!stored) throw new HTTPException(404, { message: "Asset content not found" });
  return new Response(stored.data, {
    headers: { "Content-Type": stored.contentType, "Cache-Control": "private,max-age=31536000,immutable" },
  });
});

export default advanced;
