import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppVariables } from "./auth.js";
import { requireAuth, requireOrganization } from "./auth.js";
import { config } from "./config.js";
import { query } from "./db.js";
import { searchBuiltins } from "./elements.js";

export type UniverseCategory =
  | "all"
  | "shapes"
  | "icons"
  | "graphics"
  | "illustrations"
  | "photos"
  | "animations"
  | "videos"
  | "audio"
  | "emoji"
  | "ornaments"
  | "frames"
  | "grids"
  | "charts"
  | "tables"
  | "modules"
  | "mockups"
  | "models3d"
  | "food"
  | "cocktails"
  | "backgrounds"
  | "social"
  | "patterns";

export type UniverseKind = "vector" | "image" | "gif" | "video" | "audio" | "model";
export type UniverseFormat = "svg" | "png" | "jpg" | "webp" | "gif" | "mp4" | "mp3" | "wav" | "glb" | "gltf" | "other";

export type UniverseProvider =
  | "builtin"
  | "uploads"
  | "iconify"
  | "openverse"
  | "wikimedia"
  | "pexels"
  | "pixabay"
  | "giphy"
  | "freesound"
  | "jamendo"
  | "sketchfab"
  | "manifest";

export interface UniverseElement {
  id: string;
  name: string;
  category: UniverseCategory;
  tags: string[];
  provider: UniverseProvider | string;
  providerLabel: string;
  kind: UniverseKind;
  format?: UniverseFormat;
  transparent?: boolean;
  duration?: number;
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
  capabilities: UniverseKind[];
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
  type?: UniverseKind;
  format?: UniverseFormat;
  transparent?: boolean;
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
  duration?: number;
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
  shapes: "geometric shape",
  icons: "restaurant",
  graphics: "modern graphic design",
  illustrations: "restaurant illustration",
  photos: "restaurant food",
  animations: "restaurant sticker",
  videos: "restaurant food",
  audio: "restaurant ambience",
  emoji: "food smile",
  ornaments: "floral ornament divider",
  frames: "decorative frame border",
  grids: "photo grid collage",
  charts: "business chart",
  tables: "menu table",
  modules: "dashboard card checklist",
  mockups: "phone laptop packaging mockup",
  models3d: "restaurant food furniture",
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

function configured(provider: UniverseProvider): boolean {
  if (!enabled(provider)) return false;
  if (provider === "pexels") return Boolean(config.elements.pexelsApiKey);
  if (provider === "pixabay") return Boolean(config.elements.pixabayApiKey);
  if (provider === "giphy") return Boolean(config.elements.giphyApiKey);
  if (provider === "freesound") return Boolean(config.elements.freesoundToken);
  if (provider === "jamendo") return Boolean(config.elements.jamendoClientId);
  return true;
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
  return Object.hasOwn(DEFAULT_QUERIES, value ?? "") ? value as UniverseCategory : "all";
}

function inferFormat(value: string | undefined, mime?: string): UniverseFormat {
  const lower = `${value ?? ""} ${mime ?? ""}`.toLowerCase();
  if (lower.includes("svg")) return "svg";
  if (lower.includes("png")) return "png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
  if (lower.includes("wav")) return "wav";
  if (lower.includes("gltf")) return "gltf";
  if (lower.includes("glb")) return "glb";
  return "other";
}

function kindForFormat(format: UniverseFormat): UniverseKind {
  if (format === "svg") return "vector";
  if (format === "gif") return "gif";
  if (format === "mp4") return "video";
  if (format === "mp3" || format === "wav") return "audio";
  if (format === "glb" || format === "gltf") return "model";
  return "image";
}

async function cached<T>(key: string, loader: () => Promise<T>, ttlSeconds = config.elements.cacheTtlSeconds): Promise<T> {
  const current = cache.get(key) as CacheRecord<T> | undefined;
  if (current && current.expiresAt > Date.now()) return current.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
  if (cache.size > 700) {
    for (const [cacheKey, record] of cache) {
      if (record.expiresAt <= Date.now()) cache.delete(cacheKey);
      if (cache.size <= 560) break;
    }
  }
  return value;
}

async function fetchJson<T>(url: URL | string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": "DDone-Design/2.3 federated-elements", Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(config.elements.requestTimeoutMs),
  });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function mediaResponse(source: string, fallbackType: string, allowedHosts?: string[]): Promise<Response> {
  const url = new URL(source);
  if (url.protocol !== "https:") throw new HTTPException(502, { message: "Unexpected non-HTTPS media URL" });
  if (allowedHosts?.length && !allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new HTTPException(502, { message: "Unexpected media host" });
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(config.elements.requestTimeoutMs * 2) });
  if (!response.ok) throw new HTTPException(404, { message: "Remote media unavailable" });
  const contentType = response.headers.get("content-type") ?? fallbackType;
  if (!/^(image|video|audio)\//.test(contentType)) throw new HTTPException(502, { message: "Invalid media response" });
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 50 * 1024 * 1024) throw new HTTPException(413, { message: "Remote media is too large" });
  return new Response(bytes, { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=86400" } });
}

function iconifyLicense(info: any): { name: string; url?: string } {
  const license = info?.license;
  if (!license) return { name: "See source collection" };
  return { name: license.spdx || license.title || "See source collection", url: license.url };
}

async function searchIconify(input: { q: string; category: UniverseCategory; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("iconify") || ["photos", "videos", "audio", "models3d", "animations"].includes(input.category)) return [];
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
      format: "svg",
      transparent: true,
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

async function searchOpenverseImages(input: { q: string; category: UniverseCategory; page: number; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("openverse") || input.category === "audio" || input.category === "videos" || input.category === "models3d") return [];
  const url = new URL("/v1/images/", config.elements.openverseApiUrl);
  url.searchParams.set("q", input.q);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("page_size", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("mature", "false");
  url.searchParams.set("license", config.elements.allowedOpenverseLicenses.join(","));
  if (["illustrations", "graphics", "icons", "ornaments", "frames"].includes(input.category)) url.searchParams.set("categories", "illustration");
  if (input.category === "photos") url.searchParams.set("categories", "photograph");
  const data = await cached(`openverse-image:${url}`, () => fetchJson<any>(url), 600);
  return (data.results ?? []).map((item: any) => {
    const format = inferFormat(item.filetype, item.frontend_media_type);
    const vector = format === "svg";
    const animated = format === "gif";
    const resolvedCategory = input.category === "all"
      ? animated ? "animations" : item.category === "illustration" ? "illustrations" : "photos"
      : input.category;
    return {
      id: `openverse:${item.id}`,
      name: cleanText(item.title) ?? "Open image",
      category: resolvedCategory,
      tags: (item.tags ?? []).slice(0, 12).map((tag: any) => cleanText(tag.name)).filter(Boolean),
      provider: "openverse",
      providerLabel: `Openverse · ${item.source || item.provider || "open media"}`,
      kind: animated ? "gif" : vector ? "vector" : "image",
      format,
      transparent: vector || format === "png" || animated,
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

async function searchOpenverseAudio(input: { q: string; page: number; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("openverse")) return [];
  const url = new URL("/v1/audio/", config.elements.openverseApiUrl);
  url.searchParams.set("q", input.q);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("page_size", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("mature", "false");
  url.searchParams.set("license", config.elements.allowedOpenverseLicenses.join(","));
  const data = await cached(`openverse-audio:${url}`, () => fetchJson<any>(url), 600);
  return (data.results ?? []).map((item: any) => ({
    id: `openverse-audio:${item.id}`,
    name: cleanText(item.title) ?? "Open audio",
    category: "audio",
    tags: (item.tags ?? []).slice(0, 12).map((tag: any) => cleanText(tag.name)).filter(Boolean),
    provider: "openverse",
    providerLabel: `Openverse Audio · ${item.source || item.provider || "open media"}`,
    kind: "audio",
    format: inferFormat(item.filetype || item.url, "audio/mpeg"),
    duration: Number(item.duration) || undefined,
    license: String(item.license ?? "open license").toUpperCase(),
    licenseUrl: item.license_url,
    author: cleanText(item.creator),
    sourceUrl: item.foreign_landing_url,
    attribution: cleanText(item.attribution),
    attributionRequired: !["cc0", "pdm"].includes(String(item.license ?? "").toLowerCase()),
    previewUrl: item.thumbnail,
    assetUrl: `/api/elements-universe/openverse-audio/${encodeURIComponent(item.id)}/content`,
  } satisfies UniverseElement));
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

async function searchWikimedia(input: { q: string; category: UniverseCategory; page: number; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("wikimedia") || ["audio", "videos", "models3d"].includes(input.category)) return [];
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
    const format = inferFormat(info.url, mime);
    const vector = format === "svg";
    const animated = format === "gif";
    const metadata = info.extmetadata ?? {};
    const license = metadataValue(metadata, "LicenseShortName") ?? "Wikimedia Commons license";
    const sourceUrl = metadataValue(metadata, "CanonicalPage") ?? `https://commons.wikimedia.org/?curid=${page.pageid}`;
    return [{
      id: `wikimedia:${page.pageid}`,
      name: String(page.title ?? "Wikimedia media").replace(/^File:/, "").replace(/\.[^.]+$/, ""),
      category: input.category === "all" ? animated ? "animations" : vector ? "illustrations" : "photos" : input.category,
      tags: [input.q, vector ? "vector" : animated ? "animation" : "image", "commons"],
      provider: "wikimedia",
      providerLabel: "Wikimedia Commons",
      kind: animated ? "gif" : vector ? "vector" : "image",
      format,
      transparent: vector || format === "png" || animated,
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

async function searchPexels(input: { q: string; category: UniverseCategory; page: number; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("pexels")) return [];
  const video = input.category === "videos";
  if (!video && ["audio", "animations", "models3d"].includes(input.category)) return [];
  const endpoint = video ? "/v1/videos/search" : "/v1/search";
  const url = new URL(endpoint, config.elements.pexelsApiUrl);
  url.searchParams.set("query", input.q);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("per_page", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("locale", "it-IT");
  const data = await cached(`pexels:${url}`, () => fetchJson<any>(url, { Authorization: config.elements.pexelsApiKey! }), 600);
  if (video) {
    return (data.videos ?? []).map((item: any) => ({
      id: `pexels-video:${item.id}`,
      name: cleanText(item.user?.name) ? `Video di ${cleanText(item.user.name)}` : `Pexels video ${item.id}`,
      category: "videos",
      tags: [input.q, "video", "pexels"],
      provider: "pexels",
      providerLabel: "Pexels Video",
      kind: "video",
      format: "mp4",
      duration: item.duration,
      license: "Pexels License",
      sourceUrl: item.url,
      author: cleanText(item.user?.name),
      attribution: item.user?.name ? `Video di ${item.user.name} su Pexels` : "Video fornito da Pexels",
      attributionRequired: true,
      previewUrl: `/api/elements-universe/pexels/video/${item.id}/content?size=preview`,
      assetUrl: `/api/elements-universe/pexels/video/${item.id}/content?size=full`,
      width: item.width,
      height: item.height,
    } satisfies UniverseElement));
  }
  return (data.photos ?? []).map((item: any) => ({
    id: `pexels-photo:${item.id}`,
    name: cleanText(item.alt) ?? `Pexels photo ${item.id}`,
    category: input.category === "all" ? "photos" : input.category,
    tags: [input.q, "photo", "pexels"],
    provider: "pexels",
    providerLabel: "Pexels",
    kind: "image",
    format: "jpg",
    transparent: false,
    license: "Pexels License",
    sourceUrl: item.url,
    author: cleanText(item.photographer),
    attribution: item.photographer ? `Foto di ${item.photographer} su Pexels` : "Foto fornita da Pexels",
    attributionRequired: true,
    previewUrl: `/api/elements-universe/pexels/photo/${item.id}/content?size=preview`,
    assetUrl: `/api/elements-universe/pexels/photo/${item.id}/content?size=full`,
    width: item.width,
    height: item.height,
  } satisfies UniverseElement));
}

async function searchPixabay(input: { q: string; category: UniverseCategory; page: number; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("pixabay")) return [];
  const video = input.category === "videos";
  if (!video && ["audio", "models3d"].includes(input.category)) return [];
  const url = new URL(video ? "videos/" : "", config.elements.pixabayApiUrl);
  url.searchParams.set("key", config.elements.pixabayApiKey!);
  url.searchParams.set("q", input.q);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("per_page", String(Math.min(Math.max(input.pageSize, 3), 50)));
  url.searchParams.set("lang", "it");
  url.searchParams.set("safesearch", "true");
  if (!video && ["graphics", "illustrations", "icons", "ornaments", "frames"].includes(input.category)) url.searchParams.set("image_type", "illustration");
  const data = await cached(`pixabay:${url}`, () => fetchJson<any>(url), 600);
  return (data.hits ?? []).map((item: any) => {
    if (video) {
      return {
        id: `pixabay-video:${item.id}`,
        name: cleanText(item.tags) ?? `Pixabay video ${item.id}`,
        category: "videos",
        tags: String(item.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
        provider: "pixabay",
        providerLabel: "Pixabay Video",
        kind: "video",
        format: "mp4",
        license: "Pixabay Content License",
        sourceUrl: item.pageURL,
        author: cleanText(item.user),
        attribution: item.user ? `Video di ${item.user} su Pixabay` : "Video fornito da Pixabay",
        attributionRequired: true,
        previewUrl: `/api/elements-universe/pixabay/video/${item.id}/content?size=preview`,
        assetUrl: `/api/elements-universe/pixabay/video/${item.id}/content?size=full`,
        width: item.videos?.medium?.width,
        height: item.videos?.medium?.height,
      } satisfies UniverseElement;
    }
    const source = item.largeImageURL || item.webformatURL;
    const format = inferFormat(source, item.type);
    return {
      id: `pixabay-image:${item.id}`,
      name: cleanText(item.tags) ?? `Pixabay image ${item.id}`,
      category: input.category === "all" ? item.type === "illustration" ? "illustrations" : "photos" : input.category,
      tags: String(item.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
      provider: "pixabay",
      providerLabel: "Pixabay",
      kind: kindForFormat(format),
      format,
      transparent: format === "png" || format === "gif",
      license: "Pixabay Content License",
      sourceUrl: item.pageURL,
      author: cleanText(item.user),
      attribution: item.user ? `Immagine di ${item.user} su Pixabay` : "Immagine fornita da Pixabay",
      attributionRequired: true,
      previewUrl: `/api/elements-universe/pixabay/image/${item.id}/content?size=preview`,
      assetUrl: `/api/elements-universe/pixabay/image/${item.id}/content?size=full`,
      width: item.imageWidth,
      height: item.imageHeight,
    } satisfies UniverseElement;
  });
}

async function searchGiphy(input: { q: string; page: number; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("giphy")) return [];
  const url = new URL("/gifs/search", config.elements.giphyApiUrl);
  url.searchParams.set("api_key", config.elements.giphyApiKey!);
  url.searchParams.set("q", input.q);
  url.searchParams.set("limit", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("offset", String((input.page - 1) * input.pageSize));
  url.searchParams.set("rating", "g");
  url.searchParams.set("lang", "it");
  const data = await cached(`giphy:${url}`, () => fetchJson<any>(url), 300);
  return (data.data ?? []).map((item: any) => ({
    id: `giphy:${item.id}`,
    name: cleanText(item.title) ?? `GIF ${item.id}`,
    category: "animations",
    tags: [input.q, "gif", "animation"],
    provider: "giphy",
    providerLabel: "GIPHY",
    kind: "gif",
    format: "gif",
    transparent: true,
    license: "GIPHY API Terms",
    sourceUrl: item.url,
    author: cleanText(item.username),
    attribution: "Powered by GIPHY",
    attributionRequired: true,
    previewUrl: `/api/elements-universe/giphy/${item.id}/content?size=preview`,
    assetUrl: `/api/elements-universe/giphy/${item.id}/content?size=full`,
    width: Number(item.images?.original?.width) || undefined,
    height: Number(item.images?.original?.height) || undefined,
  } satisfies UniverseElement));
}

async function searchFreesound(input: { q: string; page: number; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("freesound")) return [];
  const url = new URL("search/text/", `${config.elements.freesoundApiUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("query", input.q);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("page_size", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("fields", "id,name,previews,license,username,url,duration,type,tags");
  url.searchParams.set("token", config.elements.freesoundToken!);
  const data = await cached(`freesound:${url}`, () => fetchJson<any>(url), 600);
  return (data.results ?? []).map((item: any) => ({
    id: `freesound:${item.id}`,
    name: cleanText(item.name) ?? `Sound ${item.id}`,
    category: "audio",
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 12) : [input.q],
    provider: "freesound",
    providerLabel: "Freesound",
    kind: "audio",
    format: "mp3",
    duration: Number(item.duration) || undefined,
    license: cleanText(item.license) ?? "Freesound source license",
    author: cleanText(item.username),
    sourceUrl: item.url,
    attribution: item.username ? `${item.name} di ${item.username} su Freesound` : "Audio da Freesound",
    attributionRequired: true,
    assetUrl: `/api/elements-universe/freesound/${item.id}/content`,
  } satisfies UniverseElement));
}

async function searchJamendo(input: { q: string; page: number; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("jamendo")) return [];
  const url = new URL("tracks/", `${config.elements.jamendoApiUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("client_id", config.elements.jamendoClientId!);
  url.searchParams.set("format", "json");
  url.searchParams.set("search", input.q);
  url.searchParams.set("limit", String(Math.min(input.pageSize, 40)));
  url.searchParams.set("offset", String((input.page - 1) * input.pageSize));
  url.searchParams.set("audioformat", "mp32");
  url.searchParams.set("include", "musicinfo");
  const data = await cached(`jamendo:${url}`, () => fetchJson<any>(url), 600);
  return (data.results ?? []).map((item: any) => ({
    id: `jamendo:${item.id}`,
    name: cleanText(item.name) ?? `Track ${item.id}`,
    category: "audio",
    tags: item.musicinfo?.tags?.genres ?? [input.q, "music"],
    provider: "jamendo",
    providerLabel: "Jamendo",
    kind: "audio",
    format: "mp3",
    duration: Number(item.duration) || undefined,
    license: cleanText(item.license_ccurl) ?? "Jamendo source license",
    licenseUrl: item.license_ccurl,
    author: cleanText(item.artist_name),
    sourceUrl: item.shareurl,
    attribution: item.artist_name ? `${item.name} di ${item.artist_name} su Jamendo` : "Musica da Jamendo",
    attributionRequired: true,
    previewUrl: item.album_image,
    assetUrl: `/api/elements-universe/jamendo/${item.id}/content`,
  } satisfies UniverseElement));
}

async function searchSketchfab(input: { q: string; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("sketchfab")) return [];
  const url = new URL("search", `${config.elements.sketchfabApiUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("type", "models");
  url.searchParams.set("q", input.q);
  url.searchParams.set("count", String(Math.min(input.pageSize, 24)));
  url.searchParams.set("downloadable", "true");
  const headers = config.elements.sketchfabToken ? { Authorization: `Token ${config.elements.sketchfabToken}` } : {};
  const data = await cached(`sketchfab:${url}`, () => fetchJson<any>(url, headers), 900);
  return (data.results ?? []).map((item: any) => {
    const preview = [...(item.thumbnails?.images ?? [])].sort((a: any, b: any) => Number(b.width) - Number(a.width))[0]?.url;
    return {
      id: `sketchfab:${item.uid}`,
      name: cleanText(item.name) ?? `3D model ${item.uid}`,
      category: "models3d",
      tags: (item.tags ?? []).map((tag: any) => cleanText(tag.name)).filter(Boolean).slice(0, 12),
      provider: "sketchfab",
      providerLabel: "Sketchfab",
      kind: "model",
      format: "gltf",
      license: cleanText(item.license?.label) ?? "See Sketchfab model license",
      licenseUrl: item.license?.url,
      author: cleanText(item.user?.displayName || item.user?.username),
      sourceUrl: item.viewerUrl || `https://sketchfab.com/3d-models/${item.uid}`,
      attribution: item.user?.displayName ? `Modello di ${item.user.displayName} su Sketchfab` : "Modello da Sketchfab",
      attributionRequired: true,
      previewUrl: preview ? `/api/elements-universe/sketchfab/${item.uid}/preview` : undefined,
      assetUrl: preview ? `/api/elements-universe/sketchfab/${item.uid}/preview` : undefined,
    } satisfies UniverseElement;
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

async function searchManifests(input: { q: string; category: UniverseCategory; page: number; pageSize: number }): Promise<UniverseElement[]> {
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
      const format = item.format ?? inferFormat(item.url);
      found.push({
        id: `manifest:${manifestIndex}:${item.id || itemIndex}`,
        name: item.name,
        category: itemCategory,
        tags: item.tags ?? [],
        provider: `manifest-${manifestIndex}`,
        providerLabel: manifest.name ?? `Open pack ${manifestIndex + 1}`,
        kind: item.type ?? kindForFormat(format),
        format,
        transparent: item.transparent,
        duration: item.duration,
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
        recolorable: item.recolorable ?? format === "svg",
      });
    });
  });
  const offset = (input.page - 1) * input.pageSize;
  return found.slice(offset, offset + input.pageSize);
}

async function searchUploads(input: { organizationId: string; clientId?: string; q: string; category: UniverseCategory; page: number; pageSize: number }): Promise<UniverseElement[]> {
  if (!configured("uploads")) return [];
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
    const format = inferFormat(item.name, item.mime_type);
    const kind = kindForFormat(format);
    return {
      id: `uploads:${item.id}`,
      name: item.name,
      category: input.category === "all" ? kind === "gif" ? "animations" : kind === "audio" ? "audio" : kind === "video" ? "videos" : "illustrations" : input.category,
      tags: item.tags ?? [],
      provider: "uploads",
      providerLabel: "La tua libreria",
      kind,
      format,
      transparent: format === "svg" || format === "png" || format === "gif",
      license: item.license ?? "Private upload",
      author: item.author ?? undefined,
      sourceUrl: item.source_url ?? undefined,
      attributionRequired: Boolean(item.attribution_required),
      previewUrl: `/api/assets/${item.id}/content`,
      assetUrl: `/api/assets/${item.id}/content`,
      recolorable: format === "svg",
    } satisfies UniverseElement;
  });
}

function builtinGenerated(category: UniverseCategory, queryText: string): UniverseElement[] {
  const matches = (name: string, tags: string[]) => !queryText || `${name} ${tags.join(" ")}`.toLowerCase().includes(queryText.toLowerCase());
  const definitions: Array<{ id: string; name: string; category: UniverseCategory; tags: string[]; svg: string }> = [
    { id: "shape-star", name: "Stella", category: "shapes", tags: ["star", "shape"], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill="currentColor" d="m100 8 27 57 62 8-45 43 12 62-56-30-56 30 12-62-45-43 62-8z"/></svg>' },
    { id: "chart-bars", name: "Grafico a barre", category: "charts", tags: ["chart", "bar", "business"], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><path d="M30 190H300M30 20V190" fill="none" stroke="currentColor" stroke-width="8"/><rect x="60" y="110" width="40" height="80" rx="6" fill="currentColor"/><rect x="130" y="65" width="40" height="125" rx="6" fill="currentColor" opacity=".75"/><rect x="200" y="35" width="40" height="155" rx="6" fill="currentColor" opacity=".5"/></svg>' },
    { id: "chart-line", name: "Grafico lineare", category: "charts", tags: ["chart", "line", "analytics"], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><path d="M30 190H300M30 20V190" fill="none" stroke="currentColor" stroke-width="7"/><path d="m45 160 65-55 55 25 65-85 60 30" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    { id: "table-menu", name: "Tabella menu", category: "tables", tags: ["table", "menu", "prices"], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240"><rect x="8" y="8" width="344" height="224" rx="12" fill="none" stroke="currentColor" stroke-width="8"/><path d="M8 64h344M8 120h344M8 176h344M245 8v224" fill="none" stroke="currentColor" stroke-width="6"/></svg>' },
    { id: "module-checklist", name: "Modulo checklist", category: "modules", tags: ["module", "checklist", "card"], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 260"><rect x="8" y="8" width="344" height="244" rx="28" fill="none" stroke="currentColor" stroke-width="8"/><g fill="none" stroke="currentColor" stroke-width="8"><rect x="40" y="52" width="30" height="30" rx="6"/><path d="M95 67h210M40 130h30v30H40zM95 145h170M40 208h30v30H40zM95 223h195"/></g></svg>' },
    { id: "grid-three", name: "Griglia fotografica", category: "grids", tags: ["grid", "photo", "collage"], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 260"><rect x="8" y="8" width="210" height="244" rx="16" fill="none" stroke="currentColor" stroke-width="8"/><rect x="230" y="8" width="122" height="116" rx="16" fill="none" stroke="currentColor" stroke-width="8"/><rect x="230" y="136" width="122" height="116" rx="16" fill="none" stroke="currentColor" stroke-width="8"/></svg>' },
    { id: "mockup-phone", name: "Mockup smartphone", category: "mockups", tags: ["mockup", "phone", "mobile"], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 420"><rect x="18" y="8" width="184" height="404" rx="34" fill="none" stroke="currentColor" stroke-width="12"/><rect x="78" y="26" width="64" height="10" rx="5" fill="currentColor"/><circle cx="110" cy="387" r="9" fill="currentColor"/></svg>' },
    { id: "frame-rounded", name: "Cornice arrotondata", category: "frames", tags: ["frame", "border", "rounded"], svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect x="12" y="12" width="296" height="216" rx="34" fill="none" stroke="currentColor" stroke-width="18"/></svg>' },
  ];
  return definitions
    .filter((item) => (category === "all" || item.category === category) && matches(item.name, item.tags))
    .map((item) => ({
      id: `builtin-generated:${item.id}`,
      name: item.name,
      category: item.category,
      tags: item.tags,
      provider: "builtin",
      providerLabel: "DDone generato",
      kind: "vector",
      format: "svg",
      transparent: true,
      license: "MIT",
      attributionRequired: false,
      svg: item.svg,
      recolorable: true,
    }));
}

function builtinElements(q: string, requestedCategory: UniverseCategory): UniverseElement[] {
  if (!configured("builtin")) return [];
  const legacyMap: Partial<Record<UniverseCategory, string>> = {
    graphics: "illustrations",
    shapes: "icons",
    charts: "all",
    tables: "all",
    modules: "all",
    grids: "all",
    mockups: "all",
  };
  const legacyCategory = legacyMap[requestedCategory] ?? requestedCategory;
  const legacySupported = ["all", "icons", "illustrations", "photos", "emoji", "ornaments", "frames", "food", "cocktails", "backgrounds", "social", "patterns"].includes(legacyCategory);
  const legacy = legacySupported
    ? searchBuiltins(q, legacyCategory).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category as UniverseCategory,
      tags: item.tags,
      provider: "builtin",
      providerLabel: "DDone built-in",
      kind: "vector" as const,
      format: "svg" as const,
      transparent: true,
      license: item.license,
      author: item.author,
      sourceUrl: item.sourceUrl,
      attributionRequired: false,
      svg: item.svg,
      assetUrl: item.svgUrl,
      recolorable: true,
    }))
    : [];
  return [...builtinGenerated(requestedCategory, q), ...legacy];
}

function providerInfo(): ProviderInfo[] {
  return [
    { id: "builtin", label: "DDone", description: "Forme, grafici, tabelle, moduli, griglie, mockup e vettori curati.", enabled: configured("builtin"), capabilities: ["vector"], attribution: "MIT/CC0 assets embedded in DDone Design." },
    { id: "uploads", label: "La tua libreria", description: "Asset privati dell’organizzazione e del cliente.", enabled: configured("uploads"), capabilities: ["vector", "image", "gif", "video", "audio"], attribution: "Uses metadata supplied during upload." },
    { id: "iconify", label: "Iconify", description: "Centinaia di collezioni open source di icone ed emoji.", enabled: configured("iconify"), capabilities: ["vector"], attribution: "Each icon keeps the source collection license." },
    { id: "openverse", label: "Openverse", description: "Immagini e audio con licenze Creative Commons o pubblico dominio.", enabled: configured("openverse"), capabilities: ["vector", "image", "gif", "audio"], attribution: "License and attribution supplied per work." },
    { id: "wikimedia", label: "Wikimedia Commons", description: "Immagini, illustrazioni e GIF aperte.", enabled: configured("wikimedia"), capabilities: ["vector", "image", "gif"], attribution: "License and author read from Commons metadata." },
    { id: "pexels", label: "Pexels", description: "Foto e video stock. Richiede API key.", enabled: configured("pexels"), capabilities: ["image", "video"], attribution: "Prominent Pexels link and photographer credit required." },
    { id: "pixabay", label: "Pixabay", description: "Immagini, illustrazioni e video. Richiede API key.", enabled: configured("pixabay"), capabilities: ["image", "gif", "video"], attribution: "Source attribution retained with imported media." },
    { id: "giphy", label: "GIPHY", description: "GIF e animazioni. Richiede API key e branding GIPHY.", enabled: configured("giphy"), capabilities: ["gif"], attribution: "Powered by GIPHY." },
    { id: "freesound", label: "Freesound", description: "Effetti sonori e ambience. Richiede API token.", enabled: configured("freesound"), capabilities: ["audio"], attribution: "Per-sound source license and author required." },
    { id: "jamendo", label: "Jamendo", description: "Musica con licenze indicate per traccia. Richiede client ID.", enabled: configured("jamendo"), capabilities: ["audio"], attribution: "Per-track Jamendo license applies." },
    { id: "sketchfab", label: "Sketchfab", description: "Ricerca modelli 3D scaricabili e relative anteprime.", enabled: configured("sketchfab"), capabilities: ["model"], attribution: "Per-model license and creator credit apply." },
    ...config.elements.manifestUrls.map((_, index) => ({ id: `manifest-${index}`, label: `Open pack ${index + 1}`, description: "Pacchetto di asset configurato dall’amministratore.", enabled: enabled("manifest"), capabilities: ["vector", "image", "gif", "video", "audio", "model"] as UniverseKind[], attribution: "License metadata supplied by the pack manifest." })),
  ];
}

function filterFormats(items: UniverseElement[], requested: Set<string>): UniverseElement[] {
  if (requested.size === 0 || requested.has("all")) return items;
  return items.filter((item) => {
    if (requested.has("png-transparent")) return item.format === "png" && item.transparent === true;
    if (requested.has("transparent")) return item.transparent === true;
    if (item.format && requested.has(item.format)) return true;
    return requested.has(item.kind);
  });
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
  const requestedProviders = new Set((c.req.query("providers") ?? "").split(",").map((provider) => provider.trim()).filter(Boolean));
  const requestedFormats = new Set((c.req.query("formats") ?? "").split(",").map((format) => format.trim()).filter(Boolean));
  const shouldUse = (provider: string) => requestedProviders.size === 0 || requestedProviders.has(provider);
  const clientId = c.req.header("X-Client-ID") || undefined;
  const warnings: string[] = [];

  const jobs: Array<{ provider: string; promise: Promise<UniverseElement[]> }> = [];
  if (shouldUse("builtin")) jobs.push({ provider: "builtin", promise: Promise.resolve(builtinElements(rawQuery, requestedCategory)) });
  if (shouldUse("uploads")) jobs.push({ provider: "uploads", promise: searchUploads({ organizationId: c.get("organizationId"), clientId, q: rawQuery, category: requestedCategory, page, pageSize }) });
  if (shouldUse("iconify")) jobs.push({ provider: "iconify", promise: searchIconify({ q: effectiveQuery, category: requestedCategory, pageSize }) });
  if (shouldUse("openverse")) {
    jobs.push({ provider: "openverse", promise: requestedCategory === "audio" ? searchOpenverseAudio({ q: effectiveQuery, page, pageSize }) : searchOpenverseImages({ q: effectiveQuery, category: requestedCategory, page, pageSize }) });
  }
  if (shouldUse("wikimedia")) jobs.push({ provider: "wikimedia", promise: searchWikimedia({ q: effectiveQuery, category: requestedCategory, page, pageSize }) });
  if (shouldUse("pexels")) jobs.push({ provider: "pexels", promise: searchPexels({ q: effectiveQuery, category: requestedCategory, page, pageSize }) });
  if (shouldUse("pixabay")) jobs.push({ provider: "pixabay", promise: searchPixabay({ q: effectiveQuery, category: requestedCategory, page, pageSize }) });
  if (shouldUse("giphy") && (requestedCategory === "animations" || requestedCategory === "all")) jobs.push({ provider: "giphy", promise: searchGiphy({ q: effectiveQuery, page, pageSize }) });
  if (shouldUse("freesound") && requestedCategory === "audio") jobs.push({ provider: "freesound", promise: searchFreesound({ q: effectiveQuery, page, pageSize }) });
  if (shouldUse("jamendo") && requestedCategory === "audio") jobs.push({ provider: "jamendo", promise: searchJamendo({ q: effectiveQuery, page, pageSize }) });
  if (shouldUse("sketchfab") && requestedCategory === "models3d") jobs.push({ provider: "sketchfab", promise: searchSketchfab({ q: effectiveQuery, pageSize }) });
  if (shouldUse("manifest") || [...requestedProviders].some((value) => value.startsWith("manifest-"))) jobs.push({ provider: "manifest", promise: searchManifests({ q: rawQuery, category: requestedCategory, page, pageSize }) });

  const settled = await Promise.allSettled(jobs.map((job) => job.promise));
  const items: UniverseElement[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") items.push(...result.value);
    else {
      warnings.push(`${jobs[index].provider} non è temporaneamente disponibile`);
      console.warn(`Element provider ${jobs[index].provider} failed`, result.reason);
    }
  });

  const unique = [...new Map(items.map((item) => [item.id, item])).values()];
  const filtered = filterFormats(unique, requestedFormats);
  const priority: Record<string, number> = { uploads: 0, builtin: 1, iconify: 2, openverse: 3, pexels: 4, pixabay: 5, wikimedia: 6, giphy: 7, freesound: 8, jamendo: 9, sketchfab: 10 };
  filtered.sort((first, second) => (priority[first.provider] ?? 20) - (priority[second.provider] ?? 20));
  return c.json({ items: filtered, page, pageSize, nextPage: filtered.length > 0 ? page + 1 : null, query: rawQuery, effectiveQuery, category: requestedCategory, providers: providerInfo(), warnings });
});

universe.get("/api/elements-universe/iconify/:prefix/:name", requireAuth, requireOrganization, async (c) => {
  const prefix = c.req.param("prefix");
  const name = c.req.param("name");
  if (!/^[a-z0-9-]+$/i.test(prefix) || !/^[a-z0-9-]+$/i.test(name)) throw new HTTPException(400, { message: "Invalid icon identifier" });
  const response = await fetch(`${config.iconify.apiUrl}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`, { signal: AbortSignal.timeout(config.elements.requestTimeoutMs) });
  if (!response.ok) throw new HTTPException(404, { message: "Icon not found" });
  const svg = await response.text();
  if (!svg.trimStart().startsWith("<svg")) throw new HTTPException(502, { message: "Invalid icon response" });
  return c.body(svg, 200, { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=604800, immutable" });
});

universe.get("/api/elements-universe/openverse/:id/content", requireAuth, requireOrganization, async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9-]{20,}$/i.test(id)) throw new HTTPException(400, { message: "Invalid media identifier" });
  const full = c.req.query("size") === "full";
  const url = new URL(`/v1/images/${encodeURIComponent(id)}/thumb/`, config.elements.openverseApiUrl);
  if (full) url.searchParams.set("full_size", "true");
  const response = await fetch(url, { signal: AbortSignal.timeout(config.elements.requestTimeoutMs * 2) });
  if (!response.ok) throw new HTTPException(404, { message: "Openverse image unavailable" });
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) throw new HTTPException(502, { message: "Invalid media response" });
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 30 * 1024 * 1024) throw new HTTPException(413, { message: "Remote image is too large" });
  return new Response(bytes, { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=86400" } });
});

universe.get("/api/elements-universe/openverse-audio/:id/content", requireAuth, requireOrganization, async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9-]{20,}$/i.test(id)) throw new HTTPException(400, { message: "Invalid media identifier" });
  const detail = await fetchJson<any>(new URL(`/v1/audio/${encodeURIComponent(id)}/`, config.elements.openverseApiUrl));
  const source = detail.url || detail.audio_url;
  if (!source) throw new HTTPException(404, { message: "Openverse audio unavailable" });
  return mediaResponse(source, "audio/mpeg");
});

universe.get("/api/elements-universe/wikimedia/:pageId/content", requireAuth, requireOrganization, async (c) => {
  const pageId = c.req.param("pageId");
  if (!/^\d+$/.test(pageId)) throw new HTTPException(400, { message: "Invalid media identifier" });
  const page = await wikimediaPage(pageId);
  const info = page?.imageinfo?.[0];
  const source = c.req.query("size") === "full" ? info?.url : info?.thumburl || info?.url;
  if (!source) throw new HTTPException(404, { message: "Wikimedia image unavailable" });
  return mediaResponse(source, info.mime ?? "image/jpeg", ["wikimedia.org", "wikimediausercontent.com"]);
});

universe.get("/api/elements-universe/pexels/:type/:id/content", requireAuth, requireOrganization, async (c) => {
  if (!configured("pexels")) throw new HTTPException(404, { message: "Pexels provider is not configured" });
  const type = c.req.param("type");
  const id = c.req.param("id");
  if (!/^\d+$/.test(id) || !["photo", "video"].includes(type)) throw new HTTPException(400, { message: "Invalid Pexels identifier" });
  const detail = await fetchJson<any>(new URL(type === "photo" ? `/v1/photos/${id}` : `/v1/videos/videos/${id}`, config.elements.pexelsApiUrl), { Authorization: config.elements.pexelsApiKey! });
  if (type === "photo") {
    const source = c.req.query("size") === "full" ? detail.src?.original : detail.src?.medium || detail.src?.large;
    if (!source) throw new HTTPException(404, { message: "Pexels photo unavailable" });
    return mediaResponse(source, "image/jpeg", ["pexels.com"]);
  }
  if (c.req.query("size") === "preview") {
    if (!detail.image) throw new HTTPException(404, { message: "Pexels video preview unavailable" });
    return mediaResponse(detail.image, "image/jpeg", ["pexels.com"]);
  }
  const files = [...(detail.video_files ?? [])].filter((file: any) => file.file_type === "video/mp4").sort((a: any, b: any) => Number(b.width || 0) - Number(a.width || 0));
  if (!files[0]?.link) throw new HTTPException(404, { message: "Pexels video unavailable" });
  return mediaResponse(files[0].link, "video/mp4");
});

universe.get("/api/elements-universe/pixabay/:type/:id/content", requireAuth, requireOrganization, async (c) => {
  if (!configured("pixabay")) throw new HTTPException(404, { message: "Pixabay provider is not configured" });
  const type = c.req.param("type");
  const id = c.req.param("id");
  if (!/^\d+$/.test(id) || !["image", "video"].includes(type)) throw new HTTPException(400, { message: "Invalid Pixabay identifier" });
  const url = new URL(type === "video" ? "videos/" : "", config.elements.pixabayApiUrl);
  url.searchParams.set("key", config.elements.pixabayApiKey!);
  url.searchParams.set("id", id);
  const data = await fetchJson<any>(url);
  const item = data.hits?.[0];
  if (!item) throw new HTTPException(404, { message: "Pixabay media unavailable" });
  if (type === "image") return mediaResponse(c.req.query("size") === "full" ? item.largeImageURL : item.webformatURL, "image/jpeg", ["pixabay.com", "pixabayusercontent.com"]);
  if (c.req.query("size") === "preview") return mediaResponse(item.videos?.medium?.thumbnail || item.videos?.small?.thumbnail, "image/jpeg", ["pixabay.com", "pixabayusercontent.com"]);
  return mediaResponse(item.videos?.medium?.url || item.videos?.small?.url, "video/mp4", ["pixabay.com", "pixabayusercontent.com"]);
});

universe.get("/api/elements-universe/giphy/:id/content", requireAuth, requireOrganization, async (c) => {
  if (!configured("giphy")) throw new HTTPException(404, { message: "GIPHY provider is not configured" });
  const id = c.req.param("id");
  if (!/^[a-z0-9]+$/i.test(id)) throw new HTTPException(400, { message: "Invalid GIPHY identifier" });
  const url = new URL(`/gifs/${id}`, config.elements.giphyApiUrl);
  url.searchParams.set("api_key", config.elements.giphyApiKey!);
  const data = await fetchJson<any>(url);
  const source = c.req.query("size") === "preview" ? data.data?.images?.fixed_width_still?.url : data.data?.images?.original?.url;
  if (!source) throw new HTTPException(404, { message: "GIPHY media unavailable" });
  return mediaResponse(source, c.req.query("size") === "preview" ? "image/jpeg" : "image/gif", ["giphy.com", "giphyusercontent.com"]);
});

universe.get("/api/elements-universe/freesound/:id/content", requireAuth, requireOrganization, async (c) => {
  if (!configured("freesound")) throw new HTTPException(404, { message: "Freesound provider is not configured" });
  const id = c.req.param("id");
  if (!/^\d+$/.test(id)) throw new HTTPException(400, { message: "Invalid Freesound identifier" });
  const url = new URL(`sounds/${id}/`, `${config.elements.freesoundApiUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("fields", "previews");
  url.searchParams.set("token", config.elements.freesoundToken!);
  const detail = await fetchJson<any>(url);
  const source = detail.previews?.["preview-hq-mp3"] || detail.previews?.["preview-lq-mp3"];
  if (!source) throw new HTTPException(404, { message: "Freesound preview unavailable" });
  return mediaResponse(source, "audio/mpeg", ["freesound.org", "freesoundusercontent.com"]);
});

universe.get("/api/elements-universe/jamendo/:id/content", requireAuth, requireOrganization, async (c) => {
  if (!configured("jamendo")) throw new HTTPException(404, { message: "Jamendo provider is not configured" });
  const id = c.req.param("id");
  if (!/^\d+$/.test(id)) throw new HTTPException(400, { message: "Invalid Jamendo identifier" });
  const url = new URL("tracks/", `${config.elements.jamendoApiUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("client_id", config.elements.jamendoClientId!);
  url.searchParams.set("format", "json");
  url.searchParams.set("id", id);
  url.searchParams.set("audioformat", "mp32");
  const detail = await fetchJson<any>(url);
  const source = detail.results?.[0]?.audio;
  if (!source) throw new HTTPException(404, { message: "Jamendo audio unavailable" });
  return mediaResponse(source, "audio/mpeg", ["jamendo.com", "jamendousercontent.com"]);
});

universe.get("/api/elements-universe/sketchfab/:uid/preview", requireAuth, requireOrganization, async (c) => {
  const uid = c.req.param("uid");
  if (!/^[a-z0-9-]+$/i.test(uid)) throw new HTTPException(400, { message: "Invalid Sketchfab identifier" });
  const headers = config.elements.sketchfabToken ? { Authorization: `Token ${config.elements.sketchfabToken}` } : {};
  const detail = await fetchJson<any>(new URL(`models/${uid}`, `${config.elements.sketchfabApiUrl.replace(/\/$/, "")}/`), headers);
  const source = [...(detail.thumbnails?.images ?? [])].sort((a: any, b: any) => Number(b.width) - Number(a.width))[0]?.url;
  if (!source) throw new HTTPException(404, { message: "Sketchfab preview unavailable" });
  return mediaResponse(source, "image/jpeg", ["sketchfab.com", "sketchfabusercontent.com"]);
});

universe.get("/api/elements-universe/manifest/:manifestIndex/:itemIndex/content", requireAuth, requireOrganization, async (c) => {
  const manifestIndex = Number.parseInt(c.req.param("manifestIndex"), 10);
  const itemIndex = Number.parseInt(c.req.param("itemIndex"), 10);
  if (!Number.isInteger(manifestIndex) || manifestIndex < 0 || !Number.isInteger(itemIndex) || itemIndex < 0) throw new HTTPException(400, { message: "Invalid pack item" });
  const manifest = await loadManifest(manifestIndex);
  const item = manifest.items?.[itemIndex];
  if (!item) throw new HTTPException(404, { message: "Pack item not found" });
  const manifestOrigin = new URL(config.elements.manifestUrls[manifestIndex]).origin;
  const source = new URL(item.url, config.elements.manifestUrls[manifestIndex]);
  if (source.protocol !== "https:" || source.origin !== manifestOrigin) throw new HTTPException(403, { message: "Pack item host is not allowed" });
  return mediaResponse(source.toString(), item.type === "vector" ? "image/svg+xml" : "application/octet-stream", [source.hostname]);
});

export default universe;
