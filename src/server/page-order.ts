import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppVariables } from "./auth.js";
import { canAccessDesign, requireAuth, requireOrganization } from "./auth.js";
import { query, transaction } from "./db.js";

const pageOrder = new Hono<{ Variables: AppVariables }>();

const orderPayload = z.object({
  pageIds: z.array(z.string().uuid()).min(1).max(500),
});

pageOrder.put("/api/designs/:designId/pages/order", requireAuth, requireOrganization, async (c) => {
  const designId = c.req.param("designId");
  const access = await canAccessDesign(c.get("user").id, designId, "EDITOR");
  if (!access || access.organizationId !== c.get("organizationId")) {
    throw new HTTPException(403, { message: "Design editor access required" });
  }

  const parsed = orderPayload.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues.map((issue) => issue.message).join(", ") });
  }
  if (new Set(parsed.data.pageIds).size !== parsed.data.pageIds.length) {
    throw new HTTPException(400, { message: "Page order contains duplicate ids" });
  }

  const existing = await query<{ id: string }>(
    "SELECT id FROM pages WHERE design_id=$1 ORDER BY sort_order,created_at",
    [designId],
  );
  const currentIds = existing.map((page) => page.id);
  const submitted = new Set(parsed.data.pageIds);
  if (currentIds.length !== submitted.size || currentIds.some((id) => !submitted.has(id))) {
    throw new HTTPException(409, { message: "Page list changed; reload before reordering" });
  }

  await transaction(async (client) => {
    for (let index = 0; index < parsed.data.pageIds.length; index += 1) {
      await client.query(
        "UPDATE pages SET sort_order=$1,updated_at=now() WHERE id=$2 AND design_id=$3",
        [index, parsed.data.pageIds[index], designId],
      );
    }
    await client.query("UPDATE designs SET updated_at=now() WHERE id=$1", [designId]);
  });

  return c.json(await query(
    "SELECT id,title,canvas_json,sort_order,created_at,updated_at FROM pages WHERE design_id=$1 ORDER BY sort_order,created_at",
    [designId],
  ));
});

export default pageOrder;
