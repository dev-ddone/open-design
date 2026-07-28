import type { ElementCategory, ElementProvider } from "./types";

export type ElementsView = "discover" | "recent" | "favorites";
export type ElementsFormatFilter = "all" | "svg" | "png-transparent" | "jpg";

export interface ElementCollection {
  id: string;
  label: string;
  detail: string;
  category: ElementCategory;
  query: string;
  icon: "sparkles" | "camera" | "frame" | "layout" | "wallpaper" | "food";
}

export const ELEMENT_COLLECTIONS: ElementCollection[] = [
  {
    id: "graphics",
    label: "Grafiche",
    detail: "Vettori, icone e illustrazioni",
    category: "graphics",
    query: "",
    icon: "sparkles",
  },
  {
    id: "photos",
    label: "Foto",
    detail: "Immagini da tutte le fonti online",
    category: "photos",
    query: "",
    icon: "camera",
  },
  {
    id: "decorations",
    label: "Cornici e ornamenti",
    detail: "Bordi, divisori e decorazioni",
    category: "all",
    query: "cornice ornamentale floreale divider border",
    icon: "frame",
  },
  {
    id: "layouts",
    label: "Layout smart",
    detail: "Tabelle, grafici, griglie e moduli",
    category: "all",
    query: "table chart grid module layout",
    icon: "layout",
  },
  {
    id: "backgrounds",
    label: "Sfondi e texture",
    detail: "Carta, pattern e superfici",
    category: "backgrounds",
    query: "",
    icon: "wallpaper",
  },
  {
    id: "food",
    label: "Cibo e drink",
    detail: "Pizze, piatti, cocktail e ingredienti",
    category: "all",
    query: "pizza food cocktail drink isolated",
    icon: "food",
  },
];

export const ELEMENT_CATEGORY_OPTIONS: Array<{ value: ElementCategory; label: string }> = [
  { value: "all", label: "Tutte le categorie" },
  { value: "shapes", label: "Forme" },
  { value: "graphics", label: "Grafiche" },
  { value: "photos", label: "Foto" },
  { value: "icons", label: "Icone" },
  { value: "illustrations", label: "Illustrazioni" },
  { value: "ornaments", label: "Ornamenti" },
  { value: "frames", label: "Cornici" },
  { value: "charts", label: "Grafici" },
  { value: "modules", label: "Moduli" },
  { value: "tables", label: "Tabelle" },
  { value: "grids", label: "Griglie" },
  { value: "mockups", label: "Mockup" },
  { value: "food", label: "Cibo" },
  { value: "cocktails", label: "Cocktail" },
  { value: "backgrounds", label: "Sfondi" },
  { value: "patterns", label: "Pattern" },
  { value: "emoji", label: "Emoji" },
  { value: "social", label: "Social" },
];

export const ELEMENT_FORMAT_OPTIONS: Array<{ value: ElementsFormatFilter; label: string }> = [
  { value: "all", label: "Qualsiasi formato" },
  { value: "svg", label: "SVG modificabili" },
  { value: "png-transparent", label: "PNG trasparenti" },
  { value: "jpg", label: "Foto JPG" },
];

export interface BuildElementSearchParamsInput {
  category: ElementCategory;
  query: string;
  format: ElementsFormatFilter;
  provider: string;
  page: number;
  pageSize?: number;
}

export function buildElementSearchParams(input: BuildElementSearchParamsInput): URLSearchParams {
  const params = new URLSearchParams({
    category: input.category,
    q: input.query.trim(),
    formats: input.format,
    page: String(Math.max(1, input.page)),
    page_size: String(Math.max(1, Math.min(48, input.pageSize ?? 24))),
  });
  if (input.provider && input.provider !== "all") params.set("providers", input.provider);
  return params;
}

export function summarizeElementProviders(providers: ElementProvider[]): {
  enabled: ElementProvider[];
  disabled: ElementProvider[];
} {
  const unique = [...new Map(providers.map((provider) => [provider.id, provider])).values()];
  return {
    enabled: unique.filter((provider) => provider.enabled),
    disabled: unique.filter((provider) => !provider.enabled),
  };
}

export function hasActiveElementFilters(input: {
  category: ElementCategory;
  query: string;
  format: ElementsFormatFilter;
  provider: string;
}): boolean {
  return input.category !== "all"
    || input.query.trim().length > 0
    || input.format !== "all"
    || input.provider !== "all";
}
