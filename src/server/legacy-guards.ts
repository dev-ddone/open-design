import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  type AppVariables,
  canAccessClient,
  requireAuth,
  requireOrganization,
  roleAtLeast,
} from "./auth.js";
import { one } from "./db.js";

const guards = new Hono<{ Variables: AppVariables }>();

async function parseBody<T extends z.ZodTypeAny>(c: any, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues.map((issue) => issue.message).join(", "),
    });
  }
  return parsed.data;
}

guards.post("/api/organization/members", requireAuth, requireOrganization, async () => {
  throw new HTTPException(410, {
    message: "Direct member addition has been replaced by secure email invitations",
  });
});

guards.get("/api/clients/:id", requireAuth, requireOrganization, async (c) => {
  const access = await canAccessClient(
    c.get("user").id,
    c.get("organizationId"),
    c.req.param("id"),
    "VIEWER",
  );
  if (!access) throw new HTTPException(404, { message: "Client not found" });
  const client = await one<any>(
    "SELECT *, $3::text AS access_role FROM clients WHERE id=$1 AND organization_id=$2",
    [c.req.param("id"), c.get("organizationId"), access.role],
  );
  if (!client) throw new HTTPException(404, { message: "Client not found" });
  return c.json(client);
});

guards.put("/api/clients/:id", requireAuth, requireOrganization, async (c) => {
  if (!roleAtLeast(c.get("organizationRole"), "ADMIN")) {
    throw new HTTPException(403, { message: "Administrator access required" });
  }
  const input = await parseBody(
    c,
    z.object({
      name: z.string().trim().min(2).max(120).optional(),
      notes: z.string().trim().max(4_000).nullable().optional(),
    }),
  );
  const existing = await one<any>(
    "SELECT * FROM clients WHERE id=$1 AND organization_id=$2",
    [c.req.param("id"), c.get("organizationId")],
  );
  if (!existing) throw new HTTPException(404, { message: "Client not found" });
  const updated = await one<any>(
    `UPDATE clients SET name=$1,notes=$2,updated_at=now()
      WHERE id=$3 RETURNING *, 'EDITOR'::text AS access_role`,
    [
      input.name ?? existing.name,
      input.notes === undefined ? existing.notes : input.notes,
      existing.id,
    ],
  );
  return c.json(updated);
});

export default guards;
