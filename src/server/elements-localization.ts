import { Hono } from "hono";
import type { AppVariables } from "./auth.js";

const localization = new Hono<{ Variables: AppVariables }>();

const ITALIAN_TERMS: Array<[RegExp, string]> = [
  [/\b(cornici|cornice)\b/gi, "frame border"],
  [/\b(ornamenti|ornamento|decorazioni|decorazione)\b/gi, "ornament decoration"],
  [/\b(floreali|floreale|fiori|fiore)\b/gi, "floral flower"],
  [/\b(dorati|dorato|dorata|oro)\b/gi, "gold golden"],
  [/\b(argento|argentato|argentata)\b/gi, "silver"],
  [/\b(sfondo|sfondi)\b/gi, "background"],
  [/\b(carta|cartaceo|cartacea)\b/gi, "paper texture"],
  [/\b(legno|legnoso|legnosa)\b/gi, "wood wooden texture"],
  [/\b(marmo|marmorizzato|marmorizzata)\b/gi, "marble texture"],
  [/\b(tessuto|stoffa)\b/gi, "fabric textile texture"],
  [/\b(cibo|alimenti|alimentare)\b/gi, "food"],
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
  [/\b(divisori|divisore|separatore)\b/gi, "divider separator"],
  [/\b(onde|onda)\b/gi, "wave"],
  [/\b(pattern|motivo|motivi)\b/gi, "seamless pattern"],
  [/\b(icone|icona)\b/gi, "icon"],
  [/\b(illustrazioni|illustrazione|disegno|disegni)\b/gi, "illustration drawing"],
  [/\b(foto|fotografia|fotografie)\b/gi, "photo photograph"],
  [/\b(trasparente|trasparenza)\b/gi, "transparent"],
];

function expandItalianQuery(input: string): string {
  let result = input;
  let changed = false;
  for (const [pattern, replacement] of ITALIAN_TERMS) {
    const next = result.replace(pattern, (match) => {
      changed = true;
      return `${match} ${replacement}`;
    });
    result = next;
  }
  return changed
    ? [...new Set(result.trim().split(/\s+/).filter(Boolean))].join(" ").slice(0, 200)
    : input;
}

localization.use("/api/elements-universe/search", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.searchParams.get("_localized") === "1") return next();
  const raw = (url.searchParams.get("q") ?? "").trim();
  if (!raw) return next();
  const expanded = expandItalianQuery(raw);
  if (expanded === raw) return next();
  url.searchParams.set("q", expanded);
  url.searchParams.set("_localized", "1");
  return Response.redirect(url, 307);
});

export default localization;
