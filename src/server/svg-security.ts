const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /<\s*(script|iframe|object|embed|foreignObject|audio|video|canvas|link|meta)\b/i, message: "SVG contains a forbidden element" },
  { pattern: /\son[a-z]+\s*=/i, message: "SVG event handlers are not allowed" },
  { pattern: /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|javascript:|file:|ftp:)/i, message: "External SVG references are not allowed" },
  { pattern: /(?:href|xlink:href)\s*=\s*["']\s*data:(?!image\/(?:png|jpeg|jpg|gif|webp);base64,)/i, message: "Unsupported embedded SVG data" },
  { pattern: /url\(\s*["']?\s*(?:https?:|\/\/|javascript:|file:|ftp:)/i, message: "External SVG resources are not allowed" },
  { pattern: /<!DOCTYPE|<!ENTITY/i, message: "SVG declarations and entities are not allowed" },
  { pattern: /<\?xml-stylesheet/i, message: "SVG stylesheets are not allowed" },
];

export function validateSvgBytes(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new Error("SVG file is empty");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
  if (!/^<svg\b/i.test(text.replace(/^<\?xml[^>]*>\s*/i, ""))) {
    throw new Error("File is not a valid standalone SVG document");
  }
  if (!/<\/svg>\s*$/i.test(text)) throw new Error("SVG document is incomplete");
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(text)) throw new Error(rule.message);
  }
  const nestedSvgCount = (text.match(/<svg\b/gi) ?? []).length;
  if (nestedSvgCount > 20) throw new Error("SVG contains too many nested documents");
}
