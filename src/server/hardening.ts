import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  type AppVariables,
  canAccessClient,
  getAccessibleClientIds,
  requireAuth,
  requireOrganization,
  roleAtLeast,
} from "./auth.js";
import { one, pool, query } from "./db.js";
import { putObject } from "./storage.js";
import { validateSvgBytes } from "./svg-security.js";

const hardening = new Hono<{ Variables: AppVariables }>();

async function parseBody<T extends z.ZodTypeAny>(c: any, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues.map((issue) => issue.message).join(", "),
    });
  }
  return parsed.data;
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "client";
}

hardening.post("/api/clients", requireAuth, requireOrganization, async (c) => {
  const organizationRole = c.get("organizationRole");
  if (!roleAtLeast(organizationRole, "ADMIN") && !(organizationRole === "EDITOR" && c.get("allClients"))) {
    throw new HTTPException(403, { message: "Only administrators or all-client editors can create clients" });
  }
  const input = await parseBody(
    c,
    z.object({
      name: z.string().trim().min(2).max(120),
      notes: z.string().trim().max(4_000).optional(),
    }),
  );
  const client = await one<any>(
    `INSERT INTO clients(organization_id,name,slug,notes)
     VALUES ($1,$2,$3,$4) RETURNING *, 'EDITOR'::text AS access_role`,
    [
      c.get("organizationId"),
      input.name,
      `${slugify(input.name)}-${crypto.randomUUID().slice(0, 5)}`,
      input.notes ?? null,
    ],
  );
  return c.json(client, 201);
});

hardening.get("/api/templates/:id", requireAuth, requireOrganization, async (c) => {
  const template = await one<any>(
    `SELECT * FROM templates
      WHERE id=$1 AND (organization_id IS NULL OR organization_id=$2)`,
    [c.req.param("id"), c.get("organizationId")],
  );
  if (!template) throw new HTTPException(404, { message: "Template not found" });
  if (template.client_id) {
    const access = await canAccessClient(
      c.get("user").id,
      c.get("organizationId"),
      template.client_id,
      "VIEWER",
    );
    if (!access) throw new HTTPException(404, { message: "Template not found" });
  } else if (template.organization_id) {
    const ids = await getAccessibleClientIds(c.get("user").id, c.get("organizationId"));
    if (ids !== null && !c.get("allClients")) {
      // Organization-wide templates are visible, but never reveal another client's template.
      template.client_id = null;
    }
  }
  return c.json(template);
});

hardening.post("/api/uploads", requireAuth, requireOrganization, async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === "string") throw new HTTPException(400, { message: "No file provided" });
  if (file.size > 25 * 1024 * 1024) throw new HTTPException(413, { message: "File exceeds the 25 MB limit" });
  const allowed = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ]);
  if (!allowed.has(file.type)) throw new HTTPException(400, { message: "Unsupported image format" });

  const clientId = typeof form.client_id === "string" && form.client_id ? form.client_id : c.get("clientId");
  if (clientId) {
    const access = await canAccessClient(c.get("user").id, c.get("organizationId"), clientId, "EDITOR");
    if (!access) throw new HTTPException(403, { message: "Client editor access required" });
  } else if (!c.get("allClients") || !roleAtLeast(c.get("organizationRole"), "EDITOR")) {
    throw new HTTPException(403, { message: "Select an editable client before uploading" });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === "image/svg+xml") {
    try {
      validateSvgBytes(bytes);
    } catch (error) {
      throw new HTTPException(400, {
        message: error instanceof Error ? error.message : "Unsafe SVG document",
      });
    }
  }

  const extensionByMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  const extension = extensionByMime[file.type];
  const key = `${c.get("organizationId")}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  await putObject(key, bytes, file.type);
  const asset = await one<any>(
    `INSERT INTO assets(
       organization_id,client_id,uploaded_by,name,category,mime_type,size_bytes,storage_key
     ) VALUES ($1,$2,$3,$4,'uploads',$5,$6,$7)
     RETURNING id,client_id,name,mime_type,size_bytes`,
    [
      c.get("organizationId"),
      clientId ?? null,
      c.get("user").id,
      file.name,
      file.type,
      file.size,
      key,
    ],
  );
  return c.json({ ...asset, url: `/api/assets/${asset.id}/content`, asset_id: asset.id }, 201);
});

hardening.delete("/api/clients/:id", requireAuth, requireOrganization, async (c) => {
  if (!roleAtLeast(c.get("organizationRole"), "ADMIN")) {
    throw new HTTPException(403, { message: "Administrator access required" });
  }
  const linked = await one<{ designs: number; assets: number; templates: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM designs WHERE client_id=$1) AS designs,
       (SELECT COUNT(*)::int FROM assets WHERE client_id=$1) AS assets,
       (SELECT COUNT(*)::int FROM templates WHERE client_id=$1) AS templates`,
    [c.req.param("id")],
  );
  if ((linked?.designs ?? 0) + (linked?.assets ?? 0) + (linked?.templates ?? 0) > 0) {
    throw new HTTPException(409, { message: "Client still contains designs, assets or templates" });
  }
  const result = await pool.query(
    "DELETE FROM clients WHERE id=$1 AND organization_id=$2",
    [c.req.param("id"), c.get("organizationId")],
  );
  if (result.rowCount === 0) throw new HTTPException(404, { message: "Client not found" });
  return c.json({ ok: true });
});

export default hardening;
