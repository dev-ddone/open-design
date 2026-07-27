import { Resvg } from "@resvg/resvg-js";
import { Hono } from "hono";
import type { AppVariables } from "./auth.js";
import type { CatalogCategory, CatalogElement } from "./local-asset-packs.js";

interface RasterPreset {
  id: string;
  name: string;
  category: CatalogCategory;
  tags: string[];
  transparent: boolean;
  width: number;
  height: number;
  body: (width: number, height: number) => string;
}

const svg = (width: number, height: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
const transparentPattern = (id: string, body: string) => `<defs><pattern id="${id}" width="80" height="80" patternUnits="userSpaceOnUse">${body}</pattern></defs><rect width="100%" height="100%" fill="url(#${id})"/>`;

const PRESETS: RasterPreset[] = [
  { id: "glass-orb-violet", name: "Sfera vetro viola", category: "graphics", tags: ["vetro", "glass", "orb", "3d", "viola", "png"], transparent: true, width: 800, height: 800, body: () => '<defs><radialGradient id="g" cx="32%" cy="25%"><stop stop-color="#fff" stop-opacity=".95"/><stop offset=".18" stop-color="#c4b5fd" stop-opacity=".72"/><stop offset=".62" stop-color="#7c3aed" stop-opacity=".55"/><stop offset="1" stop-color="#312e81" stop-opacity=".88"/></radialGradient><filter id="s"><feDropShadow dx="0" dy="35" stdDeviation="28" flood-color="#312e81" flood-opacity=".28"/></filter></defs><circle cx="400" cy="380" r="285" fill="url(#g)" filter="url(#s)"/><ellipse cx="315" cy="255" rx="115" ry="62" fill="#fff" opacity=".42"/>' },
  { id: "glass-card", name: "Pannello glassmorphism", category: "modules", tags: ["glass", "card", "vetro", "ui", "png"], transparent: true, width: 1000, height: 680, body: () => '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".78"/><stop offset="1" stop-color="#ddd6fe" stop-opacity=".28"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="24" stdDeviation="34" flood-color="#111827" flood-opacity=".18"/></filter></defs><rect x="70" y="70" width="860" height="520" rx="58" fill="url(#g)" stroke="#fff" stroke-opacity=".8" stroke-width="5" filter="url(#s)"/>' },
  { id: "soft-shadow", name: "Ombra morbida", category: "graphics", tags: ["ombra", "shadow", "soft", "png"], transparent: true, width: 1000, height: 500, body: () => '<defs><filter id="b"><feGaussianBlur stdDeviation="55"/></filter><radialGradient id="g"><stop stop-color="#000" stop-opacity=".42"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="500" cy="260" rx="390" ry="105" fill="url(#g)" filter="url(#b)"/>' },
  { id: "brush-black", name: "Pennellata nera", category: "graphics", tags: ["brush", "pennello", "inchiostro", "nero", "png"], transparent: true, width: 1200, height: 420, body: () => '<path d="M45 240C180 92 395 138 552 92c180-53 390-20 606 76-130 52-227 81-349 88-246 15-457 83-704 44-57-9-80-28-60-60Z" fill="#111"/><path d="M92 305c285 38 575-82 997-66" fill="none" stroke="#111" stroke-width="28" stroke-linecap="round" opacity=".72"/>' },
  { id: "brush-violet", name: "Pennellata viola", category: "graphics", tags: ["brush", "pennello", "viola", "gradient", "png"], transparent: true, width: 1200, height: 420, body: () => '<defs><linearGradient id="g"><stop stop-color="#7c3aed"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs><path d="M45 240C180 92 395 138 552 92c180-53 390-20 606 76-130 52-227 81-349 88-246 15-457 83-704 44-57-9-80-28-60-60Z" fill="url(#g)"/><path d="M92 305c285 38 575-82 997-66" fill="none" stroke="url(#g)" stroke-width="28" stroke-linecap="round" opacity=".72"/>' },
  { id: "torn-paper-white", name: "Carta strappata bianca", category: "graphics", tags: ["paper", "carta", "strappata", "collage", "png"], transparent: true, width: 1200, height: 520, body: () => '<defs><filter id="s"><feDropShadow dx="0" dy="18" stdDeviation="15" flood-opacity=".2"/></filter></defs><path d="M25 68 78 42l56 21 61-24 58 18 69-28 52 29 68-22 55 27 74-24 54 20 65-30 68 31 57-22 69 27 61-19 67 28 55-22 63 31 67-17v372l-58 21-64-25-61 29-63-21-67 25-54-30-70 28-58-20-67 24-62-31-61 29-68-25-60 23-62-28-65 31-60-26-66 23-54-30-59 25-64-21-60 25-55-29Z" fill="#fff" filter="url(#s)"/>' },
  { id: "tape-beige", name: "Nastro adesivo beige", category: "graphics", tags: ["tape", "nastro", "scrapbook", "beige", "png"], transparent: true, width: 900, height: 280, body: () => '<defs><filter id="s"><feDropShadow dx="0" dy="9" stdDeviation="8" flood-opacity=".18"/></filter></defs><path d="M38 34 862 19 842 250 58 265Z" fill="#e7d3a8" opacity=".82" filter="url(#s)"/><path d="M70 74h750M62 132h764M58 193h770" stroke="#fff" stroke-opacity=".18" stroke-width="5"/>' },
  { id: "neon-ring", name: "Anello neon", category: "graphics", tags: ["neon", "ring", "glow", "cerchio", "png"], transparent: true, width: 800, height: 800, body: () => '<defs><linearGradient id="g"><stop stop-color="#22d3ee"/><stop offset=".5" stop-color="#8b5cf6"/><stop offset="1" stop-color="#f472b6"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="25" result="x"/><feMerge><feMergeNode in="x"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="400" cy="400" r="270" fill="none" stroke="url(#g)" stroke-width="28" filter="url(#b)"/>' },
  { id: "product-pedestal", name: "Pedana prodotto", category: "mockups", tags: ["pedestal", "podium", "prodotto", "mockup", "png"], transparent: true, width: 1000, height: 800, body: () => '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fafafa"/><stop offset="1" stop-color="#d4d4d8"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="32" stdDeviation="28" flood-opacity=".2"/></filter></defs><ellipse cx="500" cy="580" rx="350" ry="130" fill="#d4d4d8" filter="url(#s)"/><path d="M150 420c0-75 157-135 350-135s350 60 350 135v160c0 75-157 135-350 135s-350-60-350-135Z" fill="url(#g)"/><ellipse cx="500" cy="420" rx="350" ry="135" fill="#fff"/>' },
  { id: "bokeh-violet", name: "Bokeh viola", category: "backgrounds", tags: ["bokeh", "viola", "luci", "background", "png"], transparent: false, width: 1400, height: 900, body: () => '<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#111827"/><stop offset=".55" stop-color="#4c1d95"/><stop offset="1" stop-color="#be185d"/><filter id="b"><feGaussianBlur stdDeviation="18"/></filter></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><g fill="#fff" opacity=".28" filter="url(#b)"><circle cx="180" cy="170" r="80"/><circle cx="440" cy="330" r="125"/><circle cx="760" cy="160" r="65"/><circle cx="1080" cy="300" r="145"/><circle cx="1260" cy="650" r="90"/><circle cx="680" cy="700" r="160"/><circle cx="230" cy="700" r="110"/></g>' },
  { id: "gradient-sunset", name: "Gradiente sunset", category: "backgrounds", tags: ["gradient", "tramonto", "sunset", "background", "png"], transparent: false, width: 1400, height: 900, body: () => '<defs><radialGradient id="r" cx="75%" cy="20%"><stop stop-color="#fde68a"/><stop offset=".38" stop-color="#fb7185"/><stop offset=".72" stop-color="#7c3aed"/><stop offset="1" stop-color="#172554"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#r)"/>' },
  { id: "gradient-ocean", name: "Gradiente oceano", category: "backgrounds", tags: ["gradient", "oceano", "blu", "background", "png"], transparent: false, width: 1400, height: 900, body: () => '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#082f49"/><stop offset=".45" stop-color="#0284c7"/><stop offset="1" stop-color="#5eead4"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>' },
  { id: "paper-grid", name: "Carta a griglia", category: "patterns", tags: ["paper", "grid", "carta", "quaderno", "png"], transparent: false, width: 1200, height: 800, body: () => '<rect width="100%" height="100%" fill="#fdfcf8"/>'+transparentPattern("p", '<path d="M80 0H0V80" fill="none" stroke="#94a3b8" stroke-opacity=".22" stroke-width="2"/>') },
  { id: "grain-overlay", name: "Grana fotografica", category: "patterns", tags: ["grain", "noise", "grana", "overlay", "texture", "png"], transparent: true, width: 1000, height: 1000, body: () => '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .28"/></feComponentTransfer></filter><rect width="100%" height="100%" filter="url(#n)" opacity=".45"/>' },
  { id: "halftone-dots", name: "Retino mezzetinte", category: "patterns", tags: ["halftone", "dots", "punti", "comic", "png"], transparent: true, width: 1000, height: 1000, body: () => transparentPattern("p", '<circle cx="12" cy="12" r="8" fill="#111"/><circle cx="52" cy="52" r="14" fill="#111"/>') },
  { id: "gold-confetti", name: "Coriandoli oro", category: "graphics", tags: ["confetti", "oro", "festa", "celebration", "png"], transparent: true, width: 1200, height: 800, body: () => Array.from({length:80},(_,i)=>{const x=(i*137)%1180+10;const y=(i*251)%780+10;const r=(i*29)%360;const w=8+(i%5)*4;return `<rect x="${x}" y="${y}" width="${w}" height="${w*2}" rx="3" fill="${i%3===0?'#f59e0b':i%3===1?'#fde68a':'#b45309'}" transform="rotate(${r} ${x} ${y})"/>`;}).join("") },
  { id: "leaf-shadow", name: "Ombra foglie", category: "graphics", tags: ["leaf", "shadow", "foglie", "botanical", "png"], transparent: true, width: 1200, height: 900, body: () => '<defs><filter id="b"><feGaussianBlur stdDeviation="14"/></filter></defs><g fill="#111" opacity=".23" filter="url(#b)" transform="rotate(-22 600 450)"><path d="M110 820C320 570 430 330 470 40h38c-12 340-135 610-350 818Z"/><g transform="translate(420 40)"><ellipse cx="-85" cy="120" rx="95" ry="42" transform="rotate(-35)"/><ellipse cx="90" cy="210" rx="110" ry="48" transform="rotate(28)"/><ellipse cx="-105" cy="315" rx="125" ry="54" transform="rotate(-25)"/><ellipse cx="110" cy="440" rx="135" ry="58" transform="rotate(24)"/><ellipse cx="-120" cy="565" rx="145" ry="62" transform="rotate(-22)"/></g></g>' },
  { id: "watercolor-blue", name: "Macchia acquerello blu", category: "graphics", tags: ["watercolor", "acquerello", "blu", "paint", "png"], transparent: true, width: 1000, height: 720, body: () => '<defs><filter id="w"><feTurbulence baseFrequency=".015" numOctaves="3" seed="8" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="45"/><feGaussianBlur stdDeviation="3"/></filter><radialGradient id="g"><stop stop-color="#38bdf8" stop-opacity=".75"/><stop offset="1" stop-color="#1d4ed8" stop-opacity=".18"/></radialGradient></defs><ellipse cx="500" cy="360" rx="390" ry="235" fill="url(#g)" filter="url(#w)"/>' },
];

export function searchStudioRasterPresets(input: { q: string; category: CatalogCategory; limit?: number }): CatalogElement[] {
  const query = input.q.trim().toLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);
  return PRESETS.filter((preset) => input.category === "all" || preset.category === input.category)
    .filter((preset) => tokens.length === 0 || tokens.every((token) => `${preset.name} ${preset.tags.join(" ")}`.toLowerCase().includes(token)))
    .slice(0, input.limit ?? 24)
    .map((preset) => ({
      id: `studio-raster:${preset.id}`,
      name: preset.name,
      category: preset.category,
      tags: preset.tags,
      provider: "studio-raster",
      providerLabel: "DDone PNG Studio",
      kind: "image",
      format: "png",
      transparent: preset.transparent,
      license: "MIT",
      author: "DDone",
      sourceUrl: "/docs/RASTER_ASSETS.md",
      attributionRequired: false,
      previewUrl: `/api/studio-raster/${preset.id}.png`,
      assetUrl: `/api/studio-raster/${preset.id}.png`,
      width: preset.width,
      height: preset.height,
      recolorable: false,
    }));
}

const raster = new Hono<{ Variables: AppVariables }>();
raster.get("/api/studio-raster/:id.png", (c) => {
  const preset = PRESETS.find((item) => item.id === c.req.param("id"));
  if (!preset) return c.json({ error: "Raster asset not found" }, 404);
  const output = new Resvg(svg(preset.width, preset.height, preset.body(preset.width, preset.height)), {
    fitTo: { mode: "original" },
    background: preset.transparent ? undefined : "rgba(255,255,255,0)",
  }).render().asPng();
  return new Response(output, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Disposition": `inline; filename="${preset.id}.png"`,
    },
  });
});

export default raster;