import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppVariables } from "./auth.js";
import { requireAuth, requireOrganization, roleAtLeast } from "./auth.js";
import { one, pool, query } from "./db.js";
import {
  createUserNotification,
  notifyMentions,
  notifyReviewParticipants,
} from "./notification-service.js";

const reviews = new Hono<{ Variables: AppVariables }>();

const anchorValue = z.number().finite().min(0).max(1).nullable();
const anchorSize = z.number().finite().positive().max(1).nullable();
const commentPayload = z.object({
  body: z.string().trim().min(1).max(4_000),
  pageId: z.string().uuid().nullable().optional(),
  objectId: z.string().trim().min(1).max(500).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  anchorX: anchorValue.optional(),
  anchorY: anchorValue.optional(),
  anchorWidth: anchorSize.optional(),
  anchorHeight: anchorSize.optional(),
  anchorMode: z.enum(["point", "region"]).default("point"),
  assignedTo: z.string().uuid().nullable().optional(),
});
const commentUpdatePayload = z.object({
  resolved: z.boolean().optional(),
  anchorX: anchorValue.optional(),
  anchorY: anchorValue.optional(),
  anchorWidth: anchorSize.optional(),
  anchorHeight: anchorSize.optional(),
  anchorMode: z.enum(["point", "region"]).optional(),
  objectId: z.string().trim().min(1).max(500).nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
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

async function assertAssignableUser(organizationId: string, userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const member = await one(
    `SELECT 1
       FROM organization_members
      WHERE organization_id=$1 AND user_id=$2`,
    [organizationId, userId],
  );
  if (!member) throw new HTTPException(400, { message: "Assignee is not a workspace member" });
}

async function recordGovernance(c: any, designId: string, eventType: string, payload: Record<string, unknown>) {
  await pool.query(
    `INSERT INTO design_governance_events(organization_id,design_id,event_type,payload,created_by)
     VALUES ($1,$2,$3,$4::jsonb,$5)`,
    [c.get("organizationId"), designId, eventType, JSON.stringify(payload), c.get("user").id],
  );
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
            dc.anchor_x,dc.anchor_y,dc.anchor_width,dc.anchor_height,dc.anchor_mode,
            dc.mentions,dc.assigned_to,
            dc.resolved_at,dc.created_at,dc.updated_at,
            author.id AS author_id,author.name AS author_name,author.email AS author_email,
            resolver.name AS resolved_by_name,
            assignee.name AS assigned_to_name,assignee.email AS assigned_to_email
       FROM design_comments dc
       JOIN users author ON author.id=dc.author_id
       LEFT JOIN users resolver ON resolver.id=dc.resolved_by
       LEFT JOIN users assignee ON assignee.id=dc.assigned_to
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
  await assertAssignableUser(c.get("organizationId"), parsed.data.assignedTo);

  const mentions = extractMentions(parsed.data.body);
  const created = await one<any>(
    `INSERT INTO design_comments(
       design_id,page_id,object_id,parent_id,author_id,body,anchor_x,anchor_y,
       anchor_width,anchor_height,anchor_mode,mentions,assigned_to
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     RETURNING id,design_id,page_id,object_id,parent_id,body,anchor_x,anchor_y,
               anchor_width,anchor_height,anchor_mode,mentions,assigned_to,resolved_at,created_at,updated_at`,
    [
      designId,
      parsed.data.pageId ?? null,
      parsed.data.objectId ?? null,
      parsed.data.parentId ?? null,
      c.get("user").id,
      parsed.data.body,
      parsed.data.anchorX ?? null,
      parsed.data.anchorY ?? null,
      parsed.data.anchorMode === "region" ? parsed.data.anchorWidth ?? 0.25 : null,
      parsed.data.anchorMode === "region" ? parsed.data.anchorHeight ?? 0.15 : null,
      parsed.data.anchorMode,
      JSON.stringify(mentions),
      parsed.data.assignedTo ?? null,
    ],
  );
  const response = { ...created, author_id: c.get("user").id, author_name: c.get("user").name };

  await notifyMentions({
    organizationId: c.get("organizationId"),
    designId,
    commentId: created.id,
    actorId: c.get("user").id,
    actorName: c.get("user").name,
    mentions,
    body: parsed.data.body,
  });
  if (parsed.data.assignedTo && parsed.data.assignedTo !== c.get("user").id) {
    const assignee = await one<{ id: string; name: string; email: string }>(
      "SELECT id,name,email FROM users WHERE id=$1",
      [parsed.data.assignedTo],
    );
    if (assignee) await createUserNotification({
      organizationId: c.get("organizationId"),
      userId: assignee.id,
      designId,
      commentId: created.id,
      kind: "COMMENT_ASSIGNED",
      title: `${c.get("user").name} ti ha assegnato un commento`,
      body: parsed.data.body.slice(0, 500),
      payload: { actorId: c.get("user").id },
      email: assignee.email,
      name: assignee.name,
    });
  }
  return c.json(response, 201);
});

reviews.patch("/api/designs/:designId/comments/:commentId", requireAuth, requireOrganization, async (c) => {
  const designId = c.req.param("designId");
  await requireDesignAccess(c, designId);
  const parsed = commentUpdatePayload.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues.map((issue) => issue.message).join(", ") });

  const comment = await one<{ id: string; author_id: string; resolved_at: string | null; assigned_to: string | null }>(
    "SELECT id,author_id,resolved_at,assigned_to FROM design_comments WHERE id=$1 AND design_id=$2",
    [c.req.param("commentId"), designId],
  );
  if (!comment) throw new HTTPException(404, { message: "Comment not found" });
  const canUpdate = comment.author_id === c.get("user").id || roleAtLeast(c.get("role"), "EDITOR");
  if (!canUpdate) throw new HTTPException(403, { message: "Insufficient permission to update comment" });
  await assertAssignableUser(c.get("organizationId"), parsed.data.assignedTo);

  const resolved = parsed.data.resolved ?? Boolean(comment.resolved_at);
  const fields = parsed.data;
  const updated = await one<any>(
    `UPDATE design_comments
        SET resolved_at=CASE WHEN $3 THEN COALESCE(resolved_at,now()) ELSE NULL END,
            resolved_by=CASE WHEN $3 THEN $4::uuid ELSE NULL END,
            anchor_x=CASE WHEN $5 THEN $6::double precision ELSE anchor_x END,
            anchor_y=CASE WHEN $7 THEN $8::double precision ELSE anchor_y END,
            anchor_width=CASE WHEN $9 THEN $10::double precision ELSE anchor_width END,
            anchor_height=CASE WHEN $11 THEN $12::double precision ELSE anchor_height END,
            anchor_mode=CASE WHEN $13 THEN $14 ELSE anchor_mode END,
            object_id=CASE WHEN $15 THEN $16 ELSE object_id END,
            assigned_to=CASE WHEN $17 THEN $18::uuid ELSE assigned_to END,
            updated_at=now()
      WHERE id=$1 AND design_id=$2
      RETURNING id,object_id,anchor_x,anchor_y,anchor_width,anchor_height,anchor_mode,
                assigned_to,resolved_at,updated_at`,
    [
      comment.id,
      designId,
      resolved,
      c.get("user").id,
      fields.anchorX !== undefined,
      fields.anchorX ?? null,
      fields.anchorY !== undefined,
      fields.anchorY ?? null,
      fields.anchorWidth !== undefined,
      fields.anchorWidth ?? null,
      fields.anchorHeight !== undefined,
      fields.anchorHeight ?? null,
      fields.anchorMode !== undefined,
      fields.anchorMode ?? "point",
      fields.objectId !== undefined,
      fields.objectId ?? null,
      fields.assignedTo !== undefined,
      fields.assignedTo ?? null,
    ],
  );

  if (fields.assignedTo && fields.assignedTo !== comment.assigned_to && fields.assignedTo !== c.get("user").id) {
    const assignee = await one<{ id: string; name: string; email: string }>(
      "SELECT id,name,email FROM users WHERE id=$1",
      [fields.assignedTo],
    );
    if (assignee) await createUserNotification({
      organizationId: c.get("organizationId"),
      userId: assignee.id,
      designId,
      commentId: comment.id,
      kind: "COMMENT_ASSIGNED",
      title: `${c.get("user").name} ti ha assegnato un commento`,
      body: "Apri il thread per visualizzare il feedback assegnato.",
      email: assignee.email,
      name: assignee.name,
    });
  }
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
  const eventType: Record<string, string> = {
    IN_REVIEW: "REVIEW_REQUESTED",
    APPROVED: "REVIEW_APPROVED",
    CHANGES_REQUESTED: "REVIEW_CHANGES_REQUESTED",
    DRAFT: "REVIEW_DRAFTED",
  };
  await recordGovernance(c, designId, eventType[parsed.data.status] ?? "REVIEW_UPDATED", {
    status: parsed.data.status,
    note: parsed.data.note ?? null,
  });
  await notifyReviewParticipants({
    organizationId: c.get("organizationId"),
    designId,
    actorId: c.get("user").id,
    actorName: c.get("user").name,
    status: parsed.data.status,
    note: parsed.data.note,
  });
  return c.json(row);
});

export default reviews;