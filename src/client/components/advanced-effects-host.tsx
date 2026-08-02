import { useEffect, useMemo, useState } from "preact/hooks";
import { CirclePlus, Droplets, GripVertical, Minus, Plus, RotateCcw, SunMedium, X } from "lucide-preact";
import * as fabric from "fabric";
import { useEditor } from "../context";
import {
  DEFAULT_GRADIENT,
  applyGradientBackground,
  applyGradientToObject,
  gradientToCss,
  normalizeGradient,
  type GradientDefinition,
  type GradientStop,
} from "../canvas/advanced-gradient";
import {
  DEFAULT_DISSOLVE,
  applyAdvancedDissolve,
  dissolveToCss,
  normalizeDissolve,
  type DissolveDefinition,
} from "../canvas/advanced-dissolve";
import translations from "../../translations";
import { config } from "../../server/config";

const lang = config.lang;

function Slider({ label, value, min, max, step, onInput, suffix = "" }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onInput: (value: number) => void;
  suffix?: string;
}) {
  return (
    <label class="block">
      <div class="flex justify-between items-center mb-1 text-[10px] text-zinc-500"><span>{label}</span><span class="font-mono">{Math.round(value * (step < 1 ? 100 : 1)) / (step < 1 ? 100 : 1)}{suffix}</span></div>
      <input type="range" value={value} min={min} max={max} step={step} onInput={(event) => onInput(Number((event.target as HTMLInputElement).value))} class="w-full accent-violet-600" />
    </label>
  );
}

function Segmented<T extends string>({ value, values, onChange }: { value: T; values: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return <div class="gap-1 grid grid-cols-2 bg-zinc-100 p-1 rounded-xl">{values.map((item) => <button key={item.value} onClick={() => onChange(item.value)} class={`h-9 rounded-lg border-0 text-[10px] font-semibold cursor-pointer ${value === item.value ? "bg-white text-violet-700 shadow-sm" : "bg-transparent text-zinc-500"}`}>{item.label}</button>)}</div>;
}

function replaceObject(canvas: fabric.Canvas, source: fabric.FabricObject, replacement: fabric.FabricObject): void {
  const index = canvas.getObjects().indexOf(source);
  canvas.remove(source);
  canvas.add(replacement);
  if (index >= 0) (canvas as fabric.Canvas & { moveObjectTo?: (object: fabric.FabricObject, index: number) => void }).moveObjectTo?.(replacement, index);
  canvas.setActiveObject(replacement);
  canvas.requestRenderAll();
  canvas.fire("object:modified", { target: replacement } as never);
}

function GradientEditor({ onClose }: { onClose: () => void }) {
  const { canvas, selectedObject, canvasWidth, canvasHeight } = useEditor();
  const target = canvas?.getActiveObject() ?? selectedObject;
  const [definition, setDefinition] = useState<GradientDefinition>(() => ({ ...DEFAULT_GRADIENT, stops: DEFAULT_GRADIENT.stops.map((stop) => ({ ...stop, id: crypto.randomUUID() })) }));
  const [selectedStopId, setSelectedStopId] = useState(definition.stops[0].id);
  const selectedStop = definition.stops.find((stop) => stop.id === selectedStopId) ?? definition.stops[0];
  const normalized = useMemo(() => normalizeGradient(definition), [definition]);
  const css = useMemo(() => gradientToCss(normalized), [normalized]);

  const updateStop = (changes: Partial<GradientStop>) => setDefinition((current) => ({
    ...current,
    stops: current.stops.map((stop) => stop.id === selectedStop.id ? { ...stop, ...changes } : stop),
  }));
  const addStop = (offset = 0.5) => {
    const stop = { id: crypto.randomUUID(), color: selectedStop?.color ?? "#ffffff", opacity: selectedStop?.opacity ?? 1, offset };
    setDefinition((current) => ({ ...current, stops: [...current.stops, stop] }));
    setSelectedStopId(stop.id);
  };
  const removeStop = () => {
    if (definition.stops.length <= 2) return;
    const remaining = definition.stops.filter((stop) => stop.id !== selectedStop.id);
    setDefinition((current) => ({ ...current, stops: remaining }));
    setSelectedStopId(remaining[0].id);
  };
  const addFromTrack = (event: MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    addStop(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)));
  };
  const applyObject = () => {
    if (!canvas || !target || target instanceof fabric.FabricImage) return;
    if (applyGradientToObject(target, normalized) === 0) return;
    target.setCoords();
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target } as never);
  };
  const applyBackground = () => {
    if (!canvas) return;
    applyGradientBackground(canvas, canvasWidth, canvasHeight, normalized);
  };

  return (
    <div>
      <header class="flex justify-between items-start mb-4"><div><div class="flex items-center gap-2"><SunMedium size={17} class="text-violet-600" /><h2 class="m-0 font-semibold text-zinc-900 text-base">Gradiente avanzato</h2></div><p class="mt-1 text-[10px] text-zinc-500 leading-relaxed">Aggiungi, seleziona e sposta nodi colore. Applica il risultato a una forma o all’intero sfondo.</p></div><button onClick={onClose} class="place-items-center grid bg-zinc-100 border-0 rounded-lg w-8 h-8 text-zinc-500 cursor-pointer"><X size={15} /></button></header>
      <Segmented value={definition.kind} values={[{ value: "linear", label: "Lineare" }, { value: "radial", label: "Radiale" }]} onChange={(kind) => setDefinition((current) => ({ ...current, kind }))} />
      <div class="shadow-inner mt-3 border border-zinc-200 rounded-2xl aspect-video" style={{ background: css }} />
      <div class="relative mt-5 border border-zinc-200 rounded-xl h-9 cursor-crosshair" style={{ background: css }} onDblClick={addFromTrack} title="Doppio clic per aggiungere un nodo">
        {normalized.stops.map((stop) => <button key={stop.id} onClick={(event) => { event.stopPropagation(); setSelectedStopId(stop.id); }} class={`absolute top-1/2 h-7 w-5 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 shadow cursor-pointer ${selectedStop.id === stop.id ? "border-violet-600 scale-110" : "border-white"}`} style={{ left: `${stop.offset * 100}%`, background: stop.color }} title={`${Math.round(stop.offset * 100)}%`}><span class="sr-only">Nodo {Math.round(stop.offset * 100)}%</span></button>)}
      </div>
      <div class="flex justify-between items-center mt-1 text-[8px] text-zinc-400"><span>0%</span><span>Doppio clic sulla barra per aggiungere un nodo</span><span>100%</span></div>

      <div class="bg-zinc-50 mt-4 p-3 border border-zinc-200 rounded-2xl">
        <div class="flex justify-between items-center mb-3"><strong class="text-[10px] text-zinc-700">Nodo selezionato</strong><div class="flex gap-1"><button onClick={() => addStop(Math.min(1, selectedStop.offset + 0.12))} class="place-items-center grid bg-white border border-zinc-200 rounded-lg w-7 h-7 text-zinc-600 cursor-pointer" title="Aggiungi nodo"><Plus size={13} /></button><button disabled={definition.stops.length <= 2} onClick={removeStop} class="place-items-center grid bg-white disabled:opacity-30 border border-zinc-200 rounded-lg w-7 h-7 text-zinc-600 cursor-pointer" title="Rimuovi nodo"><Minus size={13} /></button></div></div>
        <div class="gap-3 grid grid-cols-[72px_1fr]"><input type="color" value={selectedStop.color} onInput={(event) => updateStop({ color: (event.target as HTMLInputElement).value })} class="bg-white p-1 border border-zinc-200 rounded-xl w-full h-12 cursor-pointer" /><div class="space-y-3"><Slider label="Posizione" value={selectedStop.offset} min={0} max={1} step={0.01} suffix="" onInput={(offset) => updateStop({ offset })} /><Slider label="Opacità" value={selectedStop.opacity} min={0} max={1} step={0.01} onInput={(opacity) => updateStop({ opacity })} /></div></div>
      </div>

      <div class="space-y-3 mt-4">
        {definition.kind === "linear" ? <Slider label="Angolo" value={definition.angle} min={0} max={360} step={1} suffix="°" onInput={(angle) => setDefinition((current) => ({ ...current, angle }))} /> : <><Slider label="Centro X" value={definition.centerX} min={0} max={1} step={0.01} onInput={(centerX) => setDefinition((current) => ({ ...current, centerX }))} /><Slider label="Centro Y" value={definition.centerY} min={0} max={1} step={0.01} onInput={(centerY) => setDefinition((current) => ({ ...current, centerY }))} /><Slider label="Raggio" value={definition.radius} min={0.1} max={1.5} step={0.01} onInput={(radius) => setDefinition((current) => ({ ...current, radius }))} /></>}
      </div>
      <div class="gap-2 grid grid-cols-2 mt-5"><button disabled={!target || target instanceof fabric.FabricImage} onClick={applyObject} class="bg-violet-50 disabled:opacity-35 border border-violet-200 rounded-xl h-10 font-semibold text-[10px] text-violet-700 cursor-pointer">Applica all’oggetto</button><button disabled={!canvas} onClick={applyBackground} class="bg-violet-600 disabled:opacity-35 border-0 rounded-xl h-10 font-semibold text-[10px] text-white cursor-pointer">Usa come sfondo</button></div>
      {target instanceof fabric.FabricImage && <p class="mt-2 text-[8px] text-amber-600">I gradienti riempiono forme, testi e vettori. Per sfumare un’immagine usa Dissolvenza avanzata.</p>}
    </div>
  );
}

function DissolveEditor({ onClose }: { onClose: () => void }) {
  const { canvas, selectedObject } = useEditor();
  const target = canvas?.getActiveObject() ?? selectedObject;
  const image = target instanceof fabric.FabricImage ? target : null;
  const [definition, setDefinition] = useState<DissolveDefinition>({ ...DEFAULT_DISSOLVE });
  const [busy, setBusy] = useState(false);
  const normalized = useMemo(() => normalizeDissolve(definition), [definition]);
  const mask = useMemo(() => dissolveToCss(normalized), [normalized]);
  const previewUrl = useMemo(() => {
    if (!image) return null;
    try { return image.toDataURL({ format: "png", multiplier: 0.35 }); } catch { return null; }
  }, [image]);

  const apply = async () => {
    if (!canvas || !image) return;
    setBusy(true);
    try { replaceObject(canvas, image, await applyAdvancedDissolve(image, normalized)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <header class="flex justify-between items-start mb-4"><div><div class="flex items-center gap-2"><Droplets size={17} class="text-sky-600" /><h2 class="m-0 font-semibold text-zinc-900 text-base">Dissolvenza avanzata</h2></div><p class="mt-1 text-[10px] text-zinc-500 leading-relaxed">{translations[lang].transparencyLimitHint}</p></div><button onClick={onClose} class="place-items-center grid bg-zinc-100 border-0 rounded-lg w-8 h-8 text-zinc-500 cursor-pointer"><X size={15} /></button></header>
      <Segmented value={definition.kind} values={[{ value: "linear", label: "Lineare" }, { value: "radial", label: "Radiale" }]} onChange={(kind) => setDefinition((current) => ({ ...current, kind }))} />
      <div class="place-items-center grid mt-3 border border-zinc-200 rounded-2xl aspect-video overflow-hidden" style={{ backgroundImage: "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e4e7 75%),linear-gradient(-45deg,transparent 75%,#e4e4e7 75%)", backgroundSize: "18px 18px", backgroundPosition: "0 0,0 9px,9px -9px,-9px 0" }}>
        {previewUrl ? <img src={previewUrl} alt="Anteprima dissolvenza" class="w-full h-full object-contain" style={{ maskImage: mask, WebkitMaskImage: mask }} /> : <span class="text-[10px] text-zinc-400">Seleziona un’immagine nel canvas</span>}
      </div>
      <div class="bg-zinc-50 mt-4 p-3 border border-zinc-200 rounded-2xl">
        <div class="flex justify-between items-center mb-3"><strong class="text-[10px] text-zinc-700">Nodi alpha</strong><button onClick={() => setDefinition((current) => ({ ...current, invert: !current.invert }))} class={`rounded-lg border px-2 py-1 text-[9px] font-semibold cursor-pointer ${definition.invert ? "border-sky-400 bg-sky-50 text-sky-700" : "border-zinc-200 bg-white text-zinc-500"}`}>Inverti</button></div>
        <div class="relative mb-4 border border-zinc-200 rounded-lg h-7" style={{ background: mask }}><span class="top-1/2 absolute bg-violet-600 shadow rounded w-1 h-9 -translate-x-1/2 -translate-y-1/2" style={{ left: `${normalized.start * 100}%` }} /><span class="top-1/2 absolute bg-sky-500 shadow rounded w-1 h-9 -translate-x-1/2 -translate-y-1/2" style={{ left: `${normalized.end * 100}%` }} /></div>
        <div class="space-y-3"><Slider label="Inizio dissolvenza" value={definition.start} min={0} max={Math.max(0.01, definition.end - 0.01)} step={0.01} onInput={(start) => setDefinition((current) => ({ ...current, start }))} /><Slider label="Fine dissolvenza" value={definition.end} min={Math.min(0.99, definition.start + 0.01)} max={1} step={0.01} onInput={(end) => setDefinition((current) => ({ ...current, end }))} /></div>
      </div>
      <div class="space-y-3 mt-4">{definition.kind === "linear" ? <Slider label="Direzione" value={definition.angle} min={0} max={360} step={1} suffix="°" onInput={(angle) => setDefinition((current) => ({ ...current, angle }))} /> : <><Slider label="Centro X" value={definition.centerX} min={0} max={1} step={0.01} onInput={(centerX) => setDefinition((current) => ({ ...current, centerX }))} /><Slider label="Centro Y" value={definition.centerY} min={0} max={1} step={0.01} onInput={(centerY) => setDefinition((current) => ({ ...current, centerY }))} /><Slider label="Raggio" value={definition.radius} min={0.1} max={1.5} step={0.01} onInput={(radius) => setDefinition((current) => ({ ...current, radius }))} /></>}</div>
      <div class="gap-2 grid grid-cols-[1fr_auto] mt-5"><button disabled={!image || busy} onClick={() => void apply()} class="bg-gradient-to-r from-sky-600 to-cyan-500 disabled:opacity-35 border-0 rounded-xl h-10 font-semibold text-[10px] text-white cursor-pointer">{busy ? "Elaborazione…" : "Applica dissolvenza"}</button><button onClick={() => setDefinition({ ...DEFAULT_DISSOLVE })} title="Reimposta" class="place-items-center grid bg-white border border-zinc-200 rounded-xl w-10 h-10 text-zinc-500 cursor-pointer"><RotateCcw size={14} /></button></div>
    </div>
  );
}

export function AdvancedEffectsHost() {
  const [tool, setTool] = useState<"gradient" | "dissolve" | null>(null);

  useEffect(() => {
    const openTool = (event: Event) => {
      const requested = (event as CustomEvent<{ tool?: string }>).detail?.tool;
      if (requested !== "gradient" && requested !== "dissolve") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setTool(requested);
    };
    const interceptCard = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest("button");
      const heading = button?.querySelector("strong")?.textContent?.trim();
      const requested = heading === "Gradienti" ? "gradient" : heading === "Dissolvenza" ? "dissolve" : null;
      if (!requested || !button?.closest("aside")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setTool(requested);
    };
    window.addEventListener("ddone:open-tool", openTool, true);
    document.addEventListener("click", interceptCard, true);
    return () => {
      window.removeEventListener("ddone:open-tool", openTool, true);
      document.removeEventListener("click", interceptCard, true);
    };
  }, []);

  if (!tool) return null;
  return (
    <div class="z-[190] fixed inset-0 place-items-center grid bg-zinc-950/35 backdrop-blur-[2px] p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setTool(null); }}>
      <section role="dialog" aria-modal="true" aria-label={tool === "gradient" ? "Gradiente avanzato" : "Dissolvenza avanzata"} class="bg-white shadow-2xl p-5 border border-white/70 rounded-3xl w-full max-w-[470px] max-h-[92vh] overflow-y-auto">
        {tool === "gradient" ? <GradientEditor onClose={() => setTool(null)} /> : <DissolveEditor onClose={() => setTool(null)} />}
      </section>
    </div>
  );
}
