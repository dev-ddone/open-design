import { Hono } from "hono";
import { z } from "zod";
import type { AppVariables } from "./auth.js";
import { config } from "./config.js";
import { one, transaction } from "./db.js";
import { sendPasswordResetEmail } from "./mailer.js";
import { createOneTimeToken, expiresInMinutes } from "./tokens.js";

const recovery = new Hono<{ Variables: AppVariables }>();

recovery.post("/api/auth/forgot-password", async (c) => {
  const parsed = z.object({
    email: z.string().email().transform((value) => value.trim().toLowerCase()),
  }).safeParse(await c.req.json().catch(() => ({})));

  // Invalid and unknown addresses intentionally receive the same response.
  if (!parsed.success) return c.json({ ok: true });

  const user = await one<{ id: string; email: string; name: string; disabled: boolean }>(
    "SELECT id,email,name,disabled FROM users WHERE email=$1",
    [parsed.data.email],
  );
  if (user && !user.disabled) {
    try {
      const token = createOneTimeToken();
      await transaction(async (client) => {
        await client.query(
          "UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
          [user.id],
        );
        await client.query(
          `INSERT INTO password_reset_tokens(user_id,token_hash,expires_at)
           VALUES ($1,$2,$3)`,
          [user.id, token.hash, expiresInMinutes(config.passwordResetTtlMinutes)],
        );
      });
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        resetUrl: `${config.appUrl}/?reset=${encodeURIComponent(token.token)}`,
        expiresMinutes: config.passwordResetTtlMinutes,
      });
    } catch (error) {
      console.error("Unable to deliver password reset email", error);
    }
  }

  return c.json({ ok: true });
});

export default recovery;
