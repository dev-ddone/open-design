import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppVariables } from "./auth.js";
import {
  canAccessClient,
  canAccessDesign,
  requireAuth,
  requireOrganization,
  roleAtLeast,
} from "./auth.js";
import { one, pool, query } from "./db.js";

const studio = new Hono<{ Variables: AppVariables }>();

const pluginCommandSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(80).optional(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("open-url"), url: z.string().url() }),
    z.object({ type: z.literal("open-panel"), panel: z.string().trim().min(1).max(120) }),
    z.object({ type: z.literal("insert-element"), element: z.record(z.unknown()) }),
    z.object({ type: z.literal("http-request"), url: z.string().url(), method: z.enum(["GET", "POST"]).default("GET") }),
  ]),
});

const pluginManifestSchema = z.object({
  schemaVersion: z.literal(1),
  key: z.string().trim().min(2).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/),
  name: z.string().trim().min(2).max(160),
  version: z.string().trim().min(1).max(60),
  description: z.string().trim().max(1_000).optional(),
  homepage: z.string().url().optional(),
  permissions: z.array(z.enum(["canvas:read", "canvas:write", "network", "assets:read"])).default([]),
  commands: z.array(pluginCommandSchema).max(100).default([]),
  settings: z.array(z.object({
    key: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(160),
    type: z.enum(["text", "number", "boolean", "select"]),
    required: z.boolean().default(false),
    options: z.array(z.string().max(160)).max(100).optional(),
    default: z.unknown().optional(),
  })).max(100).default([]),
});

async function requireDesign(c: any, designId: string, minimum: "VIEWER" | "EDITOR") {
  const access = await canAccessDesign(c.get("user").id, designId, minimum);
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(minimum === "VIEWER" ? 404 : 403, { message: "Design access required" });
  }
  return access;
}

studio.get("/api/notifications", requireAuth, requireOrganization, async (c) => {
  const unreadOnly = c.req.query("unread") === "true";
  const limit = Math.min(Math.max(Number.parseInt(c.req.query("limit") ?? "50", 10) || 50, 1), 200);
  return c.json(await query(
    `SELECT n.id,n.kind,n.title,n.body,n.payload,n.design_id,n.comment_id,n.read_at,n.created_at,
            d.name AS design_name
       FROM notifications n
       LEFT JOIN designs d ON d.id=n.design_id
      WHERE n.organization_id=$1 AND n.user_id=$2
        AND ($3::boolean=false OR n.read_at IS NULL)
      ORDER BY n.read_at NULLS FIRST,n.created_at DESC
      LIMIT $4`,
    [c.get("organizationId"), c.get("user").id, unreadOnly, limit],
  ));
});

studio.patch("/api/notifications/:notificationId", requireAuth, requireOrganization, async (c) => {
  const input = z.object({ read: z.boolean() }).safeParse(await c.req.json().catch(() => ({})));
  if (!input.success) throw new HTTPException(400, { message: "Invalid notification update" });
  const updated = await one(
    `UPDATE notifications
        SET read_at=CASE WHEN $4 THEN now() ELSE NULL END
      WHERE id=$1 AND organization_id=$2 AND user_id=$3
      RETURNING id,read_at`,
    [c.req.param("notificationId"), c.get("organizationId"), c.get("user").id, input.data.read],
  );
  if (!updated) throw new HTTPException(404, { message: "Notification not found" });
  return c.json(updated);
});

studio.post("/api/notifications/read-all", requireAuth, requireOrganization, async (c) => {
  await pool.query(
    "UPDATE notifications SET read_at=now() WHERE organization_id=$1 AND user_id=$2 AND read_at IS NULL",
    [c.get("organizationId"), c.get("user").id],
  );
  return c.json({ ok: true });
});

studio.get("/api/organization/mentionable-users", requireAuth, requireOrganization, async (c) => {
  return c.json(await query(
    `SELECT u.id,u.name,u.email,om.role
       FROM organization_members om
       JOIN users u ON u.id=om.user_id
      WHERE om.organization_id=$1 AND u.disabled=false
      ORDER BY u.name,u.email`,
    [c.get("organizationId")],
  ));
});

studio.get("/api/designs/:designId/governance", requireAuth, requireOrganization, async (c) => {
  const designId = c.req.param("designId");
  await requireDesign(c, designId, "VIEWER");
  return c.json(await query(
    `SELECT ge.id,ge.event_type,ge.payload,ge.created_at,
            u.name AS created_by_name,u.email AS created_by_email
       FROM design_governance_events ge
       LEFT JOIN users u ON u.id=ge.created_by
      WHERE ge.design_id=$1 AND ge.organization_id=$2
      ORDER BY ge.created_at DESC
      LIMIT 500`,
    [designId, c.get("organizationId")],
  ));
});

studio.post("/api/designs/:designId/governance", requireAuth, requireOrganization, async (c) => {
  const designId = c.req.param("designId");
  await requireDesign(c, designId, "EDITOR");
  const parsed = z.object({
    eventType: z.enum([
      "EXPORT_STARTED",
      "EXPORT_OVERRIDE",
      "REVIEW_REQUESTED",
      "REVIEW_APPROVED",
      "REVIEW_CHANGES_REQUESTED",
      "REVIEW_DRAFTED",
      "BRAND_MIGRATION",
      "BATCH_EXPORT",
      "PLUGIN_ACTION",
    ]),
    payload: z.record(z.unknown()).default({}),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues.map((issue) => issue.message).join(", ") });
  const event = await one(
    `INSERT INTO design_governance_events(organization_id,design_id,event_type,payload,created_by)
     VALUES ($1,$2,$3,$4::jsonb,$5)
     RETURNING id,event_type,payload,created_at`,
    [c.get("organizationId"), designId, parsed.data.eventType, JSON.stringify(parsed.data.payload), c.get("user").id],
  );
  return c.json(event, 201);
});

studio.get("/api/plugins", requireAuth, requireOrganization, async (c) => {
  const clientId = c.get("clientId") as string | null;
  return c.json(await query(
    `SELECT id,plugin_key,name,manifest,configuration,enabled,client_id,created_at,updated_at
       FROM plugin_installations
      WHERE organization_id=$1
        AND (client_id IS NULL OR client_id=$2::uuid)
      ORDER BY name,plugin_key`,
    [c.get("organizationId"), clientId],
  ));
});

studio.post("/api/plugins", requireAuth, requireOrganization, async (c) => {
  if (!roleAtLeast(c.get("role"), "ADMIN")) throw new HTTPException(403, { message: "Administrator role required" });
  const parsed = z.object({
    clientId: z.string().uuid().nullable().optional(),
    manifest: pluginManifestSchema,
    configuration: z.record(z.unknown()).default({}),
    enabled: z.boolean().default(true),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues.map((issue) => issue.message).join(", ") });
  if (parsed.data.clientId && !(await canAccessClient(c.get("user").id, c.get("organizationId"), parsed.data.clientId, "EDITOR"))) {
    throw new HTTPException(403, { message: "Client access required" });
  }
  const plugin = await one(
    `INSERT INTO plugin_installations(
       organization_id,client_id,plugin_key,name,manifest,configuration,enabled,created_by
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)
     ON CONFLICT (organization_id,client_id,plugin_key) DO UPDATE SET
       name=EXCLUDED.name,manifest=EXCLUDED.manifest,configuration=EXCLUDED.configuration,
       enabled=EXCLUDED.enabled,updated_at=now()
     RETURNING id,plugin_key,name,manifest,configuration,enabled,client_id,created_at,updated_at`,
    [
      c.get("organizationId"),
      parsed.data.clientId ?? null,
      parsed.data.manifest.key,
      parsed.data.manifest.name,
      JSON.stringify(parsed.data.manifest),
      JSON.stringify(parsed.data.configuration),
      parsed.data.enabled,
      c.get("user").id,
    ],
  );
  return c.json(plugin, 201);
});

studio.put("/api/plugins/:pluginId", requireAuth, requireOrganization, async (c) => {
  if (!roleAtLeast(c.get("role"), "ADMIN")) throw new HTTPException(403, { message: "Administrator role required" });
  const parsed = z.object({
    enabled: z.boolean().optional(),
    configuration: z.record(z.unknown()).optional(),
  }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid plugin update" });
  const existing = await one<any>(
    "SELECT * FROM plugin_installations WHERE id=$1 AND organization_id=$2",
    [c.req.param("pluginId"), c.get("organizationId")],
  );
  if (!existing) throw new HTTPException(404, { message: "Plugin not found" });
  return c.json(await one(
    `UPDATE plugin_installations
        SET enabled=$1,configuration=$2::jsonb,updated_at=now()
      WHERE id=$3
      RETURNING id,plugin_key,name,manifest,configuration,enabled,client_id,created_at,updated_at`,
    [parsed.data.enabled ?? existing.enabled, JSON.stringify(parsed.data.configuration ?? existing.configuration), existing.id],
  ));
});

studio.delete("/api/plugins/:pluginId", requireAuth, requireOrganization, async (c) => {
  if (!roleAtLeast(c.get("role"), "ADMIN")) throw new HTTPException(403, { message: "Administrator role required" });
  const result = await pool.query(
    "DELETE FROM plugin_installations WHERE id=$1 AND organization_id=$2",
    [c.req.param("pluginId"), c.get("organizationId")],
  );
  if (result.rowCount === 0) throw new HTTPException(404, { message: "Plugin not found" });
  return c.json({ ok: true });
});

export default studio;