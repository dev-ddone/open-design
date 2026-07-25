import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { serveStatic } from "@hono/node-server/serve-static";
import { z } from "zod";
import {
  type AppVariables,
  type Role,
  createSessionToken,
  getMemberships,
  requireAuth,
  requireOrganization,
  requireRole,
} from "./auth.js";
import { config } from "./config.js";
import { one, pool, query, transaction } from "./db.js";
import { fetchIconifySvg, searchBuiltins, searchIconify } from "./elements.js";
import { getObject, putObject } from "./storage.js";

const app = new Hono<{ Variables: AppVariables }>();

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";
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

async function body<T extends z.ZodTypeAny>(c: any, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join(", ");
    throw new HTTPError(400, message);
  }
  return parsed.data;
}

class HTTPError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

app.onError((error, c) => {
  if (error instanceof HTTPError) {
    return c.json({ error: error.message }, error.status as 400);
  }
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/health", async (c) => {
  await pool.query("SELECT 1");
  return c.json({ status: "ok", version: "2.0.0-alpha.1" });
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
});

app.post("/api/auth/register", async (c) => {
  const input = await body(
    c,
    credentialsSchema.extend({
      name: z.string().trim().min(2).max(80),
      organizationName: z.string().trim().min(2).max(100),
    }),
  );

  const userCount = await one<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
  if (!config.registrationEnabled && Number(userCount?.count ?? 0) > 0) {
    throw new HTTPError(403, "Registration is disabled");
  }
  if (await one("SELECT id FROM users WHERE email = $1", [input.email])) {
    throw new HTTPError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await transaction(async (client) => {
    const createdUser = await client.query<{ id: string; email: string; name: string }>(
      `INSERT INTO users(email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [input.email, input.name, passwordHash],
    );
    const userRow = createdUser.rows[0];
    const organization = await client.query<{ id: string }>(
      `INSERT INTO organizations(name, slug, created_by)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [
        input.organizationName,
        `${slugify(input.organizationName)}-${crypto.randomUUID().slice(0, 6)}`,
        userRow.id,
      ],
    );
    await client.query(
      `INSERT INTO organization_members(organization_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [organization.rows[0].id, userRow.id],
    );
    return userRow;
  });

  setCookie(c, config.sessionCookieName, await createSessionToken(user), sessionCookieOptions());
  return c.json({ user, organizations: await getMemberships(user.id) }, 201);
});

app.post("/api/auth/login", async (c) => {
  const input = await body(c, credentialsSchema);
  const user = await one<{
    id: string;
    email: string;
    name: string;
    password_hash: string;
    disabled: boolean;
  }>("SELECT id, email, name, password_hash, disabled FROM users WHERE email = $1", [input.email]);
  if (!user || user.disabled || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw new HTTPError(401, "Invalid email or password");
  }
  const sessionUser = { id: user.id, email: user.email, name: user.name };
  setCookie(
    c,
    config.sessionCookieName,
    await createSessionToken(sessionUser),
    sessionCookieOptions(),
  );
  return c.json({ user: sessionUser, organizations: await getMemberships(user.id) });
});

app.post("/api/auth/logout", (c) => {
  deleteCookie(c, config.sessionCookieName, { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ user, organizations: await getMemberships(user.id) });
});

// ---------------------------------------------------------------------------
// Organizations, users, roles and clients
// ---------------------------------------------------------------------------

app.get("/api/organizations", requireAuth, async (c) => {
  return c.json(await getMemberships(c.get("user").id));
});

app.post("/api/organizations", requireAuth, async (c) => {
  const input = await body(c, z.object({ name: z.string().trim().min(2).max(100) }));
  const user = c.get("user");
  const organization = await transaction(async (client) => {
    const created = await client.query<{ id: string; name: string; slug: string }>(
      `INSERT INTO organizations(name, slug, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug`,
      [input.name, `${slugify(input.name)}-${crypto.randomUUID().slice(0, 6)}`, user.id],
    );
    await client.query(
      `INSERT INTO organization_members(organization_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [created.rows[0].id, user.id],
    );
    return { ...created.rows[0], role: "OWNER" as Role };
  });
  return c.json(organization, 201);
});

app.get(
  "/api/organization/members",
  requireAuth,
  requireOrganization,
  requireRole("ADMIN"),
  async (c) => {
    return c.json(
      await query(
        `SELECT u.id, u.email, u.name, om.role, om.created_at
           FROM organization_members om
           JOIN users u ON u.id = om.user_id
          WHERE om.organization_id = $1
          ORDER BY u.name`,
        [c.get("organizationId")],
      ),
    );
  },
);

app.post(
  "/api/organization/members",
  requireAuth,
  requireOrganization,
  requireRole("ADMIN"),
  async (c) => {
    const input = await body(
      c,
      z.object({
        email: z.string().email().transform((value) => value.toLowerCase()),
        role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
      }),
    );
    const user = await one<{ id: string }>("SELECT id FROM users WHERE email = $1", [input.email]);
    if (!user) throw new HTTPError(404, "The user must register before being added");
    await pool.query(
      `INSERT INTO organization_members(organization_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, user_id)
       DO UPDATE SET role = EXCLUDED.role`,
      [c.get("organizationId"), user.id, input.role],
    );
    return c.json({ ok: true }, 201);
  },
);

app.get("/api/clients", requireAuth, requireOrganization, async (c) => {
  return c.json(
    await query("SELECT * FROM clients WHERE organization_id = $1 ORDER BY name", [
      c.get("organizationId"),
    ]),
  );
});

app.post(
  "/api/clients",
  requireAuth,
  requireOrganization,
  requireRole("EDITOR"),
  async (c) => {
    const input = await body(
      c,
      z.object({ name: z.string().trim().min(2).max(120), notes: z.string().max(4000).optional() }),
    );
    const client = await one(
      `INSERT INTO clients(organization_id, name, slug, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        c.get("organizationId"),
        input.name,
        `${slugify(input.name)}-${crypto.randomUUID().slice(0, 5)}`,
        input.notes ?? null,
      ],
    );
    return c.json(client, 201);
  },
);

// ---------------------------------------------------------------------------
// Designs and pages. Response shapes remain compatible with the original UI.
// ---------------------------------------------------------------------------

app.get("/api/designs", requireAuth, requireOrganization, async (c) => {
  return c.json(
    await query(
      `SELECT id, organization_id, client_id, name, canvas_json, width, height,
              thumbnail_url, created_at, updated_at
         FROM designs
        WHERE organization_id = $1
        ORDER BY updated_at DESC`,
      [c.get("organizationId")],
    ),
  );
});

app.post(
  "/api/designs",
  requireAuth,
  requireOrganization,
  requireRole("EDITOR"),
  async (c) => {
    const input = await body(
      c,
      z.object({
        name: z.string().trim().min(1).max(180).optional(),
        canvas_json: z.string().optional(),
        width: z.number().int().min(64).max(16000).optional(),
        height: z.number().int().min(64).max(16000).optional(),
        client_id: z.string().uuid().nullable().optional(),
      }),
    );
    const organizationId = c.get("organizationId");
    if (input.client_id) {
      const client = await one(
        "SELECT id FROM clients WHERE id = $1 AND organization_id = $2",
        [input.client_id, organizationId],
      );
      if (!client) throw new HTTPError(400, "Invalid client");
    }
    const canvasJson = input.canvas_json ?? "{}";
    const design = await transaction(async (client) => {
      const created = await client.query<any>(
        `INSERT INTO designs(
           organization_id, client_id, created_by, name, canvas_json, width, height
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          organizationId,
          input.client_id ?? null,
          c.get("user").id,
          input.name ?? "Untitled Design",
          canvasJson,
          input.width ?? 1080,
          input.height ?? 1080,
        ],
      );
      await client.query(
        `INSERT INTO pages(design_id, title, canvas_json, sort_order)
         VALUES ($1, 'Page 1', $2, 0)`,
        [created.rows[0].id, canvasJson],
      );
      return created.rows[0];
    });
    return c.json(design, 201);
  },
);

app.get("/api/designs/:id", requireAuth, requireOrganization, async (c) => {
  const design = await one<any>(
    "SELECT * FROM designs WHERE id = $1 AND organization_id = $2",
    [c.req.param("id"), c.get("organizationId")],
  );
  if (!design) throw new HTTPError(404, "Design not found");
  const pages = await query(
    "SELECT * FROM pages WHERE design_id = $1 ORDER BY sort_order, created_at",
    [design.id],
  );
  return c.json({ ...design, pages });
});

app.put(
  "/api/designs/:id",
  requireAuth,
  requireOrganization,
  requireRole("EDITOR"),
  async (c) => {
    const input = await body(
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
    const existing = await one<any>(
      "SELECT * FROM designs WHERE id = $1 AND organization_id = $2",
      [c.req.param("id"), c.get("organizationId")],
    );
    if (!existing) throw new HTTPError(404, "Design not found");
    const updated = await one(
      `UPDATE designs
          SET name = $1, canvas_json = $2, width = $3, height = $4,
              thumbnail_url = $5, client_id = $6, updated_at = now()
        WHERE id = $7 AND organization_id = $8
        RETURNING *`,
      [
        input.name ?? existing.name,
        input.canvas_json ?? existing.canvas_json,
        input.width ?? existing.width,
        input.height ?? existing.height,
        input.thumbnail_url === undefined ? existing.thumbnail_url : input.thumbnail_url,
        input.client_id === undefined ? existing.client_id : input.client_id,
        existing.id,
        c.get("organizationId"),
      ],
    );
    return c.json(updated);
  },
);

app.delete(
  "/api/designs/:id",
  requireAuth,
  requireOrganization,
  requireRole("EDITOR"),
  async (c) => {
    const result = await pool.query(
      "DELETE FROM designs WHERE id = $1 AND organization_id = $2",
      [c.req.param("id"), c.get("organizationId")],
    );
    if (result.rowCount === 0) throw new HTTPError(404, "Design not found");
    return c.json({ ok: true });
  },
);

async function pageForOrganization(pageId: string, organizationId: string) {
  return one<any>(
    `SELECT p.* FROM pages p
      JOIN designs d ON d.id = p.design_id
     WHERE p.id = $1 AND d.organization_id = $2`,
    [pageId, organizationId],
  );
}

app.post(
  "/api/designs/:id/pages",
  requireAuth,
  requireOrganization,
  requireRole("EDITOR"),
  async (c) => {
    const design = await one(
      "SELECT id FROM designs WHERE id = $1 AND organization_id = $2",
      [c.req.param("id"), c.get("organizationId")],
    );
    if (!design) throw new HTTPError(404, "Design not found");
    const input = await body(
      c,
      z.object({
        title: z.string().trim().max(120).optional(),
        canvas_json: z.string().optional(),
        after_sort_order: z.number().int().optional(),
      }),
    );
    const page = await transaction(async (client) => {
      let order: number;
      if (input.after_sort_order !== undefined) {
        await client.query(
          "UPDATE pages SET sort_order = sort_order + 1 WHERE design_id = $1 AND sort_order > $2",
          [c.req.param("id"), input.after_sort_order],
        );
        order = input.after_sort_order + 1;
      } else {
        const maximum = await client.query<{ value: number }>(
          "SELECT COALESCE(MAX(sort_order), -1)::int AS value FROM pages WHERE design_id = $1",
          [c.req.param("id")],
        );
        order = maximum.rows[0].value + 1;
      }
      const count = await client.query<{ value: number }>(
        "SELECT COUNT(*)::int AS value FROM pages WHERE design_id = $1",
        [c.req.param("id")],
      );
      const created = await client.query<any>(
        `INSERT INTO pages(design_id, title, canvas_json, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
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
  },
);

app.post(
  "/api/pages/:pageId/duplicate",
  requireAuth,
  requireOrganization,
  requireRole("EDITOR"),
  async (c) => {
    const original = await pageForOrganization(c.req.param("pageId"), c.get("organizationId"));
    if (!original) throw new HTTPError(404, "Page not found");
    const page = await transaction(async (client) => {
      await client.query(
        "UPDATE pages SET sort_order = sort_order + 1 WHERE design_id = $1 AND sort_order > $2",
        [original.design_id, original.sort_order],
      );
      const created = await client.query<any>(
        `INSERT INTO pages(design_id, title, canvas_json, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          original.design_id,
          `${original.title} (copy)`,
          original.canvas_json,
          original.sort_order + 1,
        ],
      );
      return created.rows[0];
    });
    return c.json(page, 201);
  },
);

app.put(
  "/api/pages/:pageId",
  requireAuth,
  requireOrganization,
  requireRole("EDITOR"),
  async (c) => {
    const existing = await pageForOrganization(c.req.param("pageId"), c.get("organizationId"));
    if (!existing) throw new HTTPError(404, "Page not found");
    const input = await body(
      c,
      z.object({ title: z.string().trim().max(120).optional(), canvas_json: z.string().optional() }),
    );
    const updated = await one(
      `UPDATE pages
          SET title = $1, canvas_json = $2, updated_at = now()
        WHERE id = $3
        RETURNING *`,
      [input.title ?? existing.title, input.canvas_json ?? existing.canvas_json, existing.id],
    );
    await pool.query("UPDATE designs SET updated_at = now() WHERE id = $1", [existing.design_id]);
    return c.json(updated);
  },
);

app.delete(
  "/api/pages/:pageId",
  requireAuth,
  requireOrganization,
  requireRole("EDITOR"),
  async (c) => {
    const page = await pageForOrganization(c.req.param("pageId"), c.get("organizationId"));
    if (!page) throw new HTTPError(404, "Page not found");
    const count = await one<{ value: number }>(
      "SELECT COUNT(*)::int AS value FROM pages WHERE design_id = $1",
      [page.design_id],
    );
    if ((count?.value ?? 0) <= 1) throw new HTTPError(400, "Cannot delete the last page");
    await pool.query("DELETE FROM pages WHERE id = $1", [page.id]);
    return c.json({ ok: true });
  },
);

// ---------------------------------------------------------------------------
// Templates and brand kits
// ---------------------------------------------------------------------------

app.get("/api/templates", requireAuth, requireOrganization, async (c) => {
  return c.json(
    await query(
      `SELECT id, name, category, canvas_json, width, height, thumbnail_url, sort_order,
              organization_id, client_id, is_locked
         FROM templates
        WHERE organization_id IS NULL OR organization_id = $1
        ORDER BY sort_order, name`,
      [c.get("organizationId")],
    ),
  );
});

app.get("/api/templates/:id", requireAuth, requireOrganization, async (c) => {
  const template = await one(
    `SELECT * FROM templates
      WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)`,
    [c.req.param("id"), c.get("organizationId")],
  );
  if (!template) throw new HTTPError(404, "Template not found");
  return c.json(template);
});

app.get("/api/brand-kits", requireAuth, requireOrganization, async (c) => {
  return c.json(
    await query("SELECT * FROM brand_kits WHERE organization_id = $1 ORDER BY name", [
      c.get("organizationId"),
    ]),
  );
});

app.post(
  "/api/brand-kits",
  requireAuth,
  requireOrganization,
  requireRole("EDITOR"),
  async (c) => {
    const input = await body(
      c,
      z.object({
        name: z.string().trim().min(1).max(100),
        client_id: z.string().uuid().nullable().optional(),
        colors: z.array(z.string()).default([]),
        fonts: z.array(z.string()).default([]),
        logos: z.array(z.string()).default([]),
      }),
    );
    const kit = await one(
      `INSERT INTO brand_kits(organization_id, client_id, name, colors, fonts, logos)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
       RETURNING *`,
      [
        c.get("organizationId"),
        input.client_id ?? null,
        input.name,
        JSON.stringify(input.colors),
        JSON.stringify(input.fonts),
        JSON.stringify(input.logos),
      ],
    );
    return c.json(kit, 201);
  },
);

// ---------------------------------------------------------------------------
// Asset upload and retrieval
// ---------------------------------------------------------------------------

app.get("/api/assets", requireAuth, requireOrganization, async (c) => {
  const category = c.req.query("category");
  const search = c.req.query("q")?.trim();
  const values: unknown[] = [c.get("organizationId")];
  const filters = ["organization_id = $1"];
  if (category) {
    values.push(category);
    filters.push(`category = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    filters.push(`(name ILIKE $${values.length} OR array_to_string(tags, ' ') ILIKE $${values.length})`);
  }
  return c.json(
    await query(
      `SELECT id, client_id, name, category, tags, mime_type, size_bytes, license,
              author, source_url, attribution_required, created_at,
              '/api/assets/' || id || '/content' AS url
         FROM assets
        WHERE ${filters.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT 200`,
      values,
    ),
  );
});

app.post(
  "/api/uploads",
  requireAuth,
  requireOrganization,
  requireRole("EDITOR"),
  async (c) => {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!file || typeof file === "string") throw new HTTPError(400, "No file provided");
    if (file.size > 25 * 1024 * 1024) throw new HTTPError(413, "File exceeds the 25 MB limit");
    const allowed = new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ]);
    if (!allowed.has(file.type)) throw new HTTPError(400, "Unsupported image format");

    const organizationId = c.get("organizationId");
    const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
    const key = `${organizationId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await putObject(key, bytes, file.type);
    const asset = await one<any>(
      `INSERT INTO assets(
         organization_id, uploaded_by, name, category, mime_type, size_bytes, storage_key
       ) VALUES ($1, $2, $3, 'uploads', $4, $5, $6)
       RETURNING id`,
      [organizationId, c.get("user").id, file.name, file.type, file.size, key],
    );
    return c.json({ url: `/api/assets/${asset.id}/content`, asset_id: asset.id }, 201);
  },
);

app.get("/api/assets/:id/content", requireAuth, requireOrganization, async (c) => {
  const asset = await one<{ storage_key: string; mime_type: string }>(
    "SELECT storage_key, mime_type FROM assets WHERE id = $1 AND organization_id = $2",
    [c.req.param("id"), c.get("organizationId")],
  );
  if (!asset) throw new HTTPError(404, "Asset not found");
  const stored = await getObject(asset.storage_key, asset.mime_type);
  if (!stored) throw new HTTPError(404, "Asset content not found");
  return new Response(stored.data, {
    headers: {
      "Content-Type": stored.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});

// ---------------------------------------------------------------------------
// Searchable design element library
// ---------------------------------------------------------------------------

app.get("/api/elements/search", requireAuth, requireOrganization, async (c) => {
  const search = c.req.query("q") ?? "";
  const category = c.req.query("category") ?? "all";
  const builtins = searchBuiltins(search, category);
  let icons: Awaited<ReturnType<typeof searchIconify>> = [];
  if ((category === "all" || category === "icons") && search.trim().length >= 2) {
    try {
      icons = await searchIconify(search);
    } catch (error) {
      console.warn("Iconify search unavailable", error);
    }
  }
  return c.json([...builtins, ...icons]);
});

app.get(
  "/api/elements/iconify/:prefix/:name",
  requireAuth,
  requireOrganization,
  async (c) => {
    const svg = await fetchIconifySvg(c.req.param("prefix"), c.req.param("name"));
    if (!svg) throw new HTTPError(404, "Icon not found");
    return c.body(svg, 200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    });
  },
);

// Static production application. API routes above always take precedence.
app.use("/*", serveStatic({ root: "./dist" }));
app.get("*", async (c) => {
  const html = await readFile(resolve(process.cwd(), "dist/index.html"), "utf8");
  return c.html(html);
});

export default app;
