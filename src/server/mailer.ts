import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config.js";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  if (!config.email.host) throw new Error("SMTP_HOST is not configured");
  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth:
      config.email.user && config.email.password
        ? { user: config.email.user, pass: config.email.password }
        : undefined,
  });
  return transporter;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

async function deliver(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  sensitiveUrl: string;
}): Promise<void> {
  if (config.email.delivery === "log") {
    console.info(`[email:log] ${input.subject} -> ${input.to}: ${input.sensitiveUrl}`);
    return;
  }
  await getTransporter().sendMail({
    from: config.email.from,
    replyTo: config.email.replyTo,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export async function sendPasswordResetEmail(input: {
  email: string;
  name: string;
  resetUrl: string;
  expiresMinutes: number;
}): Promise<void> {
  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.resetUrl);
  await deliver({
    to: input.email,
    subject: "Reset your DDone Design password",
    sensitiveUrl: input.resetUrl,
    text: `Hello ${input.name},\n\nOpen this link to reset your password: ${input.resetUrl}\n\nThe link expires in ${input.expiresMinutes} minutes. If you did not request this, ignore this email.`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#18181b">
      <h1 style="font-size:22px">Reset your password</h1>
      <p>Hello ${safeName},</p>
      <p>Use the button below to choose a new password. The link expires in ${input.expiresMinutes} minutes and can be used only once.</p>
      <p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#6d5dfc;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Reset password</a></p>
      <p style="font-size:12px;color:#71717a;word-break:break-all">${safeUrl}</p>
      <p style="font-size:12px;color:#71717a">If you did not request this reset, no action is required.</p>
    </div>`,
  });
}

export async function sendInvitationEmail(input: {
  email: string;
  inviterName: string;
  organizationName: string;
  role: string;
  clientNames: string[];
  invitationUrl: string;
  expiresHours: number;
}): Promise<void> {
  const safeInviter = escapeHtml(input.inviterName);
  const safeOrganization = escapeHtml(input.organizationName);
  const safeUrl = escapeHtml(input.invitationUrl);
  const scope = input.clientNames.length
    ? `Clients: ${input.clientNames.join(", ")}`
    : "All clients in the workspace";
  await deliver({
    to: input.email,
    subject: `${input.inviterName} invited you to ${input.organizationName}`,
    sensitiveUrl: input.invitationUrl,
    text: `${input.inviterName} invited you to ${input.organizationName} as ${input.role}. ${scope}.\n\nAccept the invitation: ${input.invitationUrl}\n\nThe invitation expires in ${input.expiresHours} hours.`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#18181b">
      <h1 style="font-size:22px">You are invited to DDone Design</h1>
      <p><strong>${safeInviter}</strong> invited you to <strong>${safeOrganization}</strong> as <strong>${escapeHtml(input.role)}</strong>.</p>
      <p>${escapeHtml(scope)}</p>
      <p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#6d5dfc;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Accept invitation</a></p>
      <p style="font-size:12px;color:#71717a;word-break:break-all">${safeUrl}</p>
      <p style="font-size:12px;color:#71717a">This invitation expires in ${input.expiresHours} hours.</p>
    </div>`,
  });
}

export async function sendWorkspaceNotificationEmail(input: {
  email: string;
  name: string;
  title: string;
  body: string;
  actionUrl: string;
}): Promise<void> {
  const safeName = escapeHtml(input.name);
  const safeTitle = escapeHtml(input.title);
  const safeBody = escapeHtml(input.body).replace(/\n/g, "<br/>");
  const safeUrl = escapeHtml(input.actionUrl);
  await deliver({
    to: input.email,
    subject: input.title,
    sensitiveUrl: input.actionUrl,
    text: `Ciao ${input.name},\n\n${input.title}\n${input.body}\n\nApri il progetto: ${input.actionUrl}`,
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#18181b">
      <h1 style="font-size:20px">${safeTitle}</h1>
      <p>Ciao ${safeName},</p>
      <p style="line-height:1.6">${safeBody}</p>
      <p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#6d5dfc;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Apri in DDone Design</a></p>
      <p style="font-size:12px;color:#71717a;word-break:break-all">${safeUrl}</p>
    </div>`,
  });
}

export async function verifyEmailTransport(): Promise<void> {
  if (config.email.delivery === "smtp") await getTransporter().verify();
}