import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppVariables } from "./auth.js";
import { requireAuth, requireOrganization } from "./auth.js";
import { config } from "./config.js";
import { query } from "./db.js";
import { searchBuiltins } from "./elements.js";

export type UniverseCategory =
  | "all"
  | "icons"
  | "illustrations"
  | "photos"
  | "emoji"
  | "ornaments"
  | "frames"
  | "food"
  | "cocktails"
  | "backgrounds"
  | "social"
  | "patterns";

export type UniverseProvider =
  | "builtin"
  | "uploads"
  | "iconify"
  | "openverse"
  | "wikimedia"
  | "manifest";

export interface UniverseElement {
  id: string;
  name: string;
  category: UniverseCategory;
  tags: string[];
  provider: UniverseProvider | string;
  providerLabel: string;
  kind: "vector" | "image";
  license: string;
  licenseUrl?: string;
  author?: string;
  sourceUrl?: string;
  attribution?: string;
  attributionRequired: boolean;
  previewUrl?: string;
  assetUrl?: string;
  svg?: string;
  width?: number;
  height?: number;
  recolorable?: boolean;
}

interface ProviderInfo {
  id: UniverseProvider | string;
  label: string;
  description: string;
  enabled: boolean;
  capabilities: Array<"vector" | "image">;
  attribution: string;
}

interface CacheRecord<T> {
  expiresAt: number;
  value: T;
}

interface ManifestItem {
  id: string;
  name: string;
  category?: UniverseCategory;
  tags?: string[];
  type?: "vector" | "image";
  url: string;
  previewUrl?: string;
  license?: string;
  licenseUrl?: string;
  author?: string;
  sourceUrl?: string;
  attribution?: string;
  attributionRequired?: boolean;
  recolorable?: boolean;
  width?: number;
  height?: number;
}

interface ElementManifest {
  name?: string;
  id?: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  items?: ManifestItem[];
}

const universe = new Hono<{ Variables: AppVariables }>();
const cache = new Map<string, CacheRecord<unknown>>();
const manifestCache = new Map<number, ElementManifest>();

const DEFAULT_QUERIES: Record<UniverseCategory, string> = {
  all: "restaurant design",
  icons: "restaurant",
  illustrations: "restaurant illustration",
  photos: "restaurant food",
  emoji: "food smile",
  ornaments: "floral ornament divider",
  frames: "decorative frame border",
  food: "food restaurant pizza pasta",
  cocktails: "cocktail drink bar",
  backgrounds: "paper texture background",
  social: "social media brand",
  patterns: "seamless pattern geometric",
};

const EMOJI_PREFIXES = [
  "fluent-emoji",
  "fluent-emoji-flat",
  "fluent-emoji-high-contrast",
  "noto",
  "openmoji",
  "twemoji",
  "emojione",
];
const SOCIAL_PREFIXES = ["simple-icons", "logos", "fa6-brands", "mdi"];

function enabled(provider: string): boolean {
  return config.elements.enabledProviders.includes(provider);
}

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), max) : fallback;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim() || undefined;
}

function category(value: string | undefined): UniverseCategory {
  const valid: UniverseCategory[] = [
    "all",
    "icons",
    "illustrations",
    "photos",
    "emoji",
    "ornaments",
    "frames",
    "food",
    "cocktails",
    "backgrounds",
    "social",
    "patterns",
  ];
  return valid.includes(value as UniverseCategory) ? (value as UniverseCategory) : "all";
}

async function cached<T>(key: string, loader: () => Promise<T>, ttlSeconds = config.elements.cacheTtlSeconds): Promise<T> {
  const current = cache.get(key) as CacheRecord<T> | undefined;
  if (current && current.expiresAt > Date.now()) return current.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
  if (cache.size > 600) {
    for (const [cacheKey, record] of cache) {
      if (record.expiresAt <= Date.now()) cache.delete(cacheKey);
      if (cache.size <= 500) break;
    }
  }
  return value;
}

async function fetchJson<T>(url: URL | string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": "DDone-Design/2.2 open-asset-search", ...headers },
    signal: AbortSignal.timeout(config.elements.requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json() as Promise<T>;
}

function iconifyLicense(info: any): { name: string; url?: string } {
  const license = info?.license;
  if (!license) return { name: "See source collection" };
  return {
    name: license.spdx || license.title || "See source collection",
    url: license.url,
  };
}

async function searchIconify(input: {
  q: string;
  category: UniverseCategory;
  pageSize: number;
}): Promise<UniverseElement[]> {
  if (!enabled("iconify")) return [];
  const url = new URL("/search", config.iconify.apiUrl);
  url.searchParams.set("query", input.q);
  url.searchParams.set("limit", String(Math.min(input.pageSize, 64)));
  if (input.category === "emoji") url.searchParams.set("prefixes", EMOJI_PREFIXES.join(","));
  if (input.category === "social") url.searchParams.set("prefixes", SOCIAL_PREFIXES.join(","));
  const data = await cached(`iconify:${url}`, () => fetchJson<any>(url));
  return (data.icons ?? []).map((icon: string) => {
    const [prefix, name] = icon.split(":");
    const license = iconifyLicense(data.collections?.[prefix]);
    return {
      id: `iconify:${prefix}:${name}`,
      name: name.replace(/-/g, " "),
      category: input.category === "all" ? "icons" : input.category,
      tags: [prefix, name, input.q],
      provider: "iconify",
      providerLabel: data.collections?.[prefix]?.name || `Iconify · ${prefix}`,
      kind: "vector",
      license: license.name,
      licenseUrl: license.url,
      sourceUrl: `https://icon-sets.iconify.design/${prefix}/${name}/`,
      attributionRequired: !["MIT", "CC0-1.0", "Apache-2.0"].includes(license.name),
      previewUrl: `/api/elements-universe/iconify/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}`,
      assetUrl: `/api/elements-universe/iconify/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}`,
      recolorable: true,
    } satisfies UniverseElement;
  });
}

function openverseHeaders(): Record<string, string> {
  return config.elements.openverseToken
    ? { Authorization: `Bearer ${config.elements.openverseToken}` }
    : {};
}

async function searchOpenverse(input: {
  q: string;
  category: UniverseCategory;
  page: number;
  pageSize: number;
}): Promise<UniverseElement[]> {
  if (!enabled("openverse")) return [];
  const url = new URL("/v1/images/", config.elements.openverseApiUrl);
  url.searchParams.set("q", input.q);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("page_size", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("mature", "false");
  url.searchParams.set("license", config.elements.allowedOpenverseLicenses.join(","));
  if (input.category === "illustrations" || input.category === "icons" || input.category === "ornaments") {
    url.searchParams.set("categories", "illustration");
  } else if (input.category === "photos") {
    url.searchParams.set("categories", "photograph");
  }
  const data = await cached(`openverse:${url}`, () => fetchJson<any>(url, openverseHeaders()), 600);
  return (data.results ?? []).map((item: any) => {
    const filetype = String(item.filetype ?? "").toLowerCase();
    const vector = filetype === "svg";
    const resolvedCategory = input.category === "all"
      ? item.category === "illustration" ? "illustrations" : "photos"
      : input.category;
    return {
      id: `openverse:${item.id}`,
      name: cleanText(item.title) ?? "Open image",
      category: resolvedCategory,
      tags: (item.tags ?? []).slice(0, 12).map((tag: any) => cleanText(tag.name)).filter(Boolean),
      provider: "openverse",
      providerLabel: `Openverse · ${item.source || item.provider || "open media"}`,
      kind: vector ? "vector" : "image",
      license: String(item.license ?? "open license").toUpperCase(),
      licenseUrl: item.license_url,
      author: cleanText(item.creator),
      sourceUrl: item.foreign_landing_url,
      attribution: cleanText(item.attribution),
      attributionRequired: !["cc0", "pdm"].includes(String(item.license ?? "").toLowerCase()),
      previewUrl: `/api/elements-universe/openverse/${encodeURIComponent(item.id)}/content?size=preview`,
      assetUrl: `/api/elements-universe/openverse/${encodeURIComponent(item.id)}/content?size=full`,
      width: item.width || undefined,
      height: item.height || undefined,
      recolorable: vector,
    } satisfies UniverseElement;
  });
}

function metadataValue(metadata: any, key: string): string | undefined {
  return cleanText(metadata?.[key]?.value);
}

async function wikimediaPage(pageId: string): Promise<any | null> {
  const url = new URL(config.elements.wikimediaApiUrl);
  url.searchParams.set("action", "query");
  url.searchParams.set("pageids", pageId);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  url.searchParams.set("iiurlwidth", "1600");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  const data = await cached(`wikimedia-page:${pageId}`, () => fetchJson<any>(url), 3_600);
  return data.query?.pages?.[0] ?? null;
}

async function searchWikimedia(input: {
  q: string;
  category: UniverseCategory;
  page: number;
  pageSize: number;
}): Promise<UniverseElement[]> {
  if (!enabled("wikimedia")) return [];
  const url = new URL(config.elements.wikimediaApiUrl);
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", input.q);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("gsroffset", String((input.page - 1) * input.pageSize));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  url.searchParams.set("iiurlwidth", "600");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  const data = await cached(`wikimedia:${url}`, () => fetchJson<any>(url), 600);
  return (data.query?.pages ?? []).flatMap((page: any) => {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl && !info?.url) return [];
    const mime = String(info.mime ?? "");
    if (!mime.startsWith("image/")) return [];
    const vector = mime === "image/svg+xml";
    const metadata = info.extmetadata ?? {};
    const license = metadataValue(metadata, "LicenseShortName") ?? "Wikimedia Commons license";
    const sourceUrl = metadataValue(metadata, "CanonicalPage")
      ?? `https://commons.wikimedia.org/?curid=${page.pageid}`;
    return [{
      id: `wikimedia:${page.pageid}`,
      name: String(page.title ?? "Wikimedia media").replace(/^File:/, "").replace(/\.[^.]+$/, ""),
      category: input.category === "all" ? (vector ? "illustrations" : "photos") : input.category,
      tags: [input.q, vector ? "vector" : "image", "commons"],
      provider: "wikimedia",
      providerLabel: "Wikimedia Commons",
      kind: vector ? "vector" : "image",
      license,
      licenseUrl: metadataValue(metadata, "LicenseUrl"),
      author: metadataValue(metadata, "Artist"),
      sourceUrl,
      attribution: metadataValue(metadata, "Credit") || metadataValue(metadata, "Attribution"),
      attributionRequired: !/public domain|cc0/i.test(license),
      previewUrl: `/api/elements-universe/wikimedia/${page.pageid}/content?size=preview`,
      assetUrl: `/api/elements-universe/wikimedia/${page.pageid}/content?size=full`,
      width: info.width,
      height: info.height,
      recolorable: vector,
    } satisfies UniverseElement];
  });
}

async function loadManifest(index: number): Promise<ElementManifest> {
  const existing = manifestCache.get(index);
  if (existing) return existing;
  const manifestUrl = config.elements.manifestUrls[index];
  if (!manifestUrl) throw new HTTPException(404, { message: "Element pack not found" });
  const manifest = await cached(`manifest:${manifestUrl}`, () => fetchJson<ElementManifest>(manifestUrl), 1_800);
  if (!Array.isArray(manifest.items)) manifest.items = [];
  manifestCache.set(index, manifest);
  return manifest;
}

async function searchManifests(input: {
  q: string;
  category: UniverseCategory;
  page: number;
  pageSize: number;
}): Promise<UniverseElement[]> {
  if (!enabled("manifest") || config.elements.manifestUrls.length === 0) return [];
  const manifests = await Promise.all(config.elements.manifestUrls.map((_, index) => loadManifest(index)));
  const needle = input.q.toLowerCase();
  const found: UniverseElement[] = [];
  manifests.forEach((manifest, manifestIndex) => {
    (manifest.items ?? []).forEach((item, itemIndex) => {
      const itemCategory = item.category ?? "illustrations";
      if (input.category !== "all" && itemCategory !== input.category) return;
      const searchable = [item.name, itemCategory, ...(item.tags ?? [])].join(" ").toLowerCase();
      if (needle && !searchable.includes(needle)) return;
      found.push({
        id: `manifest:${manifestIndex}:${item.id || itemIndex}`,
        name: item.name,
        category: itemCategory,
        tags: item.tags ?? [],
        provider: `manifest-${manifestIndex}`,
        providerLabel: manifest.name ?? `Open pack ${manifestIndex + 1}`,
        kind: item.type ?? (/\.svg(?:\?|$)/i.test(item.url) ? "vector" : "image"),
        license: item.license ?? manifest.license ?? "See pack license",
        licenseUrl: item.licenseUrl ?? manifest.licenseUrl,
        author: item.author,
        sourceUrl: item.sourceUrl,
        attribution: item.attribution ?? manifest.attribution,
        attributionRequired: item.attributionRequired ?? true,
        previewUrl: `/api/elements-universe/manifest/${manifestIndex}/${itemIndex}/content`,
        assetUrl: `/api/elements-universe/manifest/${manifestIndex}/${itemIndex}/content`,
        width: item.width,
        height: item.height,
        recolorable: item.recolorable ?? item.type === "vector",
      });
    });
  });
  const offset = (input.page - 1) * input.pageSize;
  return found.slice(offset, offset + input.pageSize);
}

async function searchUploads(input: {
  organizationId: string;
  clientId?: string;
  q: string;
  category: UniverseCategory;
  page: number;
  pageSize: number;
}): Promise<UniverseElement[]> {
  if (!enabled("uploads")) return [];
  const values: unknown[] = [input.organizationId];
  const conditions = ["organization_id = $1"];
  if (input.clientId) {
    values.push(input.clientId);
    conditions.push(`(client_id IS NULL OR client_id = $${values.length}::uuid)`);
  }
  if (input.q) {
    values.push(`%${input.q}%`);
    conditions.push(`(name ILIKE $${values.length} OR array_to_string(tags, ' ') ILIKE $${values.length})`);
  }
  values.push(input.pageSize, (input.page - 1) * input.pageSize);
  const rows = await query<any>(
    `SELECT id, name, category, tags, mime_type, license, author, source_url,
            attribution_required, size_bytes
       FROM assets
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return rows.map((item) => {
    const vector = item.mime_type === "image/svg+xml";
    return {
      id: `uploads:${item.id}`,
      name: item.name,
      category: input.category === "all" ? "illustrations" : input.category,
      tags: item.tags ?? [],
      provider: "uploads",
      providerLabel: "Your library",
      kind: vector ? "vector" : "image",
      license: item.license ?? "Private upload",
      author: item.author ?? undefined,
      sourceUrl: item.source_url ?? undefined,
      attributionRequired: Boolean(item.attribution_required),
      previewUrl: `/api/assets/${item.id}/content`,
      assetUrl: `/api/assets/${item.id}/content`,
      recolorable: vector,
    } satisfies UniverseElement;
  });
}

function builtinElements(q: string, requestedCategory: UniverseCategory): UniverseElement[] {
  if (!enabled("builtin")) return [];
  const legacyCategory = requestedCategory === "all" ? "all" : requestedCategory;
  return searchBuiltins(q, legacyCategory).map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category as UniverseCategory,
    tags: item.tags,
    provider: "builtin",
    providerLabel: "DDone built-in",
    kind: "vector",
    license: item.license,
    author: item.author,
    sourceUrl: item.sourceUrl,
    attributionRequired: false,
    svg: item.svg,
    assetUrl: item.svgUrl,
    recolorable: true,
  }));
}

function providerInfo(): ProviderInfo[] {
  return [
    {
      id: "builtin",
      label: "DDone",
      description: "Curated shapes, ornaments, frames, food and cocktail vectors.",
      enabled: enabled("builtin"),
      capabilities: ["vector"],
      attribution: "MIT/CC0 assets embedded in DDone Design.",
    },
    {
      id: "uploads",
      label: "Your library",
      description: "Private organization and client assets.",
      enabled: enabled("uploads"),
      capabilities: ["vector", "image"],
      attribution: "Uses the metadata supplied during upload.",
    },
    {
      id: "iconify",
      label: "Iconify",
      description: "Federated search across hundreds of open icon and emoji collections.",
      enabled: enabled("iconify"),
      capabilities: ["vector"],
      attribution: "Each icon keeps the license of its source collection.",
    },
    {
      id: "openverse",
      label: "Openverse",
      description: "Openly licensed photos, illustrations and public-domain media.",
      enabled: enabled("openverse"),
      capabilities: ["vector", "image"],
      attribution: "License and attribution are supplied per work by Openverse.",
    },
    {
      id: "wikimedia",
      label: "Wikimedia Commons",
      description: "Open and public-domain media from Wikimedia Commons.",
      enabled: enabled("wikimedia"),
      capabilities: ["vector", "image"],
      attribution: "License and author metadata are read from Commons.",
    },
    ...config.elements.manifestUrls.map((_, index) => ({
      id: `manifest-${index}`,
      label: `Open pack ${index + 1}`,
      description: "Administrator-configured open asset manifest.",
      enabled: enabled("manifest"),
      capabilities: ["vector", "image"] as Array<"vector" | "image">,
      attribution: "License metadata is supplied by the pack manifest.",
    })),
  ];
}

universe.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  console.error("Elements universe error", error);
  return c.json({ error: "Elements provider error" }, 500);
});

universe.get("/api/elements-universe/providers", requireAuth, requireOrganization, (c) => {
  return c.json({ providers: providerInfo(), categories: Object.keys(DEFAULT_QUERIES) });
});

universe.get("/api/elements-universe/search", requireAuth, requireOrganization, async (c) => {
  const requestedCategory = category(c.req.query("category"));
  const rawQuery = (c.req.query("q") ?? "").trim().slice(0, 160);
  const effectiveQuery = rawQuery || DEFAULT_QUERIES[requestedCategory];
  const page = positiveInt(c.req.query("page"), 1, 250);
  const pageSize = positiveInt(c.req.query("page_size"), 24, Math.min(config.elements.maxPerProvider, 64));
  const requestedProviders = new Set(
    (c.req.query("providers") ?? "")
      .split(",")
      .map((provider) => provider.trim())
      .filter(Boolean),
  );
  const shouldUse = (provider: string) => requestedProviders.size === 0 || requestedProviders.has(provider);
  const clientId = c.req.header("X-Client-ID") || undefined;
  const warnings: string[] = [];

  const jobs: Array<{ provider: string; promise: Promise<UniverseElement[]> }> = [];
  if (shouldUse("builtin")) jobs.push({ provider: "builtin", promise: Promise.resolve(builtinElements(rawQuery, requestedCategory)) });
  if (shouldUse("uploads")) jobs.push({
    provider: "uploads",
    promise: searchUploads({
      organizationId: c.get("organizationId"),
      clientId,
      q: rawQuery,
      category: requestedCategory,
      page,
      pageSize,
    }),
  });
  if (shouldUse("iconify")) jobs.push({ provider: "iconify", promise: searchIconify({ q: effectiveQuery, category: requestedCategory, pageSize }) });
  if (shouldUse("openverse")) jobs.push({ provider: "openverse", promise: searchOpenverse({ q: effectiveQuery, category: requestedCategory, page, pageSize }) });
  if (shouldUse("wikimedia")) jobs.push({ provider: "wikimedia", promise: searchWikimedia({ q: effectiveQuery, category: requestedCategory, page, pageSize }) });
  if (shouldUse("manifest") || [...requestedProviders].some((value) => value.startsWith("manifest-"))) {
    jobs.push({ provider: "manifest", promise: searchManifests({ q: rawQuery, category: requestedCategory, page, pageSize }) });
  }

  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  const items: UniverseElement[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") items.push(...result.value);
    else {
      warnings.push(`${jobs[index].provider} is temporarily unavailable`);
      console.warn(`Element provider ${jobs[index].provider} failed`, result.reason);
    }
  });

  const unique = [...new Map(items.map((item) => [item.id, item])).values()];
  const priority: Record<string, number> = { uploads: 0, builtin: 1, iconify: 2, openverse: 3, wikimedia: 4 };
  unique.sort((first, second) => (priority[first.provider] ?? 5) - (priority[second.provider] ?? 5));
  return c.json({
    items: unique,
    page,
    pageSize,
    nextPage: unique.length > 0 ? page + 1 : null,
    query: rawQuery,
    effectiveQuery,
    category: requestedCategory,
    providers: providerInfo(),
    warnings,
  });
});

universe.get("/api/elements-universe/iconify/:prefix/:name", requireAuth, requireOrganization, async (c) => {
  const prefix = c.req.param("prefix");
  const name = c.req.param("name");
  if (!/^[a-z0-9-]+$/i.test(prefix) || !/^[a-z0-9-]+$/i.test(name)) {
    throw new HTTPException(400, { message: "Invalid icon identifier" });
  }
  const response = await fetch(
    `${config.iconify.apiUrl}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`,
    { signal: AbortSignal.timeout(config.elements.requestTimeoutMs) },
  );
  if (!response.ok) throw new HTTPException(404, { message: "Icon not found" });
  const svg = await response.text();
  if (!svg.trimStart().startsWith("<svg")) throw new HTTPException(502, { message: "Invalid icon response" });
  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=604800, immutable",
  });
});

universe.get("/api/elements-universe/openverse/:id/content", requireAuth, requireOrganization, async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9-]{20,}$/i.test(id)) throw new HTTPException(400, { message: "Invalid media identifier" });
  const full = c.req.query("size") === "full";
  const url = new URL(`/v1/images/${encodeURIComponent(id)}/thumb/`, config.elements.openverseApiUrl);
  if (full) url.searchParams.set("full_size", "true");
  const response = await fetch(url, {
    headers: openverseHeaders(),
    signal: AbortSignal.timeout(config.elements.requestTimeoutMs * 2),
  });
  if (!response.ok) throw new HTTPException(404, { message: "Openverse image unavailable" });
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) throw new HTTPException(502, { message: "Invalid media response" });
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 30 * 1024 * 1024) throw new HTTPException(413, { message: "Remote image is too large" });
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400",
    },
  });
});

universe.get("/api/elements-universe/wikimedia/:pageId/content", requireAuth, requireOrganization, async (c) => {
  const pageId = c.req.param("pageId");
  if (!/^\d+$/.test(pageId)) throw new HTTPException(400, { message: "Invalid media identifier" });
  const page = await wikimediaPage(pageId);
  const info = page?.imageinfo?.[0];
  const source = c.req.query("size") === "full" ? info?.url : info?.thumburl || info?.url;
  if (!source) throw new HTTPException(404, { message: "Wikimedia image unavailable" });
  const sourceUrl = new URL(source);
  if (sourceUrl.protocol !== "https:" || !sourceUrl.hostname.endsWith("wikimedia.org")) {
    throw new HTTPException(502, { message: "Unexpected Wikimedia media host" });
  }
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(config.elements.requestTimeoutMs * 2) });
  if (!response.ok) throw new HTTPException(404, { message: "Wikimedia image unavailable" });
  const contentType = response.headers.get("content-type") ?? info.mime ?? "image/jpeg";
  if (!contentType.startsWith("image/")) throw new HTTPException(502, { message: "Invalid media response" });
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 30 * 1024 * 1024) throw new HTTPException(413, { message: "Remote image is too large" });
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400",
    },
  });
});

universe.get("/api/elements-universe/manifest/:manifestIndex/:itemIndex/content", requireAuth, requireOrganization, async (c) => {
  const manifestIndex = positiveInt(c.req.param("manifestIndex"), 1, 10_000);
  const itemIndex = positiveInt(c.req.param("itemIndex"), 1, 1_000_000);
  const manifest = await loadManifest(manifestIndex);
  const item = manifest.items?.[itemIndex];
  if (!item) throw new HTTPException(404, { message: "Pack item not found" });
  const manifestOrigin = new URL(config.elements.manifestUrls[manifestIndex]).origin;
  const source = new URL(item.url, config.elements.manifestUrls[manifestIndex]);
  if (source.protocol !== "https:" || source.origin !== manifestOrigin) {
    throw new HTTPException(403, { message: "Pack item host is not allowed" });
  }
  const response = await fetch(source, { signal: AbortSignal.timeout(config.elements.requestTimeoutMs * 2) });
  if (!response.ok) throw new HTTPException(404, { message: "Pack item unavailable" });
  const contentType = response.headers.get("content-type") ?? (item.type === "vector" ? "image/svg+xml" : "image/png");
  if (!contentType.startsWith("image/")) throw new HTTPException(502, { message: "Invalid pack response" });
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 30 * 1024 * 1024) throw new HTTPException(413, { message: "Pack item is too large" });
  return new Response(bytes, { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=86400" } });
});

export default universe;
