import { config } from "./config.js";
import { one, query } from "./db.js";
import { sendWorkspaceNotificationEmail } from "./mailer.js";

export interface NotificationInput {
  organizationId: string;
  userId: string;
  designId?: string | null;
  commentId?: string | null;
  kind: string;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  email?: string | null;
  name?: string | null;
}

export async function createUserNotification(input: NotificationInput): Promise<void> {
  await one(
    `INSERT INTO notifications(
       organization_id,user_id,design_id,comment_id,kind,title,body,payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING id`,
    [
      input.organizationId,
      input.userId,
      input.designId ?? null,
      input.commentId ?? null,
      input.kind,
      input.title,
      input.body ?? "",
      JSON.stringify(input.payload ?? {}),
    ],
  );

  if (!input.email) return;
  const designUrl = input.designId
    ? `${config.appUrl.replace(/\/$/, "")}/design/${encodeURIComponent(input.designId)}`
    : config.appUrl;
  await sendWorkspaceNotificationEmail({
    email: input.email,
    name: input.name ?? input.email,
    title: input.title,
    body: input.body ?? "",
    actionUrl: designUrl,
  }).catch((error) => console.warn("Notification email delivery failed", error));
}

export async function resolveMentionedUsers(
  organizationId: string,
  mentions: string[],
): Promise<Array<{ id: string; name: string; email: string }>> {
  if (mentions.length === 0) return [];
  const normalized = [...new Set(mentions.map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0) return [];
  return query(
    `SELECT DISTINCT u.id,u.name,u.email
       FROM organization_members om
       JOIN users u ON u.id=om.user_id
      WHERE om.organization_id=$1
        AND (
          lower(u.email)=ANY($2::text[])
          OR lower(split_part(u.email,'@',1))=ANY($2::text[])
          OR lower(regexp_replace(u.name,'[^a-zA-Z0-9._-]+','','g'))=ANY($2::text[])
        )`,
    [organizationId, normalized],
  );
}

export async function notifyMentions(input: {
  organizationId: string;
  designId: string;
  commentId: string;
  actorId: string;
  actorName: string;
  mentions: string[];
  body: string;
}): Promise<void> {
  const users = await resolveMentionedUsers(input.organizationId, input.mentions);
  await Promise.all(users
    .filter((user) => user.id !== input.actorId)
    .map((user) => createUserNotification({
      organizationId: input.organizationId,
      userId: user.id,
      designId: input.designId,
      commentId: input.commentId,
      kind: "COMMENT_MENTION",
      title: `${input.actorName} ti ha menzionato`,
      body: input.body.slice(0, 500),
      payload: { actorId: input.actorId },
      email: user.email,
      name: user.name,
    })));
}

export async function notifyReviewParticipants(input: {
  organizationId: string;
  designId: string;
  actorId: string;
  actorName: string;
  status: string;
  note?: string | null;
}): Promise<void> {
  const recipients = await query<{ id: string; name: string; email: string }>(
    `SELECT DISTINCT u.id,u.name,u.email
       FROM organization_members om
       JOIN users u ON u.id=om.user_id
      WHERE om.organization_id=$1
        AND om.role IN ('OWNER','ADMIN','EDITOR')
        AND u.id<>$2`,
    [input.organizationId, input.actorId],
  );
  const labels: Record<string, string> = {
    IN_REVIEW: "Revisione richiesta",
    APPROVED: "Progetto approvato",
    CHANGES_REQUESTED: "Modifiche richieste",
    DRAFT: "Progetto riportato in bozza",
  };
  await Promise.all(recipients.map((user) => createUserNotification({
    organizationId: input.organizationId,
    userId: user.id,
    designId: input.designId,
    kind: `REVIEW_${input.status}`,
    title: labels[input.status] ?? "Stato revisione aggiornato",
    body: `${input.actorName}: ${input.note?.trim() || labels[input.status] || input.status}`,
    payload: { status: input.status, actorId: input.actorId },
    email: user.email,
    name: user.name,
  })));
}