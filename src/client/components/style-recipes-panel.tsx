import { useEffect, useMemo, useState } from "preact/hooks";
import { BookmarkPlus, Check, Paintbrush, Save, Sparkles, Trash2, X } from "lucide-preact";
import * as fabric from "fabric";
import { useEditor } from "../context";

interface StyleRecipe {
  id: string;
  name: string;
  description: string;
  background?: string;
  fill?: string;
  textColor?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  radius?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetY?: number;
  blendMode?: GlobalCompositeOperation;
  fontWeight?: string;
  fontFamily?: string;
}

const STORAGE_KEY = "ddone:studio-style-recipes:v1";
const BUILTIN_RECIPES: StyleRecipe[] = [
  { id: "glass", name: "Glass", description: "Trasparenza, bordo chiaro e ombra morbida", fill: "rgba(255,255,255,0.36)", stroke: "#ffffff", strokeWidth: 2, opacity: 0.92, radius: 28, shadowColor: "rgba(30,41,59,0.22)", shadowBlur: 26, shadowOffsetY: 12 },
  { id: "editorial", name: "Editorial", description: "Contrasto elegante, serif e bordi sottili", fill: "#f7f3eb", textColor: "#18181b", stroke: "#18181b", strokeWidth: 1, opacity: 1, radius: 0, fontFamily: "Playfair Display", fontWeight: "600" },
  { id: "neon", name: "Neon", description: "Accento luminoso per testo e forme", fill: "#7c3aed", textColor: "#ffffff", stroke: "#c4b5fd", strokeWidth: 2, opacity: 1, radius: 18, shadowColor: "rgba(124,58,237,0.72)", shadowBlur: 30, shadowOffsetY: 0 },
  { id: "soft-card", name: "Soft card", description: "Card chiara, angoli morbidi e profondità", fill: "#ffffff", textColor: "#27272a", stroke: "#e4e4e7", strokeWidth: 1, opacity: 1, radius: 24, shadowColor: "rgba(24,24,27,0.14)", shadowBlur: 22, shadowOffsetY: 10 },
  { id: "dark-premium", name: "Dark premium", description: "Superficie scura con accento viola", fill: "#18181b", textColor: "#ffffff", stroke: "#6d5dfc", strokeWidth: 2, opacity: 1, radius: 20, shadowColor: "rgba(0,0,0,0.42)", shadowBlur: 24, shadowOffsetY: 14 },
  { id: "monochrome", name: "Monochrome", description: "Bianco, nero e grigi per documenti puliti", fill: "#f4f4f5", textColor: "#18181b", stroke: "#71717a", strokeWidth: 1, opacity: 1, radius: 8, shadowColor: "rgba(0,0,0,0.08)", shadowBlur: 8, shadowOffsetY: 4 },
  { id: "product", name: "Product focus", description: "Ombra da catalogo e contorno discreto", fill: "#ffffff", textColor: "#18181b", stroke: "#d4d4d8", strokeWidth: 1, opacity: 1, radius: 16, shadowColor: "rgba(15,23,42,0.28)", shadowBlur: 34, shadowOffsetY: 22 },
];

function loadCustomRecipes(): StyleRecipe[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveCustomRecipes(recipes: StyleRecipe[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

function isText(object: fabric.FabricObject): object is fabric.Textbox | fabric.IText | fabric.Text {
  return object instanceof fabric.Textbox || object instanceof fabric.IText || object instanceof fabric.Text;
}

function applyRecipeToObject(object: fabric.FabricObject, recipe: StyleRecipe, intensity: number): void {
  const mixOpacity = Math.max(0.1, Math.min(1, intensity));
  const updates: Record<string, unknown> = {};
  if (recipe.opacity !== undefined) updates.opacity = 1 - (1 - recipe.opacity) * mixOpacity;
  if (recipe.stroke !== undefined) updates.stroke = recipe.stroke;
  if (recipe.strokeWidth !== undefined) updates.strokeWidth = recipe.strokeWidth * mixOpacity;
  if (recipe.blendMode) updates.globalCompositeOperation = recipe.blendMode;
  if (isText(object)) {
    if (recipe.textColor) updates.fill = recipe.textColor;
    if (recipe.fontFamily) updates.fontFamily = recipe.fontFamily;
    if (recipe.fontWeight) updates.fontWeight = recipe.fontWeight;
  } else if (!(object instanceof fabric.FabricImage) && recipe.fill) {
    updates.fill = recipe.fill;
  }
  if ("rx" in object && recipe.radius !== undefined) {
    updates.rx = recipe.radius * mixOpacity;
    updates.ry = recipe.radius * mixOpacity;
  }
  if (recipe.shadowColor && recipe.shadowBlur !== undefined) {
    updates.shadow = new fabric.Shadow({
      color: recipe.shadowColor,
      blur: recipe.shadowBlur * mixOpacity,
      offsetX: 0,
      offsetY: (recipe.shadowOffsetY ?? 0) * mixOpacity,
    });
  }
  object.set(updates);
  object.setCoords();
}

export function StyleRecipesPanel() {
  const { canvas } = useEditor();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<StyleRecipe[]>(loadCustomRecipes);
  const [selectedId, setSelectedId] = useState("glass");
  const [intensity, setIntensity] = useState(1);
  const [scope, setScope] = useState<"selection" | "type" | "page">("selection");
  const [name, setName] = useState("Il mio stile");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("ddone:open-style-recipes", show);
    return () => window.removeEventListener("ddone:open-style-recipes", show);
  }, []);

  const recipes = useMemo(() => [...BUILTIN_RECIPES, ...custom], [custom]);
  const selected = recipes.find((recipe) => recipe.id === selectedId) ?? recipes[0];

  const targets = () => {
    if (!canvas) return [] as fabric.FabricObject[];
    const active = canvas.getActiveObjects();
    if (scope === "selection") return active;
    if (scope === "page") return canvas.getObjects().filter((object) => !(object as any)._isBgImage);
    const prototype = active[0];
    if (!prototype) return [];
    return canvas.getObjects().filter((object) => object.type === prototype.type);
  };

  const apply = () => {
    if (!canvas || !selected) return;
    const objects = targets();
    if (objects.length === 0) {
      setMessage("Seleziona almeno un oggetto oppure scegli tutta la pagina.");
      return;
    }
    for (const object of objects) applyRecipeToObject(object, selected, intensity);
    canvas.requestRenderAll();
    for (const object of objects) canvas.fire("object:modified", { target: object } as any);
    setMessage(`${selected.name} applicato a ${objects.length} oggetti.`);
  };

  const capture = () => {
    if (!canvas) return;
    const object = canvas.getActiveObjects()[0];
    if (!object) {
      setMessage("Seleziona un oggetto da cui salvare lo stile.");
      return;
    }
    const source = object as any;
    const recipe: StyleRecipe = {
      id: `custom-${crypto.randomUUID()}`,
      name: name.trim() || "Stile personalizzato",
      description: "Ricetta salvata dalla selezione corrente",
      fill: typeof source.fill === "string" ? source.fill : undefined,
      textColor: isText(object) && typeof source.fill === "string" ? source.fill : undefined,
      stroke: typeof source.stroke === "string" ? source.stroke : undefined,
      strokeWidth: Number(source.strokeWidth) || 0,
      opacity: Number(source.opacity) || 1,
      radius: Number(source.rx) || 0,
      shadowColor: source.shadow?.color,
      shadowBlur: Number(source.shadow?.blur) || 0,
      shadowOffsetY: Number(source.shadow?.offsetY) || 0,
      blendMode: source.globalCompositeOperation,
      fontFamily: isText(object) ? source.fontFamily : undefined,
      fontWeight: isText(object) ? String(source.fontWeight ?? "400") : undefined,
    };
    const next = [...custom, recipe];
    setCustom(next);
    saveCustomRecipes(next);
    setSelectedId(recipe.id);
    setMessage(`${recipe.name} salvato nel browser.`);
  };

  const remove = (recipe: StyleRecipe) => {
    const next = custom.filter((item) => item.id !== recipe.id);
    setCustom(next);
    saveCustomRecipes(next);
    setSelectedId("glass");
  };

  if (!open) return null;
  return (
    <div class="fixed inset-0 z-[165] grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="style-recipes-title">
      <div class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header class="flex items-center justify-between border-b border-zinc-200 px-5 py-4"><div class="flex items-center gap-3"><span class="grid h-10 w-10 place-items-center rounded-xl bg-fuchsia-100 text-fuchsia-700"><Paintbrush size={19} /></span><div><h2 id="style-recipes-title" class="m-0 text-sm font-semibold text-zinc-900">Ricette di stile</h2><p class="mb-0 mt-1 text-[9px] text-zinc-500">Preset configurabili per selezioni, tipi di oggetto o pagina intera.</p></div></div><button onClick={() => setOpen(false)} class="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-500 cursor-pointer"><X size={16} /></button></header>
        <div class="grid min-h-0 flex-1 md:grid-cols-[1fr_320px]">
          <main class="overflow-y-auto p-5"><div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">{recipes.map((recipe) => <button key={recipe.id} onClick={() => setSelectedId(recipe.id)} class={`group relative overflow-hidden rounded-xl border p-3 text-left cursor-pointer ${selectedId === recipe.id ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-zinc-200 bg-white hover:border-zinc-300"}`}><div class="mb-3 flex h-20 items-center justify-center rounded-lg" style={{ background: recipe.fill ?? recipe.background ?? "#f4f4f5", boxShadow: recipe.shadowColor ? `0 ${recipe.shadowOffsetY ?? 4}px ${recipe.shadowBlur ?? 8}px ${recipe.shadowColor}` : undefined, border: `${recipe.strokeWidth ?? 0}px solid ${recipe.stroke ?? "transparent"}`, borderRadius: `${recipe.radius ?? 8}px` }}><span style={{ color: recipe.textColor ?? "#18181b", fontFamily: recipe.fontFamily, fontWeight: recipe.fontWeight }}>Aa</span></div><strong class="block text-[10px] text-zinc-800">{recipe.name}</strong><span class="mt-1 block text-[8px] leading-relaxed text-zinc-400">{recipe.description}</span>{recipe.id.startsWith("custom-") && <span onClick={(event) => { event.stopPropagation(); remove(recipe); }} class="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-red-500 opacity-0 shadow group-hover:opacity-100"><Trash2 size={12} /></span>}{selectedId === recipe.id && <span class="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-violet-600 text-white"><Check size={12} /></span>}</button>)}</div></main>
          <aside class="overflow-y-auto border-l border-zinc-200 bg-zinc-50 p-5"><div class="flex items-center gap-2"><Sparkles size={14} class="text-violet-600" /><strong class="text-[10px] text-zinc-800">Applica ricetta</strong></div><p class="mt-2 text-[8px] leading-relaxed text-zinc-500">Le proprietà non compatibili con il tipo di oggetto vengono ignorate.</p><label class="mt-4 block text-[8px] font-semibold text-zinc-500">Ambito<select value={scope} onChange={(event) => setScope((event.target as HTMLSelectElement).value as typeof scope)} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[9px]"><option value="selection">Selezione corrente</option><option value="type">Tutti dello stesso tipo</option><option value="page">Tutta la pagina</option></select></label><label class="mt-4 block text-[8px] font-semibold text-zinc-500">Intensità {Math.round(intensity * 100)}%<input type="range" min="0.1" max="1" step="0.05" value={intensity} onInput={(event) => setIntensity(Number((event.target as HTMLInputElement).value))} class="mt-2 w-full accent-violet-600" /></label><button onClick={apply} class="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-0 bg-violet-600 text-[9px] font-semibold text-white cursor-pointer"><Paintbrush size={13} /> Applica {selected?.name}</button><div class="my-5 border-t border-zinc-200" /><div class="flex items-center gap-2"><BookmarkPlus size={14} class="text-zinc-500" /><strong class="text-[10px] text-zinc-700">Salva dalla selezione</strong></div><input value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} placeholder="Nome ricetta" class="mt-3 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[9px]" /><button onClick={capture} class="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-[8px] font-semibold text-zinc-600 cursor-pointer hover:border-violet-300"><Save size={12} /> Salva stile corrente</button>{message && <p class="mt-4 rounded-lg bg-white p-3 text-[8px] leading-relaxed text-zinc-600">{message}</p>}</aside>
        </div>
      </div>
    </div>
  );
}