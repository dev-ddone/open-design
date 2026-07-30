import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppVariables } from "./auth.js";
import { requireAuth, requireOrganization } from "./auth.js";
import { config } from "./config.js";
import { query } from "./db.js";
import { getObject } from "./storage.js";
import {
  type CatalogCategory,
  type CatalogElement,
  type CatalogFormat,
  localPackInfo,
  localPackPng,
  localPackSvg,
  searchLocalAssetPacks,
} from "./local-asset-packs.js";
import translations from "../client/translations/index.js";

const lang = config.lang;

interface ProviderInfo {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  capabilities: Array<"vector" | "image">;
  attribution: string;
}

interface CacheRecord<T> {
  value: T;
  expiresAt: number;
}

const catalog = new Hono<{ Variables: AppVariables }>();
const cache = new Map<string, CacheRecord<unknown>>();

export const SUPPORTED_ELEMENT_CATEGORIES: CatalogCategory[] = [
  "all",
  "shapes",
  "graphics",
  "photos",
  "charts",
  "modules",
  "tables",
  "frames",
  "grids",
  "mockups",
  "icons",
  "illustrations",
  "emoji",
  "ornaments",
  "food",
  "cocktails",
  "backgrounds",
  "patterns",
  "social",
];

const DEFAULT_QUERIES: Record<CatalogCategory, string> = {
  all: "restaurant design",
  shapes: "geometric shape",
  icons: "restaurant icon",
  graphics: "modern graphic design",
  illustrations: "restaurant illustration",
  photos: "restaurant food",
  emoji: "food smile",
  ornaments: "floral ornament divider",
  frames: "decorative frame border",
  grids: "photo grid collage",
  charts: "business chart",
  tables: "restaurant menu table price list",
  modules: "dashboard card checklist",
  mockups: "phone laptop poster mockup",
  food: "food restaurant pizza pasta",
  cocktails: "cocktail drink wine glass",
  backgrounds: "paper texture background",
  social: "social media icon",
  patterns: "seamless geometric pattern",
};

const STRUCTURAL_CATEGORIES = new Set<CatalogCategory>([
  "shapes",
  "charts",
  "tables",
  "modules",
  "grids",
  "mockups",
]);

function positiveInt(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), maximum) : fallback;
}

function requestedCategory(value: string | undefined): CatalogCategory {
  return SUPPORTED_ELEMENT_CATEGORIES.includes(value as CatalogCategory)
    ? value as CatalogCategory
    : "all";
}

function requestedFormat(value: string | undefined): CatalogFormat {
  return ["all", "svg", "png-transparent", "jpg"].includes(value ?? "")
    ? value as CatalogFormat
    : "all";
}

function enabled(provider: string): boolean {
  return config.elements.enabledProviders.includes(provider);
}

function configured(provider: string): boolean {
  if (["local-structures", "local-tabler", "local-twemoji"].includes(provider)) return true;
  if (!enabled(provider)) return false;
  if (provider === "pexels") return Boolean(config.elements.pexelsApiKey);
  if (provider === "pixabay") return Boolean(config.elements.pixabayApiKey);
  return ["uploads", "iconify", "openverse", "wikimedia"].includes(provider);
}

async function cached<T>(key: string, loader: () => Promise<T>, ttlSeconds = 600): Promise<T> {
  const current = cache.get(key) as CacheRecord<T> | undefined;
  if (current && current.expiresAt > Date.now()) return current.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
  if (cache.size > 500) {
    for (const [cacheKey, record] of cache) {
      if (record.expiresAt <= Date.now()) cache.delete(cacheKey);
      if (cache.size <= 400) break;
    }
  }
  return value;
}

async function fetchJson<T>(url: URL | string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "DDone-Design/2.3 strict-elements",
      ...headers,
    },
    signal: AbortSignal.timeout(config.elements.requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json() as Promise<T>;
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

function mimeFormat(mime: string, filename = ""): CatalogElement["format"] {
  const value = `${mime} ${filename}`.toLowerCase();
  if (value.includes("svg")) return "svg";
  if (value.includes("png")) return "png";
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("webp")) return "webp";
  return "other";
}

function pngHasTransparency(bytes: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((value, index) => bytes[index] === value)) return false;
  let offset = 8;
  let colorType: number | undefined;
  while (offset + 12 <= bytes.length) {
    const length = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataOffset = offset + 8;
    if (type === "IHDR" && length >= 10) colorType = bytes[dataOffset + 9];
    if (type === "tRNS") return true;
    if (type === "IEND") break;
    offset += 12 + length;
  }
  return colorType === 4 || colorType === 6;
}

function itemMatchesFormat(item: CatalogElement, format: CatalogFormat): boolean {
  if (format === "all") return true;
  if (format === "svg") return item.format === "svg";
  if (format === "jpg") return item.format === "jpg";
  return item.format === "png" && item.transparent === true;
}

function providerInfo(): ProviderInfo[] {
  return [
    ...(localPackInfo() as ProviderInfo[]),
    {
      id: "uploads",
      label: "La tua libreria",
      description: "SVG, PNG, JPG e WebP caricati nel workspace. I PNG sono analizzati per verificare davvero il canale alpha.",
      enabled: configured("uploads"),
      capabilities: ["vector", "image"],
      attribution: "Uses metadata supplied during upload.",
    },
    {
      id: "iconify",
      label: "Iconify online",
      description: "Ricerca online aggiuntiva tra collezioni di icone open source.",
      enabled: configured("iconify"),
      capabilities: ["vector"],
      attribution: "Each icon keeps the source collection license.",
    },
    {
      id: "openverse",
      label: "Openverse",
      description: "Foto e illustrazioni con licenze Creative Commons o pubblico dominio.",
      enabled: configured("openverse"),
      capabilities: ["vector", "image"],
      attribution: "License and attribution supplied per work.",
    },
    {
      id: "wikimedia",
      label: "Wikimedia Commons",
      description: "SVG, PNG e JPG con MIME verificato dall’API MediaWiki.",
      enabled: configured("wikimedia"),
      capabilities: ["vector", "image"],
      attribution: "License and author read from Commons metadata.",
    },
    {
      id: "pexels",
      label: "Pexels Foto",
      description: "Foto JPG stock. Richiede PEXELS_API_KEY.",
      enabled: configured("pexels"),
      capabilities: ["image"],
      attribution: "Pexels link and photographer credit retained.",
    },
    {
      id: "pixabay",
      label: "Pixabay Immagini",
      description: "Foto e illustrazioni JPG. Richiede PIXABAY_API_KEY.",
      enabled: configured("pixabay"),
      capabilities: ["image"],
      attribution: "Source and author metadata retained.",
    },
  ];
}

async function searchUploads(input: {
  organizationId: string;
  clientId?: string;
  q: string;
  category: CatalogCategory;
  format: CatalogFormat;
  page: number;
  pageSize: number;
}): Promise<CatalogElement[]> {
  if (!configured("uploads")) return [];
  const values: unknown[] = [input.organizationId];
  const conditions = ["organization_id = $1", "mime_type LIKE 'image/%'", "mime_type <> 'image/gif'"];
  if (input.clientId) {
    values.push(input.clientId);
    conditions.push(`(client_id IS NULL OR client_id = $${values.length}::uuid)`);
  }
  if (input.category !== "all") {
    values.push(input.category);
    conditions.push(`category = $${values.length}`);
  }
  if (input.q) {
    values.push(`%${input.q}%`);
    conditions.push(`(name ILIKE $${values.length} OR array_to_string(tags, ' ') ILIKE $${values.length})`);
  }
  values.push(Math.min(input.pageSize * 2, 64), (input.page - 1) * input.pageSize);
  const rows = await query<any>(
    `SELECT id,name,category,tags,mime_type,license,author,source_url,attribution_required,storage_key
       FROM assets
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  const items = await Promise.all(rows.map(async (row) => {
    const format = mimeFormat(row.mime_type, row.name);
    if (!(["svg", "png", "jpg", "webp"] as string[]).includes(format)) return null;
    let transparent = format === "svg";
    if (format === "png") {
      const cacheKey = `png-alpha:${row.storage_key}`;
      transparent = await cached(cacheKey, async () => {
        const stored = await getObject(row.storage_key, row.mime_type);
        return stored ? pngHasTransparency(new Uint8Array(stored.data)) : false;
      }, 3_600);
    }
    const category = SUPPORTED_ELEMENT_CATEGORIES.includes(row.category as CatalogCategory)
      ? row.category as CatalogCategory
      : "illustrations";
    const item: CatalogElement = {
      id: `uploads:${row.id}`,
      name: row.name,
      category,
      tags: row.tags ?? [],
      provider: "uploads",
      providerLabel: "La tua libreria",
      kind: format === "svg" ? "vector" : "image",
      format,
      transparent,
      license: row.license ?? "Private upload",
      author: row.author ?? undefined,
      sourceUrl: row.source_url ?? undefined,
      attributionRequired: Boolean(row.attribution_required),
      previewUrl: `/api/assets/${row.id}/content`,
      assetUrl: `/api/assets/${row.id}/content`,
      recolorable: format === "svg",
    };
    return itemMatchesFormat(item, input.format) ? item : null;
  }));
  return items.filter(Boolean).slice(0, input.pageSize) as CatalogElement[];
}

async function searchIconify(input: {
  q: string;
  category: CatalogCategory;
  format: CatalogFormat;
  pageSize: number;
}): Promise<CatalogElement[]> {
  if (!configured("iconify") || !["all", "svg"].includes(input.format)) return [];
  if (!["all", "icons", "graphics", "illustrations", "emoji", "ornaments", "food", "cocktails", "social"].includes(input.category)) return [];
  const url = new URL("/search", config.iconify.apiUrl);
  url.searchParams.set("query", input.q);
  url.searchParams.set("limit", String(Math.min(input.pageSize, 48)));
  if (input.category === "emoji") url.searchParams.set("prefixes", "twemoji,noto,openmoji");
  const data = await cached(`iconify-v2:${url}`, () => fetchJson<any>(url), 900);
  return (data.icons ?? []).map((identifier: string) => {
    const [prefix, name] = identifier.split(":");
    const collection = data.collections?.[prefix];
    const license = collection?.license?.spdx || collection?.license?.title || "See source collection";
    return {
      id: `iconify:${prefix}:${name}`,
      name: name.replace(/-/g, " "),
      category: input.category === "all" ? "icons" : input.category,
      tags: [prefix, name, input.q],
      provider: "iconify",
      providerLabel: collection?.name || `Iconify · ${prefix}`,
      kind: "vector",
      format: "svg",
      transparent: true,
      license,
      licenseUrl: collection?.license?.url,
      sourceUrl: `https://icon-sets.iconify.design/${prefix}/${name}/`,
      attributionRequired: !["MIT", "CC0-1.0", "Apache-2.0"].includes(license),
      previewUrl: `/api/elements-universe/iconify/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}`,
      assetUrl: `/api/elements-universe/iconify/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}`,
      recolorable: collection?.palette !== true,
    } satisfies CatalogElement;
  });
}

async function searchOpenverse(input: {
  q: string;
  category: CatalogCategory;
  format: CatalogFormat;
  page: number;
  pageSize: number;
}): Promise<CatalogElement[]> {
  if (!configured("openverse") || input.format === "png-transparent" || STRUCTURAL_CATEGORIES.has(input.category)) return [];
  if (["icons", "emoji", "social"].includes(input.category)) return [];
  const url = new URL("/v1/images/", config.elements.openverseApiUrl);
  url.searchParams.set("q", input.q);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("page_size", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("mature", "false");
  url.searchParams.set("license", config.elements.allowedOpenverseLicenses.join(","));
  if (input.format === "svg") url.searchParams.set("extension", "svg");
  if (input.format === "jpg") url.searchParams.set("extension", "jpg,jpeg");
  if (["graphics", "illustrations", "ornaments", "frames", "patterns"].includes(input.category)) {
    url.searchParams.set("category", "illustration");
  }
  if (["photos", "backgrounds"].includes(input.category)) url.searchParams.set("category", "photograph");
  const data = await cached(`openverse-v2:${url}`, () => fetchJson<any>(url), 600);
  return (data.results ?? []).flatMap((row: any) => {
    const format = mimeFormat(String(row.filetype ?? ""), String(row.url ?? ""));
    if (!["svg", "png", "jpg", "webp"].includes(format)) return [];
    const item: CatalogElement = {
      id: `openverse:${row.id}`,
      name: cleanText(row.title) ?? "Open image",
      category: input.category === "all" ? row.category === "illustration" ? "illustrations" : "photos" : input.category,
      tags: (row.tags ?? []).slice(0, 12).map((tag: any) => cleanText(tag.name)).filter(Boolean),
      provider: "openverse",
      providerLabel: `Openverse · ${row.source || row.provider || "open media"}`,
      kind: format === "svg" ? "vector" : "image",
      format,
      transparent: format === "svg",
      license: String(row.license ?? "open license").toUpperCase(),
      licenseUrl: row.license_url,
      author: cleanText(row.creator),
      sourceUrl: row.foreign_landing_url,
      attribution: cleanText(row.attribution),
      attributionRequired: !["cc0", "pdm"].includes(String(row.license ?? "").toLowerCase()),
      previewUrl: `/api/elements-universe/openverse/${encodeURIComponent(row.id)}/content?size=preview`,
      assetUrl: `/api/elements-universe/openverse/${encodeURIComponent(row.id)}/content?size=full`,
      width: row.width || undefined,
      height: row.height || undefined,
      recolorable: format === "svg",
    };
    return itemMatchesFormat(item, input.format) ? [item] : [];
  });
}

function metadataValue(metadata: any, key: string): string | undefined {
  return cleanText(metadata?.[key]?.value);
}

async function searchWikimedia(input: {
  q: string;
  category: CatalogCategory;
  format: CatalogFormat;
  page: number;
  pageSize: number;
}): Promise<CatalogElement[]> {
  if (!configured("wikimedia") || input.format === "png-transparent" || STRUCTURAL_CATEGORIES.has(input.category)) return [];
  if (["icons", "emoji", "social"].includes(input.category)) return [];
  const url = new URL(config.elements.wikimediaApiUrl);
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", input.q);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("gsroffset", String((input.page - 1) * input.pageSize));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  url.searchParams.set("iiurlwidth", "640");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  const data = await cached(`wikimedia-v2:${url}`, () => fetchJson<any>(url), 600);
  return (data.query?.pages ?? []).flatMap((page: any) => {
    const info = page.imageinfo?.[0];
    if (!info?.url || !String(info.mime ?? "").startsWith("image/")) return [];
    const format = mimeFormat(String(info.mime), String(info.url));
    if (!["svg", "png", "jpg", "webp"].includes(format)) return [];
    const metadata = info.extmetadata ?? {};
    const license = metadataValue(metadata, "LicenseShortName") ?? "Wikimedia Commons license";
    const item: CatalogElement = {
      id: `wikimedia:${page.pageid}`,
      name: String(page.title ?? "Wikimedia image").replace(/^File:/, "").replace(/\.[^.]+$/, ""),
      category: input.category === "all" ? format === "svg" ? "illustrations" : "photos" : input.category,
      tags: [input.q, format, "commons"],
      provider: "wikimedia",
      providerLabel: "Wikimedia Commons",
      kind: format === "svg" ? "vector" : "image",
      format,
      transparent: format === "svg",
      license,
      licenseUrl: metadataValue(metadata, "LicenseUrl"),
      author: metadataValue(metadata, "Artist"),
      sourceUrl: metadataValue(metadata, "CanonicalPage") ?? `https://commons.wikimedia.org/?curid=${page.pageid}`,
      attribution: metadataValue(metadata, "Credit") || metadataValue(metadata, "Attribution"),
      attributionRequired: !/public domain|cc0/i.test(license),
      previewUrl: `/api/elements-universe/wikimedia/${page.pageid}/content?size=preview`,
      assetUrl: `/api/elements-universe/wikimedia/${page.pageid}/content?size=full`,
      width: info.width,
      height: info.height,
      recolorable: format === "svg",
    };
    return itemMatchesFormat(item, input.format) ? [item] : [];
  });
}

async function searchPexelsPhotos(input: {
  q: string;
  category: CatalogCategory;
  format: CatalogFormat;
  page: number;
  pageSize: number;
}): Promise<CatalogElement[]> {
  if (!configured("pexels") || !["all", "jpg"].includes(input.format)) return [];
  if (!["all", "photos", "backgrounds"].includes(input.category)) return [];
  const url = new URL("/v1/search", config.elements.pexelsApiUrl);
  url.searchParams.set("query", input.q);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("per_page", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("locale", "it-IT");
  const data = await cached(`pexels-photo-v2:${url}`, () => fetchJson<any>(url, { Authorization: config.elements.pexelsApiKey! }), 600);
  return (data.photos ?? []).map((row: any) => ({
    id: `pexels-photo:${row.id}`,
    name: cleanText(row.alt) ?? `Foto di ${cleanText(row.photographer) ?? "Pexels"}`,
    category: input.category === "all" ? "photos" : input.category,
    tags: [input.q, "photo", "pexels"],
    provider: "pexels",
    providerLabel: "Pexels Foto",
    kind: "image",
    format: "jpg",
    transparent: false,
    license: "Pexels License",
    sourceUrl: row.url,
    author: cleanText(row.photographer),
    attribution: row.photographer ? `Foto di ${row.photographer} su Pexels` : "Foto da Pexels",
    attributionRequired: true,
    previewUrl: `/api/elements-universe/pexels/photo/${row.id}/content?size=preview`,
    assetUrl: `/api/elements-universe/pexels/photo/${row.id}/content?size=full`,
    width: row.width,
    height: row.height,
    recolorable: false,
  } satisfies CatalogElement));
}

async function searchPixabayImages(input: {
  q: string;
  category: CatalogCategory;
  format: CatalogFormat;
  page: number;
  pageSize: number;
}): Promise<CatalogElement[]> {
  if (!configured("pixabay") || !["all", "jpg"].includes(input.format)) return [];
  if (![
    "all",
    "photos",
    "graphics",
    "illustrations",
    "backgrounds",
    "ornaments",
    "frames",
    "food",
    "cocktails",
  ].includes(input.category)) return [];
  const url = new URL(config.elements.pixabayApiUrl);
  url.searchParams.set("key", config.elements.pixabayApiKey!);
  url.searchParams.set("q", input.q);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("per_page", String(Math.min(Math.max(input.pageSize, 3), 40)));
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("lang", "it");
  if (["graphics", "illustrations", "ornaments", "frames"].includes(input.category)) url.searchParams.set("image_type", "illustration");
  else url.searchParams.set("image_type", "photo");
  const data = await cached(`pixabay-image-v2:${url}`, () => fetchJson<any>(url), 600);
  return (data.hits ?? []).map((row: any) => ({
    id: `pixabay-image:${row.id}`,
    name: cleanText(row.tags) ?? `Pixabay image ${row.id}`,
    category: input.category === "all" ? row.type === "illustration" ? "illustrations" : "photos" : input.category,
    tags: String(row.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
    provider: "pixabay",
    providerLabel: "Pixabay Immagini",
    kind: "image",
    format: "jpg",
    transparent: false,
    license: "Pixabay Content License",
    sourceUrl: row.pageURL,
    author: cleanText(row.user),
    attribution: row.user ? `Immagine di ${row.user} su Pixabay` : "Immagine da Pixabay",
    attributionRequired: true,
    previewUrl: `/api/elements-universe/pixabay/image/${row.id}/content?size=preview`,
    assetUrl: `/api/elements-universe/pixabay/image/${row.id}/content?size=full`,
    width: row.imageWidth,
    height: row.imageHeight,
    recolorable: false,
  } satisfies CatalogElement));
}

catalog.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  console.error("Strict Elements catalog error", error);
  return c.json({ error: "Elements catalog error" }, 500);
});

catalog.get("/api/elements-universe/providers", requireAuth, requireOrganization, (c) => {
  return c.json({
    providers: providerInfo(),
    categories: SUPPORTED_ELEMENT_CATEGORIES,
    formats: ["all", "svg", "png-transparent", "jpg"],
  });
});

catalog.get("/api/elements-universe/search", requireAuth, requireOrganization, async (c) => {
  const category = requestedCategory(c.req.query("category"));
  const format = requestedFormat((c.req.query("formats") ?? "").split(",")[0]);
  const rawQuery = (c.req.query("q") ?? "").trim().slice(0, 160);
  const effectiveQuery = rawQuery || DEFAULT_QUERIES[category];
  const page = positiveInt(c.req.query("page"), 1, 250);
  const pageSize = positiveInt(c.req.query("page_size"), 24, Math.min(config.elements.maxPerProvider, 64));
  const selectedProviders = new Set((c.req.query("providers") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  const shouldUse = (provider: string) => selectedProviders.size === 0 || selectedProviders.has(provider);
  const warnings: string[] = [];
  const jobs: Array<{ provider: string; promise: Promise<CatalogElement[]> }> = [];

  if (shouldUse("local-structures") || shouldUse("local-tabler") || shouldUse("local-twemoji")) {
    const local = searchLocalAssetPacks({ q: rawQuery, category, format, page, pageSize: Math.max(pageSize, 24) })
      .filter((item) => selectedProviders.size === 0 || selectedProviders.has(item.provider));
    jobs.push({ provider: "local-packs", promise: Promise.resolve(local) });
  }
  if (shouldUse("uploads")) {
    jobs.push({
      provider: "uploads",
      promise: searchUploads({
        organizationId: c.get("organizationId"),
        clientId: c.req.header("X-Client-ID") || undefined,
        q: rawQuery,
        category,
        format,
        page,
        pageSize,
      }),
    });
  }

  if (!STRUCTURAL_CATEGORIES.has(category)) {
    if (shouldUse("iconify")) jobs.push({ provider: "iconify", promise: searchIconify({ q: effectiveQuery, category, format, pageSize }) });
    if (shouldUse("openverse")) jobs.push({ provider: "openverse", promise: searchOpenverse({ q: effectiveQuery, category, format, page, pageSize }) });
    if (shouldUse("wikimedia")) jobs.push({ provider: "wikimedia", promise: searchWikimedia({ q: effectiveQuery, category, format, page, pageSize }) });
    if (shouldUse("pexels")) jobs.push({ provider: "pexels", promise: searchPexelsPhotos({ q: effectiveQuery, category, format, page, pageSize }) });
    if (shouldUse("pixabay")) jobs.push({ provider: "pixabay", promise: searchPixabayImages({ q: effectiveQuery, category, format, page, pageSize }) });
  }

  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  const items: CatalogElement[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") items.push(...result.value);
    else {
      warnings.push(`${jobs[index].provider} ${translations[lang].temporarilyUnavailable}`);
      console.warn(`Element provider ${jobs[index].provider} failed`, result.reason);
    }
  });

  const unique = [...new Map(items.map((item) => [item.id, item])).values()]
    .filter((item) => category === "all" || item.category === category)
    .filter((item) => itemMatchesFormat(item, format));
  const priority: Record<string, number> = {
    "local-structures": 0,
    uploads: 1,
    "local-tabler": 2,
    "local-twemoji": 3,
    iconify: 4,
    openverse: 5,
    wikimedia: 6,
    pexels: 7,
    pixabay: 8,
  };
  unique.sort((first, second) => (priority[first.provider] ?? 20) - (priority[second.provider] ?? 20));

  return c.json({
    items: unique,
    page,
    pageSize,
    nextPage: unique.length >= pageSize ? page + 1 : null,
    query: rawQuery,
    effectiveQuery,
    category,
    format,
    providers: providerInfo(),
    warnings,
  });
});

catalog.get("/api/elements-universe/local-pack/:pack/:filename", requireAuth, requireOrganization, (c) => {
  const pack = c.req.param("pack");
  const filename = c.req.param("filename");
  if (!/^(structures|tabler|twemoji)$/.test(pack)) throw new HTTPException(400, { message: "Invalid local pack" });
  const match = /^([a-z0-9-]+)\.(svg|png)$/i.exec(filename);
  if (!match) throw new HTTPException(400, { message: "Invalid local asset identifier" });
  const [, name, extension] = match;
  if (extension.toLowerCase() === "svg") {
    const svg = localPackSvg(pack, name);
    if (!svg) throw new HTTPException(404, { message: "Local SVG not found" });
    return c.body(svg, 200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
  }
  const size = positiveInt(c.req.query("size"), 512, 2048);
  const png = localPackPng(pack, name, size);
  if (!png) throw new HTTPException(404, { message: "Local PNG not found" });
  return new Response(new Blob([Uint8Array.from(png)], { type: "image/png" }), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export default catalog;
