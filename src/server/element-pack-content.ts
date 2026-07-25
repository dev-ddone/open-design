import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppVariables } from "./auth.js";
import { requireAuth, requireOrganization } from "./auth.js";
import { config } from "./config.js";

interface ManifestItem {
  url: string;
  type?: "vector" | "image";
}

interface ElementManifest {
  items?: ManifestItem[];
}

const packContent = new Hono<{ Variables: AppVariables }>();
const manifests = new Map<number, { expiresAt: number; value: ElementManifest }>();

function index(value: string, maximum: number): number {
  if (!/^\d+$/.test(value)) throw new HTTPException(400, { message: "Invalid pack item identifier" });
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new HTTPException(400, { message: "Invalid pack item identifier" });
  }
  return parsed;
}

async function manifestAt(manifestIndex: number): Promise<ElementManifest> {
  const manifestUrl = config.elements.manifestUrls[manifestIndex];
  if (!manifestUrl) throw new HTTPException(404, { message: "Element pack not found" });
  const cached = manifests.get(manifestIndex);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await fetch(manifestUrl, {
    headers: { "User-Agent": "DDone-Design/2.2 open-asset-pack" },
    signal: AbortSignal.timeout(config.elements.requestTimeoutMs),
  });
  if (!response.ok) throw new HTTPException(502, { message: "Element pack is unavailable" });
  const value = await response.json() as ElementManifest;
  if (!Array.isArray(value.items)) throw new HTTPException(502, { message: "Element pack manifest is invalid" });
  manifests.set(manifestIndex, { value, expiresAt: Date.now() + 30 * 60 * 1_000 });
  return value;
}

packContent.get(
  "/api/elements-universe/manifest/:manifestIndex/:itemIndex/content",
  requireAuth,
  requireOrganization,
  async (c) => {
    const manifestIndex = index(c.req.param("manifestIndex"), 10_000);
    const itemIndex = index(c.req.param("itemIndex"), 1_000_000);
    const manifestUrl = config.elements.manifestUrls[manifestIndex];
    const manifest = await manifestAt(manifestIndex);
    const item = manifest.items?.[itemIndex];
    if (!item || typeof item.url !== "string") {
      throw new HTTPException(404, { message: "Pack item not found" });
    }

    const manifestOrigin = new URL(manifestUrl).origin;
    const source = new URL(item.url, manifestUrl);
    if (source.protocol !== "https:" || source.origin !== manifestOrigin) {
      throw new HTTPException(403, { message: "Pack item host is not allowed" });
    }

    const response = await fetch(source, {
      signal: AbortSignal.timeout(config.elements.requestTimeoutMs * 2),
    });
    if (!response.ok) throw new HTTPException(404, { message: "Pack item unavailable" });
    const contentType = response.headers.get("content-type")
      ?? (item.type === "vector" ? "image/svg+xml" : "image/png");
    if (!contentType.startsWith("image/")) {
      throw new HTTPException(502, { message: "Invalid pack response" });
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 30 * 1024 * 1024) {
      throw new HTTPException(413, { message: "Pack item is too large" });
    }
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  },
);

export default packContent;
