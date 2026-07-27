export type ReviewStatus = "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED";

export interface ReviewRecord {
  status: ReviewStatus;
  note: string | null;
  requested_at: string | null;
  reviewed_at: string | null;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
}

export interface ReviewComment {
  id: string;
  page_id: string | null;
  object_id: string | null;
  parent_id: string | null;
  body: string;
  author_id: string;
  author_name: string;
  author_email?: string | null;
  anchor_x: number | null;
  anchor_y: number | null;
  mentions: string[];
  resolved_at: string | null;
  resolved_by_name?: string | null;
  created_at: string;
}

export interface ReviewResponse {
  review: ReviewRecord;
  comments: ReviewComment[];
  canReview: boolean;
}

export const REVIEW_COMMENTS_LOADED_EVENT = "ddone:review-comments-loaded";
export const REVIEW_COMMENTS_CHANGED_EVENT = "ddone:review-comments-changed";
export const REVIEW_COMMENT_FOCUS_EVENT = "ddone:focus-comment";

export function clampCommentAnchor(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

export function extractCommentMentions(body: string): string[] {
  const mentions = new Set<string>();
  const expression = /(^|\s)@([a-z0-9._-]+(?:@[a-z0-9.-]+)?)/gi;
  for (const match of body.matchAll(expression)) {
    const value = match[2]?.trim().toLowerCase();
    if (value) mentions.add(value);
  }
  return [...mentions].slice(0, 25);
}

export function dispatchReviewCommentsLoaded(comments: ReviewComment[]): void {
  window.dispatchEvent(new CustomEvent(REVIEW_COMMENTS_LOADED_EVENT, { detail: { comments } }));
}

export function notifyReviewCommentsChanged(): void {
  window.dispatchEvent(new Event(REVIEW_COMMENTS_CHANGED_EVENT));
}
