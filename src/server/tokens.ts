import { createHash, randomBytes } from "node:crypto";

export function createOneTimeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function expiresInMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

export function expiresInHours(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}
