import { icons as tablerIcons, info as tablerInfo } from "@iconify-json/tabler";
import { icons as twemojiIcons, info as twemojiInfo } from "@iconify-json/twemoji";
import { Resvg } from "@resvg/resvg-js";

export type CatalogCategory =
  | "all"
  | "shapes"
  | "icons"
  | "graphics"
  | "illustrations"
  | "photos"
  | "emoji"
  | "ornaments"
  | "frames"
  | "grids"
  | "charts"
  | "tables"
  | "modules"
  | "mockups"
  | "food"
  | "cocktails"
  | "backgrounds"
  | "social"
  | "patterns";

export type CatalogFormat = "all" | "svg" | "png-transparent" | "jpg";

export interface CatalogElement {
  id: string;
  name: string;
  category: CatalogCategory;
  tags: string[];
  provider: string;
  providerLabel: string;
  kind: "vector" | "image";
  format: "svg" | "png" | "jpg" | "webp" | "other";
  transparent: boolean;
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
  recolorable: boolean;
}

interface StructuralAsset {
  id: string;
  name: string;
  category: Exclude<CatalogCategory, "all" | "icons" | "illustrations" | "photos" | "emoji" | "food" | "cocktails" | "social">;
  tags: string[];
  svg: string;
}

interface LocalPackAsset {
  pack: "structures" | "tabler" | "twemoji";
  name: string;
  category: CatalogCategory;
  tags: string[];
  displayName: string;
  svg: string;
  width: number;
  height: number;
  recolorable: boolean;
  license: string;
  licenseUrl: string;
  author: string;
  sourceUrl: string;
  attributionRequired: boolean;
}

const wrap = (body: string, width = 360, height = 260) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${body}</svg>`;

const tableSvg = (rows: number, columns: number, header = true, rounded = true) => {
  const width = 420;
  const height = 280;
  const x = 10;
  const y = 10;
  const innerWidth = width - 20;
  const innerHeight = height - 20;
  const horizontal = Array.from({ length: rows - 1 }, (_, index) => {
    const lineY = y + ((index + 1) * innerHeight) / rows;
    return `<path d="M${x} ${lineY}H${x + innerWidth}"/>`;
  }).join("");
  const vertical = Array.from({ length: columns - 1 }, (_, index) => {
    const lineX = x + ((index + 1) * innerWidth) / columns;
    return `<path d="M${lineX} ${y}V${y + innerHeight}"/>`;
  }).join("");
  const headerFill = header
    ? `<rect x="${x}" y="${y}" width="${innerWidth}" height="${innerHeight / rows}" rx="${rounded ? 16 : 0}" fill="currentColor" opacity=".14"/>`
    : "";
  return wrap(`${headerFill}<rect x="${x}" y="${y}" width="${innerWidth}" height="${innerHeight}" rx="${rounded ? 16 : 0}" fill="none" stroke="currentColor" stroke-width="7"/><g fill="none" stroke="currentColor" stroke-width="5">${horizontal}${vertical}</g>`, width, height);
};

const gridSvg = (rectangles: Array<[number, number, number, number]>) =>
  wrap(rectangles.map(([x, y, width, height]) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="15" fill="none" stroke="currentColor" stroke-width="8"/>`).join(""));

const frameSvg = (body: string) => wrap(body, 360, 260);

const STRUCTURAL_ASSETS: StructuralAsset[] = [
  { id: "shape-star", name: "Stella piena", category: "shapes", tags: ["stella", "star", "forma"], svg: wrap('<path fill="currentColor" d="m180 18 43 89 98 13-71 69 17 96-87-46-87 46 17-96-71-69 98-13z"/>', 360, 320) },
  { id: "shape-hexagon", name: "Esagono", category: "shapes", tags: ["esagono", "hexagon", "geometria"], svg: wrap('<path fill="currentColor" d="M90 20h180l80 120-80 120H90L10 140z"/>', 360, 280) },
  { id: "shape-arrow", name: "Freccia spessa", category: "shapes", tags: ["freccia", "arrow", "direzione"], svg: wrap('<path fill="currentColor" d="M18 95h210V28l116 112-116 112v-67H18z"/>', 360, 280) },
  { id: "shape-bubble", name: "Fumetto arrotondato", category: "shapes", tags: ["fumetto", "speech", "bubble"], svg: wrap('<path fill="currentColor" d="M28 24h304a20 20 0 0 1 20 20v156a20 20 0 0 1-20 20H150l-82 55 20-55H28a20 20 0 0 1-20-20V44a20 20 0 0 1 20-20z"/>', 360, 290) },

  { id: "chart-bars", name: "Grafico a barre", category: "charts", tags: ["grafico", "barre", "chart", "analytics"], svg: wrap('<path d="M30 225H335M30 25V225" fill="none" stroke="currentColor" stroke-width="8"/><rect x="65" y="130" width="42" height="95" rx="7" fill="currentColor"/><rect x="140" y="82" width="42" height="143" rx="7" fill="currentColor" opacity=".75"/><rect x="215" y="45" width="42" height="180" rx="7" fill="currentColor" opacity=".5"/><rect x="290" y="105" width="42" height="120" rx="7" fill="currentColor" opacity=".3"/>') },
  { id: "chart-line", name: "Grafico lineare", category: "charts", tags: ["grafico", "linea", "chart", "trend"], svg: wrap('<path d="M30 225H335M30 25V225" fill="none" stroke="currentColor" stroke-width="7"/><path d="m50 192 62-71 58 35 66-105 78 57" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><g fill="currentColor"><circle cx="50" cy="192" r="9"/><circle cx="112" cy="121" r="9"/><circle cx="170" cy="156" r="9"/><circle cx="236" cy="51" r="9"/><circle cx="314" cy="108" r="9"/></g>') },
  { id: "chart-donut", name: "Grafico ad anello", category: "charts", tags: ["grafico", "donut", "percentuale"], svg: wrap('<circle cx="180" cy="130" r="88" fill="none" stroke="currentColor" stroke-width="34" opacity=".16"/><path d="M180 42a88 88 0 1 1-82 120" fill="none" stroke="currentColor" stroke-width="34" stroke-linecap="round"/><text x="180" y="145" text-anchor="middle" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="currentColor">72%</text>') },
  { id: "chart-pie", name: "Grafico a torta", category: "charts", tags: ["grafico", "torta", "pie"], svg: wrap('<path fill="currentColor" d="M170 24a108 108 0 1 0 108 108H170z" opacity=".32"/><path fill="currentColor" d="M190 24v88h88A108 108 0 0 0 190 24z"/><path fill="currentColor" d="m190 132 68 68a108 108 0 0 0 20-68z" opacity=".65"/>') },
  { id: "chart-progress", name: "Barre di avanzamento", category: "charts", tags: ["grafico", "progress", "kpi"], svg: wrap('<g fill="currentColor"><rect x="35" y="45" width="290" height="24" rx="12" opacity=".15"/><rect x="35" y="45" width="230" height="24" rx="12"/><rect x="35" y="112" width="290" height="24" rx="12" opacity=".15"/><rect x="35" y="112" width="170" height="24" rx="12" opacity=".75"/><rect x="35" y="179" width="290" height="24" rx="12" opacity=".15"/><rect x="35" y="179" width="265" height="24" rx="12" opacity=".5"/></g>') },

  { id: "table-menu", name: "Tabella menu 4×2", category: "tables", tags: ["tabella", "menu", "prezzi", "ristorante"], svg: tableSvg(4, 2, true) },
  { id: "table-price-list", name: "Listino prezzi 6×2", category: "tables", tags: ["tabella", "listino", "prezzi", "price"], svg: tableSvg(6, 2, false) },
  { id: "table-comparison", name: "Tabella comparativa 5×4", category: "tables", tags: ["tabella", "comparazione", "piani", "comparison"], svg: tableSvg(5, 4, true) },
  { id: "table-week", name: "Calendario settimanale", category: "tables", tags: ["tabella", "settimana", "orari", "calendar"], svg: tableSvg(6, 7, true, false) },
  { id: "table-wine", name: "Carta vini 5×3", category: "tables", tags: ["tabella", "vino", "carta", "wine"], svg: tableSvg(5, 3, true) },
  { id: "table-menu-wide", name: "Menu a tre colonne", category: "tables", tags: ["tabella", "menu", "tre colonne", "ristorante"], svg: tableSvg(5, 3, false) },

  { id: "module-checklist", name: "Modulo checklist", category: "modules", tags: ["modulo", "checklist", "card"], svg: wrap('<rect x="12" y="12" width="336" height="236" rx="26" fill="none" stroke="currentColor" stroke-width="8"/><g fill="none" stroke="currentColor" stroke-width="8"><rect x="42" y="48" width="30" height="30" rx="6"/><path d="M98 63h210M42 115h30v30H42zM98 130h175M42 182h30v30H42zM98 197h195"/></g>') },
  { id: "module-kpi", name: "Card statistica KPI", category: "modules", tags: ["modulo", "kpi", "statistica", "card"], svg: wrap('<rect x="12" y="12" width="336" height="236" rx="28" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="73" cy="70" r="28" fill="currentColor" opacity=".18"/><path d="M58 75l12-12 10 9 17-22" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><rect x="42" y="126" width="145" height="26" rx="13" fill="currentColor"/><rect x="42" y="174" width="240" height="15" rx="8" fill="currentColor" opacity=".25"/><rect x="42" y="205" width="188" height="15" rx="8" fill="currentColor" opacity=".15"/>') },
  { id: "module-testimonial", name: "Card recensione", category: "modules", tags: ["modulo", "recensione", "testimonial", "card"], svg: wrap('<rect x="12" y="12" width="336" height="236" rx="28" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="72" cy="72" r="34" fill="currentColor" opacity=".2"/><rect x="126" y="46" width="162" height="18" rx="9" fill="currentColor"/><rect x="126" y="78" width="105" height="13" rx="7" fill="currentColor" opacity=".28"/><path d="M42 137h276M42 174h247M42 211h198" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" opacity=".2"/>') },
  { id: "module-contact", name: "Scheda contatto", category: "modules", tags: ["modulo", "contatto", "business card"], svg: wrap('<rect x="12" y="12" width="336" height="236" rx="28" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="90" cy="96" r="47" fill="currentColor" opacity=".18"/><circle cx="90" cy="81" r="16" fill="currentColor"/><path d="M57 128c8-24 58-24 66 0" fill="currentColor"/><rect x="168" y="62" width="135" height="22" rx="11" fill="currentColor"/><rect x="168" y="105" width="105" height="14" rx="7" fill="currentColor" opacity=".28"/><rect x="42" y="181" width="260" height="14" rx="7" fill="currentColor" opacity=".18"/>') },

  { id: "grid-2x2", name: "Griglia 2×2", category: "grids", tags: ["griglia", "grid", "collage", "foto"], svg: gridSvg([[8, 8, 166, 116], [186, 8, 166, 116], [8, 136, 166, 116], [186, 136, 166, 116]]) },
  { id: "grid-3-columns", name: "Griglia tre colonne", category: "grids", tags: ["griglia", "tre colonne", "collage"], svg: gridSvg([[8, 8, 104, 244], [128, 8, 104, 244], [248, 8, 104, 244]]) },
  { id: "grid-hero", name: "Hero con miniature", category: "grids", tags: ["griglia", "hero", "foto", "layout"], svg: gridSvg([[8, 8, 344, 150], [8, 170, 104, 82], [128, 170, 104, 82], [248, 170, 104, 82]]) },
  { id: "grid-three", name: "Grande più due", category: "grids", tags: ["griglia", "collage", "foto"], svg: gridSvg([[8, 8, 210, 244], [230, 8, 122, 116], [230, 136, 122, 116]]) },
  { id: "grid-masonry", name: "Griglia masonry", category: "grids", tags: ["griglia", "masonry", "portfolio"], svg: gridSvg([[8, 8, 104, 150], [128, 8, 104, 96], [248, 8, 104, 150], [8, 170, 104, 82], [128, 116, 104, 136], [248, 170, 104, 82]]) },

  { id: "frame-rounded", name: "Cornice arrotondata", category: "frames", tags: ["cornice", "frame", "rounded"], svg: frameSvg('<rect x="14" y="14" width="332" height="232" rx="38" fill="none" stroke="currentColor" stroke-width="18"/>') },
  { id: "frame-double", name: "Cornice doppia", category: "frames", tags: ["cornice", "double", "elegante"], svg: frameSvg('<rect x="12" y="12" width="336" height="236" rx="18" fill="none" stroke="currentColor" stroke-width="7"/><rect x="28" y="28" width="304" height="204" rx="12" fill="none" stroke="currentColor" stroke-width="3"/>') },
  { id: "frame-arch", name: "Cornice ad arco", category: "frames", tags: ["cornice", "arco", "arch"], svg: frameSvg('<path d="M28 246V126C28 60 96 14 180 14s152 46 152 112v120z" fill="none" stroke="currentColor" stroke-width="15"/>') },
  { id: "frame-photo", name: "Cornice fotografica", category: "frames", tags: ["cornice", "foto", "polaroid"], svg: frameSvg('<rect x="44" y="10" width="272" height="240" rx="8" fill="none" stroke="currentColor" stroke-width="18"/><path d="M54 192h252" stroke="currentColor" stroke-width="12"/>') },
  { id: "frame-corners", name: "Angoli ornamentali", category: "frames", tags: ["cornice", "angoli", "ornamento"], svg: frameSvg('<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"><path d="M18 92V18h74M342 92V18h-74M18 168v74h74M342 168v74h-74"/><path d="M18 64c24 0 44-20 44-44M342 64c-24 0-44-20-44-44M18 196c24 0 44 20 44 44M342 196c-24 0-44 20-44 44"/></g>') },

  { id: "mockup-phone", name: "Mockup smartphone", category: "mockups", tags: ["mockup", "telefono", "phone", "mobile"], svg: wrap('<rect x="88" y="8" width="184" height="404" rx="34" fill="none" stroke="currentColor" stroke-width="12"/><rect x="148" y="26" width="64" height="10" rx="5" fill="currentColor"/><circle cx="180" cy="387" r="9" fill="currentColor"/>', 360, 420) },
  { id: "mockup-tablet", name: "Mockup tablet", category: "mockups", tags: ["mockup", "tablet", "schermo"], svg: wrap('<rect x="28" y="16" width="304" height="228" rx="24" fill="none" stroke="currentColor" stroke-width="12"/><circle cx="314" cy="130" r="7" fill="currentColor"/>') },
  { id: "mockup-laptop", name: "Mockup laptop", category: "mockups", tags: ["mockup", "laptop", "computer"], svg: wrap('<rect x="62" y="18" width="236" height="174" rx="12" fill="none" stroke="currentColor" stroke-width="11"/><path d="M18 207h324l-30 35H48z" fill="none" stroke="currentColor" stroke-width="11" stroke-linejoin="round"/>') },
  { id: "mockup-poster", name: "Mockup poster", category: "mockups", tags: ["mockup", "poster", "volantino"], svg: wrap('<rect x="92" y="12" width="176" height="236" rx="4" fill="none" stroke="currentColor" stroke-width="12"/><path d="M72 250h216" stroke="currentColor" stroke-width="8" opacity=".25"/>') },
  { id: "mockup-cards", name: "Mockup biglietti", category: "mockups", tags: ["mockup", "biglietto", "business card"], svg: wrap('<rect x="26" y="56" width="210" height="128" rx="12" fill="none" stroke="currentColor" stroke-width="10" transform="rotate(-8 131 120)"/><rect x="124" y="78" width="210" height="128" rx="12" fill="none" stroke="currentColor" stroke-width="10" transform="rotate(7 229 142)"/>') },

  { id: "ornament-divider", name: "Divisore floreale", category: "ornaments", tags: ["ornamento", "divisore", "floreale"], svg: wrap('<path d="M18 130h122c18 0 25-18 40-18s22 18 40 18h122M180 112c-28-8-35-37-14-54 8 21 29 22 38 0 21 17 14 46-14 54" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>') },
  { id: "ornament-corner", name: "Angolo floreale", category: "ornaments", tags: ["ornamento", "angolo", "floreale"], svg: wrap('<path d="M28 238V58c0-22 18-40 40-40h180M28 112c46 0 84-38 84-84M72 168c52 0 96-44 96-96M118 212c52 0 96-44 96-96" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>') },
  { id: "ornament-diamond", name: "Divisore geometrico", category: "ornaments", tags: ["ornamento", "geometrico", "diamond"], svg: wrap('<path d="M18 130h118l44-44 44 44h118M136 130l44 44 44-44" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/>') },

  { id: "pattern-dots", name: "Pattern a pois", category: "patterns", tags: ["pattern", "pois", "punti"], svg: wrap('<defs><pattern id="p" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="6" fill="currentColor"/></pattern></defs><rect width="360" height="260" fill="url(#p)"/>') },
  { id: "pattern-stripes", name: "Righe diagonali", category: "patterns", tags: ["pattern", "righe", "stripes"], svg: wrap('<defs><pattern id="p" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="10" height="30" fill="currentColor"/></pattern></defs><rect width="360" height="260" fill="url(#p)"/>') },
  { id: "pattern-grid", name: "Pattern griglia", category: "patterns", tags: ["pattern", "griglia", "grid"], svg: wrap('<defs><pattern id="p" width="38" height="38" patternUnits="userSpaceOnUse"><path d="M38 0H0v38" fill="none" stroke="currentColor" stroke-width="3"/></pattern></defs><rect width="360" height="260" fill="url(#p)"/>') },
  { id: "background-lines", name: "Sfondo linee sottili", category: "backgrounds", tags: ["sfondo", "linee", "background"], svg: wrap('<defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 24 24 0" stroke="currentColor" stroke-width="2" opacity=".22"/></pattern></defs><rect width="360" height="260" fill="url(#p)"/>') },
  { id: "background-waves", name: "Sfondo onde", category: "backgrounds", tags: ["sfondo", "onde", "waves"], svg: wrap('<path d="M0 56c60 46 120-46 180 0s120-46 180 0v204H0z" fill="currentColor" opacity=".22"/><path d="M0 126c60 46 120-46 180 0s120-46 180 0v134H0z" fill="currentColor" opacity=".45"/><path d="M0 196c60 46 120-46 180 0s120-46 180 0v64H0z" fill="currentColor"/>') },
];

const ITALIAN_ALIASES: Record<string, string> = {
  tabella: "table",
  tabelle: "table",
  prezzo: "price",
  prezzi: "prices",
  listino: "price list",
  griglia: "grid",
  griglie: "grid",
  cornice: "frame",
  cornici: "frame",
  grafico: "chart",
  grafici: "chart",
  modulo: "card",
  moduli: "card",
  icona: "icon",
  icone: "icon",
  cibo: "food",
  cocktail: "drink",
  bevanda: "drink",
  pizza: "pizza",
  pasta: "spaghetti",
  fiore: "flower",
  floreale: "flower",
  telefono: "phone",
  freccia: "arrow",
  stella: "star",
  casa: "home",
  utente: "user",
  cuore: "heart",
  sorriso: "smile",
  faccina: "face",
};

const CATEGORY_TERMS: Partial<Record<CatalogCategory, string[]>> = {
  shapes: ["shape", "circle", "square", "triangle", "star", "hexagon", "arrow"],
  icons: ["home", "user", "settings", "menu", "phone", "mail", "map", "calendar", "camera", "heart"],
  graphics: ["sparkles", "abstract", "badge", "ribbon", "star", "flower"],
  illustrations: ["artist", "office", "restaurant", "shopping", "celebration"],
  emoji: ["face", "smile", "heart", "hand"],
  food: ["pizza", "spaghetti", "hamburger", "taco", "bread", "cheese", "tomato", "salad", "cake", "cookie", "coffee"],
  cocktails: ["cocktail", "wine", "beer", "champagne", "tumbler", "cup", "beverage"],
  ornaments: ["flower", "sparkles", "leaf", "star"],
  social: ["brand", "share", "message", "camera", "heart"],
};

function normalizeQuery(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((word) => ITALIAN_ALIASES[word] ?? word)
    .join(" ")
    .trim();
}

function iconSvg(collection: typeof tablerIcons, name: string): { svg: string; width: number; height: number } | null {
  const icon = collection.icons[name];
  if (!icon) return null;
  const width = icon.width ?? collection.width ?? 24;
  const height = icon.height ?? collection.height ?? 24;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${icon.body}</svg>`,
    width,
    height,
  };
}

function localPackAsset(pack: LocalPackAsset, format: CatalogFormat): CatalogElement {
  const actualFormat = format === "png-transparent" || (format === "all" && pack.pack === "twemoji") ? "png" : "svg";
  const extension = actualFormat === "png" ? "png" : "svg";
  const encodedName = encodeURIComponent(pack.name);
  const assetUrl = `/api/elements-universe/local-pack/${pack.pack}/${encodedName}.${extension}`;
  return {
    id: `local-pack:${pack.pack}:${pack.name}:${extension}`,
    name: pack.displayName,
    category: pack.category,
    tags: pack.tags,
    provider: `local-${pack.pack}`,
    providerLabel: pack.pack === "structures" ? "DDone Structures" : pack.pack === "tabler" ? "Tabler Icons · locale" : "Twemoji · locale",
    kind: actualFormat === "png" ? "image" : "vector",
    format: actualFormat,
    transparent: true,
    license: pack.license,
    licenseUrl: pack.licenseUrl,
    author: pack.author,
    sourceUrl: pack.sourceUrl,
    attribution: pack.attributionRequired ? `${pack.displayName} · ${pack.author}` : undefined,
    attributionRequired: pack.attributionRequired,
    previewUrl: assetUrl,
    assetUrl,
    svg: actualFormat === "svg" ? pack.svg : undefined,
    width: pack.width,
    height: pack.height,
    recolorable: actualFormat === "svg" && pack.recolorable,
  };
}

function structuralPack(category: CatalogCategory, q: string): LocalPackAsset[] {
  const needle = normalizeQuery(q);
  return STRUCTURAL_ASSETS
    .filter((item) => category === "all" ? true : item.category === category)
    .filter((item) => {
      if (!needle) return true;
      const haystack = normalizeQuery([item.name, ...item.tags].join(" "));
      return needle.split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
    })
    .map((item) => ({
      pack: "structures",
      name: item.id,
      category: item.category,
      tags: item.tags,
      displayName: item.name,
      svg: item.svg,
      width: 360,
      height: item.id === "mockup-phone" ? 420 : 260,
      recolorable: true,
      license: "MIT",
      licenseUrl: "https://opensource.org/license/mit",
      author: "DDone",
      sourceUrl: "https://github.com/dev-ddone/open-design",
      attributionRequired: false,
    }));
}

function iconPack(pack: "tabler" | "twemoji", category: CatalogCategory, q: string): LocalPackAsset[] {
  const collection = pack === "tabler" ? tablerIcons : twemojiIcons;
  const info = pack === "tabler" ? tablerInfo : twemojiInfo;
  const directQuery = normalizeQuery(q);
  const terms = directQuery ? directQuery.split(/\s+/).filter(Boolean) : CATEGORY_TERMS[category] ?? [];
  const iconNames = Object.keys(collection.icons);
  const matching = iconNames.filter((name) => {
    const normalizedName = name.replace(/-/g, " ");
    if (terms.length === 0) return true;
    return terms.some((term) => normalizedName.includes(term));
  });

  return matching.map((name) => {
    const icon = iconSvg(collection as typeof tablerIcons, name)!;
    return {
      pack,
      name,
      category,
      tags: name.split("-"),
      displayName: name.replace(/-/g, " "),
      svg: icon.svg,
      width: icon.width,
      height: icon.height,
      recolorable: pack === "tabler",
      license: info.license?.title ?? (pack === "tabler" ? "MIT" : "CC BY 4.0"),
      licenseUrl: info.license?.url ?? (pack === "tabler" ? "https://opensource.org/license/mit" : "https://creativecommons.org/licenses/by/4.0/"),
      author: info.author?.name ?? (pack === "tabler" ? "Paweł Kuna" : "Twitter / Twemoji contributors"),
      sourceUrl: info.author?.url ?? (pack === "tabler" ? "https://github.com/tabler/tabler-icons" : "https://github.com/jdecked/twemoji"),
      attributionRequired: pack === "twemoji",
    };
  });
}

function packsForCategory(category: CatalogCategory, q: string): LocalPackAsset[] {
  const structures = structuralPack(category, q);
  const items: LocalPackAsset[] = [...structures];
  if (["all", "icons", "shapes", "graphics", "ornaments", "social"].includes(category)) {
    items.push(...iconPack("tabler", category === "all" ? "icons" : category, q));
  }
  if (["all", "emoji", "food", "cocktails", "illustrations"].includes(category)) {
    items.push(...iconPack("twemoji", category === "all" ? "emoji" : category, q));
  }
  return items;
}

export function searchLocalAssetPacks(input: {
  q: string;
  category: CatalogCategory;
  format: CatalogFormat;
  page: number;
  pageSize: number;
}): CatalogElement[] {
  if (input.format === "jpg") return [];
  const all = packsForCategory(input.category, input.q);
  const offset = (input.page - 1) * input.pageSize;
  return all.slice(offset, offset + input.pageSize).map((item) => localPackAsset(item, input.format));
}

function getPackAsset(pack: string, name: string): LocalPackAsset | null {
  if (pack === "structures") {
    const item = STRUCTURAL_ASSETS.find((asset) => asset.id === name);
    if (!item) return null;
    return structuralPack(item.category, item.name).find((asset) => asset.name === name)
      ?? {
        pack: "structures",
        name: item.id,
        category: item.category,
        tags: item.tags,
        displayName: item.name,
        svg: item.svg,
        width: 360,
        height: item.id === "mockup-phone" ? 420 : 260,
        recolorable: true,
        license: "MIT",
        licenseUrl: "https://opensource.org/license/mit",
        author: "DDone",
        sourceUrl: "https://github.com/dev-ddone/open-design",
        attributionRequired: false,
      };
  }
  if (pack === "tabler" || pack === "twemoji") {
    const collection = pack === "tabler" ? tablerIcons : twemojiIcons;
    const info = pack === "tabler" ? tablerInfo : twemojiInfo;
    const icon = iconSvg(collection as typeof tablerIcons, name);
    if (!icon) return null;
    return {
      pack,
      name,
      category: pack === "tabler" ? "icons" : "emoji",
      tags: name.split("-"),
      displayName: name.replace(/-/g, " "),
      svg: icon.svg,
      width: icon.width,
      height: icon.height,
      recolorable: pack === "tabler",
      license: info.license?.title ?? (pack === "tabler" ? "MIT" : "CC BY 4.0"),
      licenseUrl: info.license?.url ?? (pack === "tabler" ? "https://opensource.org/license/mit" : "https://creativecommons.org/licenses/by/4.0/"),
      author: info.author?.name ?? (pack === "tabler" ? "Paweł Kuna" : "Twitter / Twemoji contributors"),
      sourceUrl: info.author?.url ?? (pack === "tabler" ? "https://github.com/tabler/tabler-icons" : "https://github.com/jdecked/twemoji"),
      attributionRequired: pack === "twemoji",
    };
  }
  return null;
}

export function localPackSvg(pack: string, name: string): string | null {
  return getPackAsset(pack, name)?.svg ?? null;
}

export function localPackPng(pack: string, name: string, size = 512): Uint8Array | null {
  const asset = getPackAsset(pack, name);
  if (!asset) return null;
  const safeSize = Math.max(64, Math.min(2048, Math.round(size)));
  const renderer = new Resvg(asset.svg, {
    fitTo: { mode: "width", value: safeSize },
    background: "rgba(0,0,0,0)",
  });
  return renderer.render().asPng();
}

export function localPackInfo() {
  return [
    {
      id: "local-structures",
      label: "DDone Structures",
      description: `${STRUCTURAL_ASSETS.length} tabelle, grafici, griglie, cornici, moduli, mockup e pattern inclusi nel progetto.`,
      enabled: true,
      capabilities: ["vector", "image"],
      attribution: "Original MIT assets included with DDone Design.",
    },
    {
      id: "local-tabler",
      label: "Tabler Icons locale",
      description: `${Object.keys(tablerIcons.icons).length} icone SVG MIT incluse nel progetto e convertibili in PNG trasparenti reali.`,
      enabled: true,
      capabilities: ["vector", "image"],
      attribution: "Tabler Icons, MIT License.",
    },
    {
      id: "local-twemoji",
      label: "Twemoji locale",
      description: `${Object.keys(twemojiIcons.icons).length} emoji e illustrazioni incluse nel progetto, disponibili come SVG o PNG trasparenti reali.`,
      enabled: true,
      capabilities: ["vector", "image"],
      attribution: "Twemoji graphics, CC BY 4.0.",
    },
  ];
}
