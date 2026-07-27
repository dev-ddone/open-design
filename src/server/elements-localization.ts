import { Hono } from "hono";
import type { AppVariables } from "./auth.js";

const localization = new Hono<{ Variables: AppVariables }>();

const ITALIAN_TERMS: Array<[RegExp, string]> = [
  [/\b(cornici|cornice|bordo|bordi|bordure|bordura)\b/gi, "decorative frame border"],
  [/\b(ornamenti|ornamento|decorazioni|decorazione|decori|decoro)\b/gi, "ornament decorative flourish"],
  [/\b(angoli|angolo|cantonali|cantonale)\b/gi, "ornamental corner"],
  [/\b(arabeschi|arabesco|ghirigori|ghirigoro)\b/gi, "arabesque flourish scrollwork"],
  [/\b(barocco|barocca|barocchi|barocche)\b/gi, "baroque ornate vintage"],
  [/\b(vittoriano|vittoriana|vittoriani|vittoriane)\b/gi, "victorian ornamental"],
  [/\b(liberty|art nouveau)\b/gi, "art nouveau ornamental"],
  [/\b(floreali|floreale|fiori|fiore)\b/gi, "floral flower botanical"],
  [/\b(dorati|dorato|dorata|oro)\b/gi, "gold golden"],
  [/\b(argento|argentato|argentata)\b/gi, "silver"],
  [/\b(sfondo|sfondi)\b/gi, "background"],
  [/\b(carta|cartaceo|cartacea|pergamena)\b/gi, "paper parchment texture"],
  [/\b(legno|legnoso|legnosa)\b/gi, "wood wooden texture"],
  [/\b(marmo|marmorizzato|marmorizzata)\b/gi, "marble texture"],
  [/\b(tessuto|stoffa)\b/gi, "fabric textile texture"],
  [/\b(cibo|alimenti|alimentare)\b/gi, "food"],
  [/\b(pizze|pizza)\b/gi, "italian pizza food"],
  [/\b(pasta|spaghetti|tagliatelle)\b/gi, "italian pasta food"],
  [/\b(hamburger|burger|panino|panini)\b/gi, "burger sandwich food"],
  [/\b(bibite|bibita|bevande|bevanda)\b/gi, "drink beverage"],
  [/\b(bicchieri|bicchiere)\b/gi, "glass drink"],
  [/\b(vino|vini)\b/gi, "wine"],
  [/\b(birra|birre)\b/gi, "beer"],
  [/\b(caffè|caffe)\b/gi, "coffee"],
  [/\b(dolci|dolce|dessert)\b/gi, "dessert cake"],
  [/\b(ristoranti|ristorante)\b/gi, "restaurant"],
  [/\b(pizzerie|pizzeria)\b/gi, "pizzeria pizza"],
  [/\b(menu|menù)\b/gi, "menu restaurant"],
  [/\b(eleganti|elegante)\b/gi, "elegant luxury"],
  [/\b(minimale|minimalista|semplice)\b/gi, "minimal clean"],
  [/\b(vintage|retrò|retro)\b/gi, "vintage retro"],
  [/\b(estivo|estiva|estate)\b/gi, "summer"],
  [/\b(invernale|inverno)\b/gi, "winter"],
  [/\b(natalizio|natalizia|natale)\b/gi, "christmas holiday"],
  [/\b(pasquale|pasqua)\b/gi, "easter"],
  [/\b(compleanno|festa)\b/gi, "birthday party"],
  [/\b(matrimonio|nozze)\b/gi, "wedding"],
  [/\b(foglie|foglia|rami|ramo)\b/gi, "leaves branch botanical"],
  [/\b(divisori|divisore|separatore|separatori)\b/gi, "divider separator"],
  [/\b(onde|onda)\b/gi, "wave"],
  [/\b(pattern|motivo|motivi)\b/gi, "seamless pattern"],
  [/\b(icone|icona)\b/gi, "icon"],
  [/\b(illustrazioni|illustrazione|disegno|disegni|clipart)\b/gi, "illustration drawing clipart"],
  [/\b(foto|fotografia|fotografie)\b/gi, "photo photograph"],
  [/\b(trasparente|trasparenza|scontornato|scontornata)\b/gi, "isolated transparent background"],
];

const CATEGORY_HINTS: Record<string, string> = {
  ornaments: "ornamental flourish divider corner border vector illustration",
  frames: "decorative frame border corner floral vintage vector",
  food: "food restaurant isolated photo illustration",
  cocktails: "cocktail drink bar isolated photo illustration",
  graphics: "graphic design clipart vector illustration",
  illustrations: "illustration clipart vector",
  backgrounds: "background texture high resolution",
  patterns: "seamless repeating pattern",
  mockups: "product mockup isolated",
};

export function expandItalianQuery(input: string, category?: string): string {
  let result = input;
  let changed = false;
  for (const [pattern, replacement] of ITALIAN_TERMS) {
    result = result.replace(pattern, () => {
      changed = true;
      return replacement;
    });
  }
  const hint = CATEGORY_HINTS[category ?? ""];
  const expanded = `${result} ${hint ?? ""}`.trim();
  if (!changed && !hint) return input;
  return [...new Set(expanded.split(/\s+/).filter(Boolean))].join(" ").slice(0, 260);
}

localization.use("/api/elements-universe/search", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.searchParams.get("_localized") === "1") return next();
  const raw = (url.searchParams.get("q") ?? "").trim();
  if (!raw) return next();
  const expanded = expandItalianQuery(raw, url.searchParams.get("category") ?? undefined);
  if (expanded === raw) return next();
  url.searchParams.set("q", expanded);
  url.searchParams.set("_localized", "1");
  return Response.redirect(url, 307);
});

export default localization;
