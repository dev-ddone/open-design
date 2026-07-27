import { normalizeDesignColor } from "../canvas/design-audit";
import type { BrandKit } from "../types";

export interface BrandMigrationOptions {
  replaceColors: boolean;
  replaceFonts: boolean;
  replaceLogos: boolean;
  preserveNeutralColors: boolean;
}

export interface BrandMigrationStats {
  colorsChanged: number;
  fontsChanged: number;
  logosChanged: number;
  smartElementsChanged: number;
  objectsVisited: number;
}

export interface BrandMigrationResult {
  canvasJson: string;
  stats: BrandMigrationStats;
  colorMap: Record<string, string>;
  fontMap: Record<string, string>;
}

const COLOR_KEYS = new Set([
  "fill", "stroke", "backgroundColor", "borderColor", "headerColor", "textColor",
  "accentColor", "gridColor", "color", "shadowColor",
]);
const FONT_KEYS = new Set(["fontFamily"]);
const NEUTRALS = new Set(["#000000", "#ffffff", "#18181b", "#27272a", "#3f3f46", "#71717a", "#a1a1aa", "#d4d4d8", "#e4e4e7", "#f4f4f5"]);

function luminance(color: string): number {
  const hex = color.replace("#", "");
  const parts = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}

function nearestColor(source: string, targets: string[]): string {
  const sourceLum = luminance(source);
  return [...targets].sort((left, right) => Math.abs(luminance(left) - sourceLum) - Math.abs(luminance(right) - sourceLum))[0] ?? source;
}

function normalizedPalette(kit: BrandKit): string[] {
  return [...new Set(kit.colors.map(normalizeDesignColor).filter(Boolean) as string[])];
}

function isLogoObject(object: Record<string, unknown>): boolean {
  const fieldType = String(object.ddoneFieldType ?? "").toLowerCase();
  const name = `${object.ddoneName ?? ""} ${object.name ?? ""} ${object.ddoneFieldKey ?? ""}`.toLowerCase();
  return fieldType === "logo" || /(^|[\s_-])logo([\s_-]|$)/.test(name);
}

function replaceSmartData(raw: string, kit: BrandKit, options: BrandMigrationOptions, maps: { colors: Record<string, string>; fonts: Record<string, string> }, stats: BrandMigrationStats): string {
  try {
    const parsed = JSON.parse(raw);
    const before = JSON.stringify(parsed);
    migrateNode(parsed, kit, options, maps, stats, false);
    const after = JSON.stringify(parsed);
    if (before !== after) stats.smartElementsChanged += 1;
    return after;
  } catch {
    return raw;
  }
}

function migrateNode(
  node: unknown,
  kit: BrandKit,
  options: BrandMigrationOptions,
  maps: { colors: Record<string, string>; fonts: Record<string, string> },
  stats: BrandMigrationStats,
  countObject = true,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item) => migrateNode(item, kit, options, maps, stats));
    return;
  }
  const object = node as Record<string, unknown>;
  if (countObject && ("type" in object || "ddoneId" in object)) stats.objectsVisited += 1;

  const palette = normalizedPalette(kit);
  if (options.replaceColors && palette.length > 0) {
    for (const [key, value] of Object.entries(object)) {
      if (!COLOR_KEYS.has(key) || typeof value !== "string") continue;
      const source = normalizeDesignColor(value);
      if (!source || (!options.preserveNeutralColors && false)) continue;
      if (options.preserveNeutralColors && NEUTRALS.has(source)) continue;
      const replacement = maps.colors[source] ?? nearestColor(source, palette);
      maps.colors[source] = replacement;
      if (replacement !== source) {
        object[key] = replacement;
        stats.colorsChanged += 1;
      }
    }
  }

  if (options.replaceFonts && kit.fonts.length > 0) {
    for (const key of FONT_KEYS) {
      const value = object[key];
      if (typeof value !== "string" || !value.trim()) continue;
      const source = value.trim();
      const replacement = maps.fonts[source] ?? kit.fonts[Object.keys(maps.fonts).length % kit.fonts.length];
      maps.fonts[source] = replacement;
      if (replacement !== source) {
        object[key] = replacement;
        stats.fontsChanged += 1;
      }
    }
  }

  if (options.replaceLogos && kit.logos[0] && isLogoObject(object)) {
    const current = String(object.src ?? object.ddoneMediaUrl ?? "");
    if (current !== kit.logos[0]) {
      object.src = kit.logos[0];
      object.ddoneMediaUrl = kit.logos[0];
      stats.logosChanged += 1;
    }
  }

  if (typeof object.ddoneSmartData === "string") {
    object.ddoneSmartData = replaceSmartData(object.ddoneSmartData, kit, options, maps, stats);
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "ddoneSmartData") continue;
    if (value && typeof value === "object") migrateNode(value, kit, options, maps, stats);
  }
}

export function migrateCanvasJsonToBrand(
  canvasJson: string,
  kit: BrandKit,
  options: BrandMigrationOptions,
): BrandMigrationResult {
  const parsed = JSON.parse(canvasJson || "{}") as Record<string, unknown>;
  const stats: BrandMigrationStats = { colorsChanged: 0, fontsChanged: 0, logosChanged: 0, smartElementsChanged: 0, objectsVisited: 0 };
  const maps = { colors: {} as Record<string, string>, fonts: {} as Record<string, string> };
  migrateNode(parsed, kit, options, maps, stats, false);
  return { canvasJson: JSON.stringify(parsed), stats, colorMap: maps.colors, fontMap: maps.fonts };
}

export function mergeBrandMigrationStats(items: BrandMigrationStats[]): BrandMigrationStats {
  return items.reduce((total, item) => ({
    colorsChanged: total.colorsChanged + item.colorsChanged,
    fontsChanged: total.fontsChanged + item.fontsChanged,
    logosChanged: total.logosChanged + item.logosChanged,
    smartElementsChanged: total.smartElementsChanged + item.smartElementsChanged,
    objectsVisited: total.objectsVisited + item.objectsVisited,
  }), { colorsChanged: 0, fontsChanged: 0, logosChanged: 0, smartElementsChanged: 0, objectsVisited: 0 });
}