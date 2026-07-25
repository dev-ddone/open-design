import { config } from "./config.js";

export type ElementCategory =
  | "shapes"
  | "icons"
  | "ornaments"
  | "frames"
  | "food"
  | "cocktails"
  | "backgrounds"
  | "social";

export interface DesignElement {
  id: string;
  name: string;
  category: ElementCategory;
  tags: string[];
  provider: "ddone" | "iconify";
  license: string;
  author?: string;
  sourceUrl?: string;
  svg?: string;
  svgUrl?: string;
}

const svg = (body: string, viewBox = "0 0 256 256") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">${body}</svg>`;

export const BUILTIN_ELEMENTS: DesignElement[] = [
  {
    id: "ddone:ornament-floral-divider",
    name: "Floral divider",
    category: "ornaments",
    tags: ["floral", "divider", "menu", "elegant"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<path d="M18 128h72m76 0h72M90 128c18-34 58-34 76 0-18 34-58 34-76 0Z" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><path d="M110 128c0-24 18-43 18-43s18 19 18 43-18 43-18 43-18-19-18-43Z" stroke="currentColor" stroke-width="6"/>'),
  },
  {
    id: "ddone:ornament-art-deco",
    name: "Art deco divider",
    category: "ornaments",
    tags: ["deco", "gold", "divider", "vintage"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<path d="M12 128h70l46-52 46 52h70M82 128l46 52 46-52" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><circle cx="128" cy="128" r="13" fill="currentColor"/>'),
  },
  {
    id: "ddone:corner-vintage",
    name: "Vintage corner",
    category: "ornaments",
    tags: ["corner", "vintage", "menu", "frame"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<path d="M24 220V66c0-23 19-42 42-42h154M24 92c36 0 68-28 68-68M24 142c65 0 118-53 118-118" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><path d="M68 68c28 8 44 25 52 52-28-8-44-24-52-52Z" fill="currentColor"/>'),
  },
  {
    id: "ddone:frame-classic",
    name: "Classic frame",
    category: "frames",
    tags: ["frame", "border", "classic", "menu"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<rect x="12" y="12" width="232" height="232" rx="10" stroke="currentColor" stroke-width="8"/><rect x="28" y="28" width="200" height="200" rx="4" stroke="currentColor" stroke-width="3"/><path d="M12 58 58 12m140 0 46 46M12 198l46 46m140 0 46-46" stroke="currentColor" stroke-width="5"/>'),
  },
  {
    id: "ddone:frame-circle-laurel",
    name: "Laurel circle frame",
    category: "frames",
    tags: ["circle", "laurel", "badge", "elegant"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<circle cx="128" cy="128" r="84" stroke="currentColor" stroke-width="7"/><path d="M70 198C27 160 27 96 70 58m116 140c43-38 43-102 0-140" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="m62 177-28-5 18-21m8-95-27 8 20 19m141 94 28-5-18-21m-8-95 27 8-20 19" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>'),
  },
  {
    id: "ddone:food-pizza",
    name: "Pizza slice",
    category: "food",
    tags: ["pizza", "restaurant", "italian"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<path d="M51 55c49-30 105-30 154 0l-77 165L51 55Z" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/><path d="M51 55c49 26 105 26 154 0" stroke="currentColor" stroke-width="16" stroke-linecap="round"/><circle cx="104" cy="114" r="12" fill="currentColor"/><circle cx="151" cy="137" r="12" fill="currentColor"/><circle cx="128" cy="178" r="10" fill="currentColor"/>'),
  },
  {
    id: "ddone:food-burger",
    name: "Burger",
    category: "food",
    tags: ["burger", "fast food", "restaurant"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<path d="M38 105c4-50 40-78 90-78s86 28 90 78H38Z" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="8"/><path d="M37 139h182M48 139l18 26 27-20 31 22 31-22 31 20 22-26" stroke="currentColor" stroke-width="10" stroke-linejoin="round"/><path d="M42 177h172v16c0 20-16 36-36 36H78c-20 0-36-16-36-36v-16Z" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="8"/>'),
  },
  {
    id: "ddone:food-cutlery",
    name: "Fork and knife",
    category: "food",
    tags: ["cutlery", "fork", "knife", "menu"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<path d="M74 22v78m-24-78v52c0 18 11 29 24 29s24-11 24-29V22M74 103v132M164 235V24c31 18 45 52 45 87h-45" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'),
  },
  {
    id: "ddone:cocktail-martini",
    name: "Martini glass",
    category: "cocktails",
    tags: ["martini", "cocktail", "bar", "glass"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<path d="M35 35h186l-93 100L35 35Z" fill="currentColor" opacity=".16" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/><path d="M128 135v78m-48 14h96" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><circle cx="173" cy="63" r="17" fill="currentColor"/>'),
  },
  {
    id: "ddone:cocktail-spritz",
    name: "Spritz glass",
    category: "cocktails",
    tags: ["spritz", "wine glass", "aperitivo", "orange"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<path d="M63 34h130l-15 112c-3 25-24 44-50 44s-47-19-50-44L63 34Z" fill="currentColor" opacity=".18" stroke="currentColor" stroke-width="8"/><path d="M128 190v38m-43 0h86" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><path d="M75 90c35 18 71 18 106 0" stroke="currentColor" stroke-width="7"/><circle cx="156" cy="73" r="18" stroke="currentColor" stroke-width="7"/>'),
  },
  {
    id: "ddone:cocktail-tiki",
    name: "Tropical cocktail",
    category: "cocktails",
    tags: ["tropical", "cocktail", "tiki", "straw"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<path d="M62 78h132l-18 144H80L62 78Z" fill="currentColor" opacity=".18" stroke="currentColor" stroke-width="8"/><path d="m146 81 47-66m-31 38 36 4" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><path d="M69 112c37 20 81 20 118 0" stroke="currentColor" stroke-width="7"/><path d="M54 75c12-23 36-35 59-28-12 23-36 35-59 28Z" fill="currentColor"/>'),
  },
  {
    id: "ddone:background-marble",
    name: "Marble pattern",
    category: "backgrounds",
    tags: ["marble", "stone", "luxury", "menu"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<rect width="256" height="256" fill="#f5f2ec"/><path d="M-18 51c51 3 69 43 116 43 55 0 67-45 128-43 32 1 49 17 66 33M-26 169c40-4 61-37 103-37 49 0 69 44 119 45 39 1 59-24 84-32" stroke="#c5beb3" stroke-width="5" opacity=".65"/><path d="M-10 81c60 7 66 39 113 39 48 0 75-41 139-36" stroke="#d9d3ca" stroke-width="2"/>'),
  },
  {
    id: "ddone:background-grid",
    name: "Fine grid pattern",
    category: "backgrounds",
    tags: ["grid", "pattern", "minimal", "background"],
    provider: "ddone",
    license: "MIT",
    svg: svg('<rect width="256" height="256" fill="#fafafa"/><path d="M0 32h256M0 64h256M0 96h256M0 128h256M0 160h256M0 192h256M0 224h256M32 0v256M64 0v256M96 0v256M128 0v256M160 0v256M192 0v256M224 0v256" stroke="#d4d4d8" stroke-width="1"/>'),
  },
  {
    id: "ddone:social-instagram",
    name: "Instagram",
    category: "social",
    tags: ["instagram", "social", "logo"],
    provider: "ddone",
    license: "CC0-1.0",
    svg: svg('<rect x="35" y="35" width="186" height="186" rx="52" stroke="currentColor" stroke-width="16"/><circle cx="128" cy="128" r="43" stroke="currentColor" stroke-width="16"/><circle cx="183" cy="73" r="11" fill="currentColor"/>'),
  },
  {
    id: "ddone:social-facebook",
    name: "Facebook",
    category: "social",
    tags: ["facebook", "social", "logo"],
    provider: "ddone",
    license: "CC0-1.0",
    svg: svg('<circle cx="128" cy="128" r="108" fill="currentColor"/><path d="M145 234v-91h31l5-36h-36V84c0-10 3-18 18-18h20V34c-3 0-15-2-28-2-28 0-47 17-47 49v26H76v36h32v91h37Z" fill="white"/>'),
  },
  {
    id: "ddone:social-whatsapp",
    name: "WhatsApp",
    category: "social",
    tags: ["whatsapp", "social", "contact"],
    provider: "ddone",
    license: "CC0-1.0",
    svg: svg('<path d="M128 25a99 99 0 0 0-86 148l-16 58 60-16a100 100 0 1 0 42-190Z" fill="currentColor"/><path d="M86 76c-6 0-15 7-15 22 0 15 11 30 13 32 2 2 22 34 55 46 27 10 33 8 39 7 6-1 20-8 23-16 3-8 3-15 2-17-1-2-5-3-11-6l-20-10c-5-2-8-3-11 3l-8 10c-3 3-6 4-11 1-5-2-22-8-41-26-15-14-25-30-28-35-3-5 0-8 2-10l8-9c2-3 3-5 4-8 1-3 1-6 0-8l-10-24c-3-7-7-6-11-6Z" fill="white"/>'),
  },
];

export function searchBuiltins(query: string, category?: string): DesignElement[] {
  const needle = query.trim().toLowerCase();
  return BUILTIN_ELEMENTS.filter((item) => {
    if (category && category !== "all" && item.category !== category) return false;
    if (!needle) return true;
    return [item.name, item.category, ...item.tags].some((value) =>
      value.toLowerCase().includes(needle),
    );
  });
}

export async function searchIconify(query: string): Promise<DesignElement[]> {
  const needle = query.trim();
  if (needle.length < 2) return [];
  const url = new URL("/search", config.iconify.apiUrl);
  url.searchParams.set("query", needle);
  url.searchParams.set("limit", "48");
  url.searchParams.set("prefixes", config.iconify.collections.join(","));
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) return [];
  const data = (await response.json()) as { icons?: string[] };
  return (data.icons ?? []).map((icon) => {
    const [prefix, name] = icon.split(":");
    return {
      id: `iconify:${prefix}:${name}`,
      name: name.replace(/-/g, " "),
      category: "icons" as const,
      tags: [prefix, name, needle],
      provider: "iconify" as const,
      license: "See source collection",
      sourceUrl: `https://icon-sets.iconify.design/${prefix}/${name}/`,
      svgUrl: `/api/elements/iconify/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}`,
    };
  });
}

export async function fetchIconifySvg(prefix: string, name: string): Promise<string | null> {
  if (!config.iconify.collections.includes(prefix)) return null;
  if (!/^[a-z0-9-]+$/i.test(prefix) || !/^[a-z0-9-]+$/i.test(name)) return null;
  const response = await fetch(
    `${config.iconify.apiUrl}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`,
    { signal: AbortSignal.timeout(5_000) },
  );
  if (!response.ok) return null;
  return response.text();
}
