import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";
import { one, query } from "./db.js";

export type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

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
}

export type AppVariables = {
  user: SessionUser;
  organizationId: string;
  role: Role;
};

const secret = new TextEncoder().encode(config.jwtSecret);

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
    `SELECT o.id, o.name, o.slug, om.role
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
    const requested = c.req.header("X-Organization-ID");
    const memberships = await getMemberships(user.id);
    const membership = requested
      ? memberships.find((item) => item.id === requested)
      : memberships[0];
    if (!membership) return c.json({ error: "Organization access required" }, 403);
    c.set("organizationId", membership.id);
    c.set("role", membership.role);
    await next();
  },
);

const ROLE_LEVEL: Record<Role, number> = {
  VIEWER: 10,
  EDITOR: 20,
  ADMIN: 30,
  OWNER: 40,
};

export function requireRole(minimum: Role) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const role = c.get("role");
    if (ROLE_LEVEL[role] < ROLE_LEVEL[minimum]) {
      return c.json({ error: "Insufficient permissions" }, 403);
    }
    await next();
  });
}

export async function canAccessDesign(
  userId: string,
  designId: string,
  minimum: Role = "VIEWER",
): Promise<{ organizationId: string; role: Role } | null> {
  const row = await one<{ organization_id: string; role: Role }>(
    `SELECT d.organization_id, om.role
       FROM designs d
       JOIN organization_members om ON om.organization_id = d.organization_id
      WHERE d.id = $1 AND om.user_id = $2`,
    [designId, userId],
  );
  if (!row || ROLE_LEVEL[row.role] < ROLE_LEVEL[minimum]) return null;
  return { organizationId: row.organization_id, role: row.role };
}
