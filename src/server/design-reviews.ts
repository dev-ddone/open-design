import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppVariables } from "./auth.js";
import { requireAuth, requireOrganization, roleAtLeast } from "./auth.js";
import { one, query } from "./db.js";

const reviews = new Hono<{ Variables: AppVariables }>();

const anchorValue = z.number().finite().min(0).max(1).nullable();
const commentPayload = z.object({
  body: z.string().trim().min(1).max(4_000),
  pageId: z.string().uuid().nullable().optional(),
  objectId: z.string().trim().min(1).max(500).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  anchorX: anchorValue.optional(),
  anchorY: anchorValue.optional(),
});
const commentUpdatePayload = z.object({
  resolved: z.boolean().optional(),
  anchorX: anchorValue.optional(),
  anchorY: anchorValue.optional(),
});

const reviewPayload = z.object({
  status: z.enum(["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED"]),
  note: z.string().trim().max(4_000).nullable().optional(),
});

function extractMentions(body: string): string[] {
  const mentions = new Set<string>();
  const expression = /(^|\s)@([a-z0-9._-]+(?:@[a-z0-9.-]+)?)/gi;
  for (const match of body.matchAll(expression)) {
    const value = match[2]?.trim().toLowerCase();
    if (value) mentions.add(value);
  }
  return [...mentions].slice(0, 25);
}

async function requireDesignAccess(c: any, designId: string): Promise<{ id: string; client_id: string | null }> {
  const organizationId = c.get("organizationId") as string;
  const clientId = c.get("clientId") as string | null;
  const allClients = c.get("allClients") as boolean;
  if (!allClients && !clientId) throw new HTTPException(403, { message: "Client access required" });

  const design = await one<{ id: string; client_id: string | null }>(
    `SELECT id, client_id
       FROM designs
      WHERE id=$1
        AND organization_id=$2
        AND ($3::uuid IS NULL OR client_id IS NULL OR client_id=$3::uuid)`,
    [designId, organizationId, clientId],
  );
  if (!design) throw new HTTPException(404, { message: "Design not found" });
  return design;
}

reviews.get("/api/designs/:designId/review", requireAuth, requireOrganization, async (c) => {
  const designId = c.req.param("designId");
  await requireDesignAccess(c, designId);

  const review = await one<any>(
    `SELECT dr.design_id,dr.status,dr.note,dr.requested_at,dr.reviewed_at,dr.updated_at,
            requester.name AS requested_by_name,reviewer.name AS reviewed_by_name
       FROM design_reviews dr
       LEFT JOIN users requester ON requester.id=dr.requested_by
       LEFT JOIN users reviewer ON reviewer.id=dr.reviewed_by
      WHERE dr.design_id=$1`,
    [designId],
  );
  const comments = await query<any>(
    `SELECT dc.id,dc.design_id,dc.page_id,dc.object_id,dc.parent_id,dc.body,
            dc.anchor_x,dc.anchor_y,dc.mentions,
            dc.resolved_at,dc.created_at,dc.updated_at,
            author.id AS author_id,author.name AS author_name,author.email AS author_email,
            resolver.name AS resolved_by_name
       FROM design_comments dc
       JOIN users author ON author.id=dc.author_id
       LEFT JOIN users resolver ON resolver.id=dc.resolved_by
      WHERE dc.design_id=$1
      ORDER BY dc.resolved_at NULLS FIRST,dc.created_at DESC`,
    [designId],
  );
  return c.json({
    review: review ?? {
      design_id: designId,
      status: "DRAFT",
      note: null,
      requested_at: null,
      reviewed_at: null,
      updated_at: null,
      requested_by_name: null,
      reviewed_by_name: null,
    },
    comments,
    canReview: roleAtLeast(c.get("role"), "EDITOR"),
  });
});

reviews.post("/api/designs/:designId/comments", requireAuth, requireOrganization, async (c) => {
  const designId = c.req.param("designId");
  await requireDesignAccess(c, designId);
  const parsed = commentPayload.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues.map((issue) => issue.message).join(", ") });

  if (parsed.data.pageId) {
    const page = await one<{ id: string }>("SELECT id FROM pages WHERE id=$1 AND design_id=$2", [parsed.data.pageId, designId]);
    if (!page) throw new HTTPException(400, { message: "Page does not belong to design" });
  }
  if (parsed.data.parentId) {
    const parent = await one<{ id: string }>("SELECT id FROM design_comments WHERE id=$1 AND design_id=$2", [parsed.data.parentId, designId]);
    if (!parent) throw new HTTPException(400, { message: "Parent comment does not belong to design" });
  }

  const mentions = extractMentions(parsed.data.body);
  const created = await one<any>(
    `INSERT INTO design_comments(
       design_id,page_id,object_id,parent_id,author_id,body,anchor_x,anchor_y,mentions
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     RETURNING id,design_id,page_id,object_id,parent_id,body,anchor_x,anchor_y,mentions,resolved_at,created_at,updated_at`,
    [
      designId,
      parsed.data.pageId ?? null,
      parsed.data.objectId ?? null,
      parsed.data.parentId ?? null,
      c.get("user").id,
      parsed.data.body,
      parsed.data.anchorX ?? null,
      parsed.data.anchorY ?? null,
      JSON.stringify(mentions),
    ],
  );
  return c.json({ ...created, author_id: c.get("user").id, author_name: c.get("user").name }, 201);
});

reviews.patch("/api/designs/:designId/comments/:commentId", requireAuth, requireOrganization, async (c) => {
  const designId = c.req.param("designId");
  await requireDesignAccess(c, designId);
  const parsed = commentUpdatePayload.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues.map((issue) => issue.message).join(", ") });

  const comment = await one<{ id: string; author_id: string; resolved_at: string | null }>(
    "SELECT id,author_id,resolved_at FROM design_comments WHERE id=$1 AND design_id=$2",
    [c.req.param("commentId"), designId],
  );
  if (!comment) throw new HTTPException(404, { message: "Comment not found" });
  const canUpdate = comment.author_id === c.get("user").id || roleAtLeast(c.get("role"), "EDITOR");
  if (!canUpdate) throw new HTTPException(403, { message: "Insufficient permission to update comment" });

  const resolved = parsed.data.resolved ?? !comment.resolved_at;
  const hasAnchorX = parsed.data.anchorX !== undefined;
  const hasAnchorY = parsed.data.anchorY !== undefined;
  const updated = await one<any>(
    `UPDATE design_comments
        SET resolved_at=CASE WHEN $3 THEN now() ELSE NULL END,
            resolved_by=CASE WHEN $3 THEN $4::uuid ELSE NULL END,
            anchor_x=CASE WHEN $5 THEN $6::double precision ELSE anchor_x END,
            anchor_y=CASE WHEN $7 THEN $8::double precision ELSE anchor_y END,
            updated_at=now()
      WHERE id=$1 AND design_id=$2
      RETURNING id,anchor_x,anchor_y,resolved_at,updated_at`,
    [
      comment.id,
      designId,
      resolved,
      c.get("user").id,
      hasAnchorX,
      parsed.data.anchorX ?? null,
      hasAnchorY,
      parsed.data.anchorY ?? null,
    ],
  );
  return c.json(updated);
});

reviews.put("/api/designs/:designId/review", requireAuth, requireOrganization, async (c) => {
  const designId = c.req.param("designId");
  await requireDesignAccess(c, designId);
  if (!roleAtLeast(c.get("role"), "EDITOR")) throw new HTTPException(403, { message: "Editor role required" });
  const parsed = reviewPayload.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues.map((issue) => issue.message).join(", ") });

  const isRequest = parsed.data.status === "IN_REVIEW";
  const isDecision = parsed.data.status === "APPROVED" || parsed.data.status === "CHANGES_REQUESTED";
  const row = await one<any>(
    `INSERT INTO design_reviews(
       design_id,status,note,requested_by,reviewed_by,requested_at,reviewed_at,updated_at
     ) VALUES (
       $1,$2,$3,
       CASE WHEN $4 THEN $6::uuid ELSE NULL END,
       CASE WHEN $5 THEN $6::uuid ELSE NULL END,
       CASE WHEN $4 THEN now() ELSE NULL END,
       CASE WHEN $5 THEN now() ELSE NULL END,
       now()
     )
     ON CONFLICT (design_id) DO UPDATE SET
       status=EXCLUDED.status,
       note=EXCLUDED.note,
       requested_by=CASE WHEN $4 THEN $6::uuid ELSE design_reviews.requested_by END,
       reviewed_by=CASE WHEN $5 THEN $6::uuid ELSE NULL END,
       requested_at=CASE WHEN $4 THEN now() ELSE design_reviews.requested_at END,
       reviewed_at=CASE WHEN $5 THEN now() ELSE NULL END,
       updated_at=now()
     RETURNING design_id,status,note,requested_at,reviewed_at,updated_at`,
    [designId, parsed.data.status, parsed.data.note ?? null, isRequest, isDecision, c.get("user").id],
  );
  return c.json(row);
});

export default reviews;
