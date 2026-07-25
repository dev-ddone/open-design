import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppVariables } from "./auth.js";
import { requireAuth } from "./auth.js";
import { one } from "./db.js";
import { getObject } from "./storage.js";

const content = new Hono<{ Variables: AppVariables }>();

content.get("/api/assets/:id/content", requireAuth, async (c) => {
  const asset = await one<{ storage_key: string; mime_type: string }>(
    `SELECT a.storage_key, a.mime_type
       FROM assets a
       JOIN organization_members om
         ON om.organization_id = a.organization_id
        AND om.user_id = $2
       LEFT JOIN client_members cm
         ON cm.client_id = a.client_id
        AND cm.user_id = $2
      WHERE a.id = $1
        AND (om.all_clients = TRUE OR a.client_id IS NULL OR cm.user_id IS NOT NULL)
      LIMIT 1`,
    [c.req.param("id"), c.get("user").id],
  );
  if (!asset) throw new HTTPException(404, { message: "Asset not found" });

  const stored = await getObject(asset.storage_key, asset.mime_type);
  if (!stored) throw new HTTPException(404, { message: "Asset content not found" });
  return new Response(stored.data, {
    headers: {
      "Content-Type": stored.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export default content;
