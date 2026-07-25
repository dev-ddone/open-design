import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";
import { one, query } from "./db.js";

export type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
export type ClientRole = "EDITOR" | "VIEWER";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface OrganizationMembership {
  id: string;
  name: string;
  slug: string;
  role: Role;
  all_clients: boolean;
}

export type AppVariables = {
  user: SessionUser;
  organizationId: string;
  organizationRole: Role;
  role: Role;
  allClients: boolean;
  clientId: string | null;
};

const secret = new TextEncoder().encode(config.jwtSecret);

export const ROLE_LEVEL: Record<Role, number> = {
  VIEWER: 10,
  EDITOR: 20,
  ADMIN: 30,
  OWNER: 40,
};

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

export function minimumRole(first: Role, second: Role): Role {
  return ROLE_LEVEL[first] <= ROLE_LEVEL[second] ? first : second;
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${config.sessionTtlDays}d`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.name !== "string") {
      return null;
    }
    const user = await one<SessionUser & { disabled: boolean }>(
      "SELECT id, email, name, disabled FROM users WHERE id = $1",
      [payload.sub],
    );
    if (!user || user.disabled) return null;
    return { id: user.id, email: user.email, name: user.name };
  } catch {
    return null;
  }
}

export function tokenFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = pair.trim().split("=");
    if (rawName === config.sessionCookieName) {
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return null;
}

export async function getMemberships(userId: string): Promise<OrganizationMembership[]> {
  return query<OrganizationMembership>(
    `SELECT o.id, o.name, o.slug, om.role, om.all_clients
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
      WHERE om.user_id = $1
      ORDER BY o.name`,
    [userId],
  );
}

export const requireAuth = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const token = getCookie(c, config.sessionCookieName);
  const user = token ? await verifySessionToken(token) : null;
  if (!user) return c.json({ error: "Authentication required" }, 401);
  c.set("user", user);
  await next();
});

export const requireOrganization = createMiddleware<{ Variables: AppVariables }>(
  async (c, next) => {
    const user = c.get("user");
    const requestedOrganization = c.req.header("X-Organization-ID");
    const requestedClient = c.req.header("X-Client-ID") ?? null;
    const memberships = await getMemberships(user.id);
    const membership = requestedOrganization
      ? memberships.find((item) => item.id === requestedOrganization)
      : memberships[0];
    if (!membership) return c.json({ error: "Organization access required" }, 403);

    let effectiveRole: Role = membership.role;
    if (requestedClient) {
      const client = await one<{ id: string }>(
        "SELECT id FROM clients WHERE id = $1 AND organization_id = $2",
        [requestedClient, membership.id],
      );
      if (!client) return c.json({ error: "Client not found" }, 404);

      if (!membership.all_clients && !roleAtLeast(membership.role, "ADMIN")) {
        const clientMembership = await one<{ role: ClientRole }>(
          "SELECT role FROM client_members WHERE client_id = $1 AND user_id = $2",
          [requestedClient, user.id],
        );
        if (!clientMembership) return c.json({ error: "Client access required" }, 403);
        effectiveRole = minimumRole(membership.role, clientMembership.role);
      }
    } else if (!membership.all_clients && !roleAtLeast(membership.role, "ADMIN")) {
      effectiveRole = "VIEWER";
    }

    c.set("organizationId", membership.id);
    c.set("organizationRole", membership.role);
    c.set("role", effectiveRole);
    c.set("allClients", membership.all_clients || roleAtLeast(membership.role, "ADMIN"));
    c.set("clientId", requestedClient);
    await next();
  },
);

export function requireRole(minimum: Role) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const role = c.get("role");
    if (!roleAtLeast(role, minimum)) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }
    await next();
  });
}

export async function getAccessibleClientIds(
  userId: string,
  organizationId: string,
): Promise<string[] | null> {
  const membership = await one<{ role: Role; all_clients: boolean }>(
    `SELECT role, all_clients FROM organization_members
      WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId],
  );
  if (!membership) return [];
  if (membership.all_clients || roleAtLeast(membership.role, "ADMIN")) return null;
  const rows = await query<{ client_id: string }>(
    "SELECT client_id FROM client_members WHERE user_id = $1",
    [userId],
  );
  return rows.map((row) => row.client_id);
}

export async function canAccessClient(
  userId: string,
  organizationId: string,
  clientId: string,
  minimum: Role = "VIEWER",
): Promise<{ role: Role } | null> {
  const membership = await one<{ role: Role; all_clients: boolean }>(
    `SELECT role, all_clients FROM organization_members
      WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId],
  );
  if (!membership) return null;
  const client = await one("SELECT id FROM clients WHERE id = $1 AND organization_id = $2", [
    clientId,
    organizationId,
  ]);
  if (!client) return null;
  let role = membership.role;
  if (!membership.all_clients && !roleAtLeast(membership.role, "ADMIN")) {
    const clientMembership = await one<{ role: ClientRole }>(
      "SELECT role FROM client_members WHERE client_id = $1 AND user_id = $2",
      [clientId, userId],
    );
    if (!clientMembership) return null;
    role = minimumRole(role, clientMembership.role);
  }
  if (!roleAtLeast(role, minimum)) return null;
  return { role };
}

export async function canAccessDesign(
  userId: string,
  designId: string,
  minimum: Role = "VIEWER",
): Promise<{ organizationId: string; clientId: string | null; role: Role } | null> {
  const row = await one<{
    organization_id: string;
    client_id: string | null;
    organization_role: Role;
    all_clients: boolean;
    client_role: ClientRole | null;
  }>(
    `SELECT d.organization_id, d.client_id, om.role AS organization_role, om.all_clients,
            cm.role AS client_role
       FROM designs d
       JOIN organization_members om
         ON om.organization_id = d.organization_id AND om.user_id = $2
       LEFT JOIN client_members cm
         ON cm.client_id = d.client_id AND cm.user_id = $2
      WHERE d.id = $1`,
    [designId, userId],
  );
  if (!row) return null;
  let role = row.organization_role;
  if (!row.all_clients && !roleAtLeast(row.organization_role, "ADMIN")) {
    if (!row.client_id || !row.client_role) return null;
    role = minimumRole(role, row.client_role);
  }
  if (!roleAtLeast(role, minimum)) return null;
  return { organizationId: row.organization_id, clientId: row.client_id, role };
}
