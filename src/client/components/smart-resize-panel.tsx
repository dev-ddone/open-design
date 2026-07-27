import { useMemo, useState } from "preact/hooks";
import { Check, CopyPlus, ExternalLink, Maximize2 } from "lucide-preact";
import { api } from "../api";
import { useEditor } from "../context";
import {
  STATIC_FORMAT_PRESETS,
  buildResizeVariantPlan,
  smartResizeCanvas,
  smartResizeCanvasJson,
  type SmartResizeMode,
  type StaticFormatPreset,
} from "../canvas/smart-resize";
import type { Design } from "../types";

const RECENT_RESIZE_KEY = "ddone_recent_resize_presets";

function readRecentPresets(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_RESIZE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function SmartResizePanel() {
  const {
    canvas,
    canvasWidth,
    canvasHeight,
    setCanvasSize,
    activeDesign,
    activePage,
    getCanvasJSON,
    createVersion,
    navigate,
    refreshLibrary,
  } = useEditor();
  const initialRecent = useMemo(readRecentPresets, []);
  const [width, setWidth] = useState(canvasWidth);
  const [height, setHeight] = useState(canvasHeight);
  const [mode, setMode] = useState<SmartResizeMode>("balanced");
  const [selectedPresetIds, setSelectedPresetIds] = useState<Set<string>>(() => new Set(initialRecent.slice(0, 2)));
  const [recentPresetIds, setRecentPresetIds] = useState<string[]>(initialRecent);
  const [createdDesigns, setCreatedDesigns] = useState<Design[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const groups = useMemo(() => [...new Set(STATIC_FORMAT_PRESETS.map((preset) => preset.group))], []);
  const selectedPlan = useMemo(() => buildResizeVariantPlan(selectedPresetIds), [selectedPresetIds]);
  const recentPresets = useMemo(() => buildResizeVariantPlan(recentPresetIds).slice(0, 4), [recentPresetIds]);

  const selectPreset = (preset: StaticFormatPreset) => {
    setWidth(preset.width);
    setHeight(preset.height);
    setSelectedPresetIds((current) => {
      const next = new Set(current);
      if (next.has(preset.id)) next.delete(preset.id);
      else next.add(preset.id);
      return next;
    });
  };

  const selectGroup = (group: string) => {
    const ids = STATIC_FORMAT_PRESETS.filter((preset) => preset.group === group).map((preset) => preset.id);
    setSelectedPresetIds((current) => {
      const next = new Set(current);
      const allSelected = ids.every((id) => next.has(id));
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const apply = () => {
    if (!canvas) {
      setMessage("Apri e seleziona una pagina prima di ridimensionare.");
      return;
    }
    const result = smartResizeCanvas(canvas, canvasWidth, canvasHeight, width, height, mode);
    setCanvasSize(result.width, result.height);
    setMessage(`${result.movedObjects} elementi riposizionati, ${result.scaledObjects} ridimensionati.`);
  };

  const createDesignVariant = async (target: { label: string; width: number; height: number }, baseCanvasJson: string) => {
    if (!activeDesign) throw new Error("Apri un progetto prima di creare una variante.");
    const transformed = smartResizeCanvasJson(
      baseCanvasJson,
      canvasWidth,
      canvasHeight,
      target.width,
      target.height,
      mode,
    );
    return api<Design>("POST", "/api/designs", {
      name: `${activeDesign.name} · ${target.label}`,
      canvas_json: transformed.canvasJson,
      width: transformed.result.width,
      height: transformed.result.height,
      client_id: activeDesign.client_id ?? null,
      template_id: activeDesign.template_id ?? null,
    });
  };

  const createSelectedVariants = async () => {
    if (!canvas || !activeDesign || selectedPlan.length === 0) return;
    setWorking(true);
    setCreatedDesigns([]);
    try {
      await createVersion(`Before ${selectedPlan.length} campaign variants`, "manual");
      const baseCanvasJson = getCanvasJSON();
      const created: Design[] = [];
      for (const preset of selectedPlan) created.push(await createDesignVariant(preset, baseCanvasJson));
      const recent = [...selectedPlan.map((preset) => preset.id), ...recentPresetIds.filter((id) => !selectedPresetIds.has(id))].slice(0, 8);
      localStorage.setItem(RECENT_RESIZE_KEY, JSON.stringify(recent));
      setRecentPresetIds(recent);
      setCreatedDesigns(created);
      await refreshLibrary();
      setMessage(`${created.length} varianti create senza modificare il progetto originale.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Varianti non create");
    } finally {
      setWorking(false);
    }
  };

  const createCustomVariant = async () => {
    if (!canvas || !activeDesign) return;
    setWorking(true);
    setCreatedDesigns([]);
    try {
      await createVersion("Before custom campaign variant", "manual");
      const created = await createDesignVariant({ label: `${width}×${height}`, width, height }, getCanvasJSON());
      setCreatedDesigns([created]);
      await refreshLibrary();
      setMessage(`Variante ${created.name} creata come progetto separato.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Variante non creata");
    } finally {
      setWorking(false);
    }
  };

  return (
    <aside class="flex h-full w-[320px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 p-4 pt-12">
        <div class="mb-1 flex items-center gap-2">
          <Maximize2 size={16} class="text-violet-600" />
          <h2 class="m-0 text-xs font-semibold text-zinc-800">Smart Resize</h2>
        </div>
        <p class="m-0 text-[9px] leading-relaxed text-zinc-400">Modifica la pagina corrente oppure seleziona più formati e crea tutte le varianti in un’unica operazione.</p>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        {recentPresets.length > 0 && (
          <section class="mb-4">
            <strong class="mb-2 block text-[9px] text-zinc-500">Usati di recente</strong>
            <div class="flex flex-wrap gap-1.5">{recentPresets.map((preset) => <button key={preset.id} onClick={() => selectPreset(preset)} class={`rounded-full border px-2 py-1 text-[8px] cursor-pointer ${selectedPresetIds.has(preset.id) ? "border-violet-400 bg-violet-50 text-violet-700" : "border-zinc-200 bg-white text-zinc-500"}`}>{preset.label}</button>)}</div>
          </section>
        )}

        {groups.map((group) => {
          const groupPresets = STATIC_FORMAT_PRESETS.filter((preset) => preset.group === group);
          const allSelected = groupPresets.every((preset) => selectedPresetIds.has(preset.id));
          return (
            <section key={group} class="mb-4">
              <div class="mb-2 flex items-center justify-between"><strong class="text-[9px] text-zinc-500">{group}</strong><button onClick={() => selectGroup(group)} class="border-0 bg-transparent p-0 text-[8px] text-violet-600 cursor-pointer">{allSelected ? "Deseleziona" : "Seleziona gruppo"}</button></div>
              <div class="grid grid-cols-2 gap-2">
                {groupPresets.map((preset) => {
                  const selected = selectedPresetIds.has(preset.id);
                  return (
                    <button
                      key={preset.id}
                      onClick={() => selectPreset(preset)}
                      class={`relative rounded-xl border p-2 text-left cursor-pointer ${selected ? "border-violet-500 bg-violet-50" : "border-zinc-200 bg-white hover:border-violet-300"}`}
                    >
                      <span class={`absolute right-2 top-2 grid h-4 w-4 place-items-center rounded border ${selected ? "border-violet-600 bg-violet-600 text-white" : "border-zinc-300 bg-white text-transparent"}`}><Check size={10} /></span>
                      <span class="block pr-5 text-[9px] font-semibold text-zinc-700">{preset.label}</span>
                      <span class="text-[8px] text-zinc-400">{preset.width} × {preset.height}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        <div class="grid grid-cols-2 gap-2">
          <label class="text-[9px] font-semibold text-zinc-500">Larghezza<input type="number" min="64" max="10000" value={width} onInput={(event) => setWidth(Number((event.target as HTMLInputElement).value))} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs outline-none focus:border-violet-400" /></label>
          <label class="text-[9px] font-semibold text-zinc-500">Altezza<input type="number" min="64" max="10000" value={height} onInput={(event) => setHeight(Number((event.target as HTMLInputElement).value))} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs outline-none focus:border-violet-400" /></label>
        </div>

        <label class="mt-4 block text-[9px] font-semibold text-zinc-500">Strategia<select value={mode} onChange={(event) => setMode((event.target as HTMLSelectElement).value as SmartResizeMode)} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-violet-400"><option value="balanced">Bilanciata: scala uniforme</option><option value="position-only">Solo layout: non scala gli oggetti</option><option value="stretch">Adatta X e Y indipendentemente</option></select></label>

        <button disabled={working} onClick={apply} class="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-xs font-semibold text-white cursor-pointer disabled:opacity-40"><Maximize2 size={15} /> Modifica pagina corrente</button>
        <button disabled={working || !activeDesign || !activePage || selectedPlan.length === 0} onClick={() => void createSelectedVariants()} class="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-[10px] font-semibold text-violet-700 cursor-pointer disabled:opacity-40"><CopyPlus size={14} /> Crea {selectedPlan.length || 0} varianti selezionate</button>
        <button disabled={working || !activeDesign || !activePage} onClick={() => void createCustomVariant()} class="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-[9px] font-semibold text-zinc-600 cursor-pointer disabled:opacity-40">Crea variante personalizzata {width}×{height}</button>
        <p class="mt-2 text-[8px] leading-relaxed text-zinc-400">Ogni variante è un progetto indipendente. Il sorgente resta invariato e viene creata una versione di sicurezza prima dell’operazione.</p>

        {createdDesigns.length > 0 && <section class="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3"><strong class="text-[9px] text-emerald-700">Varianti create</strong>{createdDesigns.map((design) => <button key={design.id} onClick={() => navigate(`/design/${design.id}`)} class="mt-2 flex w-full items-center justify-between rounded-lg border border-emerald-100 bg-white px-2 py-2 text-left text-[8px] text-emerald-700 cursor-pointer"><span class="truncate">{design.name}</span><ExternalLink size={11} /></button>)}</section>}
        {message && <p class="mt-2 rounded-lg bg-zinc-50 p-2 text-[9px] text-zinc-500">{message}</p>}
      </div>
    </aside>
  );
}
