import type { ReviewStatus } from "./review-comments";

export interface ExportPreflightInput {
  reviewStatus: ReviewStatus;
  auditErrors: number;
  auditWarnings: number;
  openComments: number;
  readOnly: boolean;
}

export interface ExportPreflightResult extends ExportPreflightInput {
  blockers: string[];
  notices: string[];
  canOverride: boolean;
  canExportImmediately: boolean;
}

export function buildExportPreflight(input: ExportPreflightInput): ExportPreflightResult {
  const blockers: string[] = [];
  const notices: string[] = [];

  if (input.auditErrors > 0) blockers.push(`${input.auditErrors} errori bloccanti rilevati dal controllo design.`);
  if (input.reviewStatus === "CHANGES_REQUESTED") blockers.push("La revisione richiede ancora modifiche.");

  if (input.reviewStatus === "IN_REVIEW") notices.push("Il progetto è ancora in revisione.");
  else if (input.reviewStatus === "DRAFT") notices.push("Il progetto non è stato approvato.");
  if (input.auditWarnings > 0) notices.push(`${input.auditWarnings} avvisi di qualità restano aperti.`);
  if (input.openComments > 0) notices.push(`${input.openComments} commenti non sono stati risolti.`);

  const canOverride = blockers.length === 0 || !input.readOnly;
  return {
    ...input,
    blockers,
    notices,
    canOverride,
    canExportImmediately: blockers.length === 0 && notices.length === 0,
  };
}
