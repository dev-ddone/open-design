import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "./auth.js";
import {
  searchLocalAssetPacks,
  type CatalogCategory,
  type CatalogElement,
  type CatalogFormat,
} from "./local-asset-packs.js";

const LOCAL_PROVIDERS = new Set([
  "local-structures",
  "local-tabler",
  "local-twemoji",
]);

const NON_PAGINATED_PROVIDERS = new Set(["iconify"]);

interface ProviderDescriptor {
  id: string;
  label?: string;
  enabled?: boolean;
}

interface ElementsSearchPayload {
  items?: CatalogElement[];
  page?: number;
  pageSize?: number;
  nextPage?: number | null;
  providers?: ProviderDescriptor[];
  [key: string]: unknown;
}

function boundedPositiveInt(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), maximum);
}

function requestedCategory(value: string | undefined): CatalogCategory {
  const categories: CatalogCategory[] = [
    "all",
    "shapes",
    "icons",
    "graphics",
    "illustrations",
    "photos",
    "emoji",
    "ornaments",
    "frames",
    "grids",
    "charts",
    "tables",
    "modules",
    "mockups",
    "food",
    "cocktails",
    "backgrounds",
    "social",
    "patterns",
  ];
  return categories.includes(value as CatalogCategory) ? value as CatalogCategory : "all";
}

function requestedFormat(value: string | undefined): CatalogFormat {
  return ["all", "svg", "png-transparent", "jpg"].includes(value ?? "")
    ? value as CatalogFormat
    : "all";
}

export function parseProviderFilter(value: string | undefined): string[] {
  return [...new Set(
    (value ?? "")
      .split(",")
      .map((provider) => provider.trim())
      .filter(Boolean),
  )];
}

export function normalizeLocalProviderCategory(
  provider: string,
  category: CatalogCategory,
): CatalogCategory {
  if (category !== "all") return category;
  if (provider === "local-tabler") return "icons";
  if (provider === "local-twemoji") return "emoji";
  return "all";
}

export function removeRepeatedNonPaginatedItems(
  items: CatalogElement[],
  page: number,
): CatalogElement[] {
  if (page <= 1) return items;
  return items.filter((item) => !NON_PAGINATED_PROVIDERS.has(item.provider));
}

function localProviderPage(input: {
  provider: string;
  query: string;
  category: CatalogCategory;
  format: CatalogFormat;
  page: number;
  pageSize: number;
}): CatalogElement[] {
  const category = normalizeLocalProviderCategory(input.provider, input.category);
  return searchLocalAssetPacks({
    q: input.query,
    category,
    format: input.format,
    page: input.page,
    pageSize: input.pageSize,
  }).filter((item) => item.provider === input.provider);
}

/**
 * Repairs two user-visible catalog regressions without replacing the existing
 * federation route:
 *
 * 1. Local packs were filtered after the combined-pack page was sliced. A
 *    selected provider could therefore return an empty page even when that
 *    pack contained thousands of assets.
 * 2. Iconify does not expose page-based pagination in the current adapter, so
 *    every "load more" request repeated page one forever.
 */
export const improveElementsSearch: MiddlewareHandler<{ Variables: AppVariables }> = async (c, next) => {
  await next();

  if (c.req.method !== "GET" || !c.res.ok) return;
  const contentType = c.res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return;

  let payload: ElementsSearchPayload;
  try {
    payload = await c.res.clone().json() as ElementsSearchPayload;
  } catch {
    return;
  }

  const page = boundedPositiveInt(c.req.query("page"), payload.page ?? 1, 250);
  const pageSize = boundedPositiveInt(c.req.query("page_size"), payload.pageSize ?? 24, 64);
  const providers = parseProviderFilter(c.req.query("providers"));
  const selectedProvider = providers.length === 1 ? providers[0] : null;

  let items = Array.isArray(payload.items) ? payload.items : [];
  let nextPage = payload.nextPage ?? null;

  if (selectedProvider && LOCAL_PROVIDERS.has(selectedProvider)) {
    const input = {
      provider: selectedProvider,
      query: (c.req.query("q") ?? "").trim().slice(0, 160),
      category: requestedCategory(c.req.query("category")),
      format: requestedFormat((c.req.query("formats") ?? "").split(",", 1)[0]),
      page,
      pageSize,
    };

    items = localProviderPage(input);
    const followingPage = localProviderPage({ ...input, page: page + 1 });
    nextPage = followingPage.length > 0 ? page + 1 : null;
  } else {
    items = removeRepeatedNonPaginatedItems(items, page);

    if (selectedProvider && NON_PAGINATED_PROVIDERS.has(selectedProvider)) {
      nextPage = null;
    } else if (items.length === 0) {
      nextPage = null;
    }
  }

  const visibleProviderCounts = Object.fromEntries(
    (payload.providers ?? []).map((provider) => [
      provider.id,
      items.filter((item) => item.provider === provider.id).length,
    ]),
  );

  c.res = c.json({
    ...payload,
    items,
    page,
    pageSize,
    nextPage,
    visibleProviderCounts,
  });
};