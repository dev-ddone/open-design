import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppVariables } from "./auth.js";
import { requireAuth, requireOrganization } from "./auth.js";
import { one } from "./db.js";

const preferences = new Hono<{ Variables: AppVariables }>();

const recentItem = z.object({
  id: z.string().min(1).max(500),
  name: z.string().max(300),
  category: z.string().max(80),
  tags: z.array(z.string().max(100)).max(60).default([]),
  provider: z.string().max(100),
  providerLabel: z.string().max(200),
  kind: z.enum(["vector", "image"]),
  format: z.enum(["svg", "png", "jpg", "webp", "other"]).optional(),
  transparent: z.boolean().optional(),
  license: z.string().max(300),
  licenseUrl: z.string().url().max(2_000).optional(),
  author: z.string().max(500).optional(),
  sourceUrl: z.string().url().max(2_000).optional(),
  attribution: z.string().max(1_000).optional(),
  attributionRequired: z.boolean(),
  previewUrl: z.string().max(2_000).optional(),
  assetUrl: z.string().max(2_000).optional(),
  svg: z.string().max(300_000).optional(),
  width: z.number().positive().max(20_000).optional(),
  height: z.number().positive().max(20_000).optional(),
  recolorable: z.boolean().optional(),
});

const collection = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  elementIds: z.array(z.string().min(1).max(500)).max(500),
});

const payloadSchema = z.object({
  favoriteIds: z.array(z.string().min(1).max(500)).max(1_000),
  recentItems: z.array(recentItem).max(40),
  collections: z.array(collection).max(50).default([]),
});

preferences.get("/api/element-preferences", requireAuth, requireOrganization, async (c) => {
  const row = await one<{
    favorite_ids: unknown;
    recent_items: unknown;
    collections: unknown;
  }>(
    `SELECT favorite_ids, recent_items, collections
       FROM element_preferences
      WHERE user_id=$1 AND organization_id=$2`,
    [c.get("user").id, c.get("organizationId")],
  );
  return c.json({
    favoriteIds: Array.isArray(row?.favorite_ids) ? row.favorite_ids : [],
    recentItems: Array.isArray(row?.recent_items) ? row.recent_items : [],
    collections: Array.isArray(row?.collections) ? row.collections : [],
  });
});

preferences.put("/api/element-preferences", requireAuth, requireOrganization, async (c) => {
  const parsed = payloadSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues.map((issue) => issue.message).join(", "),
    });
  }
  await one(
    `INSERT INTO element_preferences(user_id,organization_id,favorite_ids,recent_items,collections,updated_at)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,now())
     ON CONFLICT (user_id,organization_id) DO UPDATE SET
       favorite_ids=EXCLUDED.favorite_ids,
       recent_items=EXCLUDED.recent_items,
       collections=EXCLUDED.collections,
       updated_at=now()
     RETURNING user_id`,
    [
      c.get("user").id,
      c.get("organizationId"),
      JSON.stringify(parsed.data.favoriteIds),
      JSON.stringify(parsed.data.recentItems),
      JSON.stringify(parsed.data.collections),
    ],
  );
  return c.json({ ok: true });
});

export default preferences;
