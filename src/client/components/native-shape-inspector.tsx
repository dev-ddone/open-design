import { useEffect, useMemo, useState } from "preact/hooks";
import { CircleDot, Copy, Droplets, Gauge, Minus, Plus, Save, Shapes, Trash2 } from "lucide-preact";
import {
  NATIVE_SHAPE_LABELS,
  isNativeShape,
  readNativeShapeData,
  rebuildNativeShape,
  type NativeFillMode,
  type NativeGradientStop,
  type NativeShapeData,
  type NativeShapeKind,
  type NativeStrokeCap,
  type NativeStrokeJoin,
  type NativeStrokeStyle,
} from "../canvas/native-shapes";
import { useEditor } from "../context";

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label class="block text-[9px] font-semibold text-zinc-500">{label}<input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} onInput={(event) => onChange(Number((event.target as HTMLInputElement).value))} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-violet-400" /></label>;
}

function RangeField({ label, value, min, max, step = 1, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <label class="block"><span class="mb-1 flex items-center justify-between text-[9px] font-semibold text-zinc-500"><span>{label}</span><span class="font-mono text-zinc-400">{Math.round(value * (step < 1 ? 100 : 1)) / (step < 1 ? 100 : 1)}{suffix}</span></span><input type="range" value={value} min={min} max={max} step={step} onInput={(event) => onChange(Number((event.target as HTMLInputElement).value))} class="w-full accent-violet-600" /></label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label class="block text-[9px] font-semibold text-zinc-500">{label}<div class="mt-1 flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white p-1"><input type="color" value={value} onInput={(event) => onChange((event.target as HTMLInputElement).value)} class="h-7 w-9 rounded border-0 bg-transparent p-0" /><input value={value} onInput={(event) => onChange((event.target as HTMLInputElement).value)} class="min-w-0 flex-1 border-0 bg-transparent font-mono text-[9px] outline-none" /></div></label>;
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Shapes; children: preact.ComponentChildren }) {
  return <section class="rounded-xl border border-zinc-200 bg-white p-3"><div class="mb-3 flex items-center gap-2"><Icon size={14} class="text-violet-600" /><strong class="text-[10px] text-zinc-700">{title}</strong></div>{children}</section>;
}

function StopEditor({ stop, index, total, onChange, onRemove }: { stop: NativeGradientStop; index: number; total: number; onChange: (stop: NativeGradientStop) => void; onRemove: () => void }) {
  return <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
    <div class="mb-2 flex items-center justify-between"><span class="text-[8px] font-semibold text-zinc-500">Nodo {index + 1}</span><button disabled={total <= 2} onClick={onRemove} class="grid h-6 w-6 place-items-center rounded-md border-0 bg-transparent text-zinc-400 cursor-pointer hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={11} /></button></div>
    <div class="grid grid-cols-[42px_1fr] gap-2"><input type="color" value={stop.color} onInput={(event) => onChange({ ...stop, color: (event.target as HTMLInputElement).value })} class="h-9 w-full rounded-lg border border-zinc-200 bg-white p-1" /><div><RangeField label="Posizione" value={stop.offset} min={0} max={1} step={0.01} suffix="" onChange={(offset) => onChange({ ...stop, offset })} /></div></div>
    <div class="mt-2"><RangeField label="Opacità nodo" value={stop.opacity} min={0} max={1} step={0.01} onChange={(opacity) => onChange({ ...stop, opacity })} /></div>
  </div>;
}

const STROKE_PRESETS: Array<{ label: string; value: NativeStrokeStyle }> = [
  { label: "Continua", value: "solid" },
  { label: "Tratteggiata", value: "dashed" },
  { label: "Puntinata", value: "dotted" },
  { label: "Dash lungo", value: "long-dash" },
  { label: "Dash-punto", value: "dash-dot" },
  { label: "Personalizzata", value: "custom" },
];

export function NativeShapeInspector() {
  const { canvas, selectedObject, duplicateSelected, deleteSelected } = useEditor();
  const target = canvas?.getActiveObject() ?? selectedObject;
  const initial = useMemo(() => readNativeShapeData(target), [target]);
  const [draft, setDraft] = useState<NativeShapeData | null>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setDraft(readNativeShapeData(target)), [target]);

  if (!target || !draft || !isNativeShape(target)) return <div class="m-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-700">Seleziona una forma nativa per modificare geometria, riempimento e tratto.</div>;

  const patch = (changes: Partial<NativeShapeData>) => setDraft((current) => current ? { ...current, ...changes } : current);
  const updateStop = (index: number, stop: NativeGradientStop) => patch({ gradientStops: draft.gradientStops.map((current, currentIndex) => currentIndex === index ? stop : current) });
  const removeStop = (index: number) => patch({ gradientStops: draft.gradientStops.filter((_, currentIndex) => currentIndex !== index) });
  const addStop = () => {
    const sorted = [...draft.gradientStops].sort((first, second) => first.offset - second.offset);
    const previous = sorted[Math.max(0, sorted.length - 2)] ?? sorted[0];
    const last = sorted[sorted.length - 1] ?? previous;
    patch({ gradientStops: [...sorted, { offset: (previous.offset + last.offset) / 2, color: previous.color, opacity: (previous.opacity + last.opacity) / 2 }].sort((first, second) => first.offset - second.offset) });
  };
  const save = async () => {
    const currentTarget = canvas?.getActiveObject() ?? target;
    if (!canvas || !currentTarget || !isNativeShape(currentTarget)) return;
    setSaving(true); setMessage(null);
    try { rebuildNativeShape(canvas, currentTarget, draft); setMessage("Forma aggiornata e sincronizzata."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Aggiornamento non riuscito"); }
    finally { setSaving(false); }
  };

  const isCircular = ["circle", "ellipse", "ring", "arc", "progress-ring"].includes(draft.kind);
  const isLineLike = ["line", "arrow", "arc", "progress-ring", "bracket"].includes(draft.kind);
  const hasCorners = ["rounded-rect", "callout"].includes(draft.kind);
  const hasPoints = ["polygon", "star"].includes(draft.kind);

  return <div class="h-full overflow-y-auto p-3" data-testid="native-shape-inspector">
    <div class="mb-3 rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-3">
      <div class="flex items-start justify-between gap-2"><div><div class="mb-1 flex items-center gap-2"><Shapes size={15} class="text-violet-600" /><strong class="text-[11px] text-zinc-800">{NATIVE_SHAPE_LABELS[draft.kind]}</strong></div><p class="m-0 text-[9px] leading-relaxed text-zinc-500">Oggetto parametrico: le modifiche restano editabili dopo salvataggio, undo e collaborazione.</p></div><div class="flex gap-1"><button onClick={() => void duplicateSelected()} title="Duplica" class="grid h-7 w-7 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 cursor-pointer hover:text-violet-600"><Copy size={12} /></button><button onClick={deleteSelected} title="Elimina" class="grid h-7 w-7 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 cursor-pointer hover:text-red-500"><Trash2 size={12} /></button></div></div>
    </div>

    <div class="flex flex-col gap-3">
      <Section title="Geometria" icon={Shapes}>
        <label class="block text-[9px] font-semibold text-zinc-500">Tipo forma<select value={draft.kind} onChange={(event) => patch({ kind: (event.target as HTMLSelectElement).value as NativeShapeKind })} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] outline-none focus:border-violet-400">{Object.entries(NATIVE_SHAPE_LABELS).map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}</select></label>
        <div class="mt-3 grid grid-cols-2 gap-2"><NumberField label="Larghezza" value={draft.width} min={24} max={3000} onChange={(width) => patch({ width })} /><NumberField label="Altezza" value={draft.height} min={24} max={3000} onChange={(height) => patch({ height })} /></div>
        {isCircular && <button onClick={() => patch({ height: draft.width })} class="mt-2 h-8 w-full rounded-lg border border-zinc-200 bg-zinc-50 text-[8px] font-semibold text-zinc-600 cursor-pointer hover:border-violet-300">Rendi perfettamente circolare</button>}
        {hasCorners && <div class="mt-3"><RangeField label="Raggio angoli" value={draft.cornerRadius} min={0} max={Math.min(draft.width, draft.height) / 2} onChange={(cornerRadius) => patch({ cornerRadius })} /></div>}
        {hasPoints && <div class="mt-3"><RangeField label={draft.kind === "star" ? "Numero punte" : "Numero lati"} value={draft.points} min={3} max={24} onChange={(points) => patch({ points: Math.round(points) })} /></div>}
        {draft.kind === "star" && <div class="mt-3"><RangeField label="Raggio interno" value={draft.innerRadius} min={0.08} max={0.92} step={0.01} onChange={(innerRadius) => patch({ innerRadius })} /></div>}
        {draft.kind === "arc" && <div class="mt-3 grid grid-cols-2 gap-2"><NumberField label="Angolo iniziale" value={draft.startAngle} min={-720} max={720} onChange={(startAngle) => patch({ startAngle })} /><NumberField label="Angolo finale" value={draft.endAngle} min={-720} max={1080} onChange={(endAngle) => patch({ endAngle })} /></div>}
        {draft.kind === "progress-ring" && <div class="mt-3"><RangeField label="Avanzamento" value={draft.progress} min={0} max={100} step={0.5} suffix="%" onChange={(progress) => patch({ progress })} /><div class="mt-2"><NumberField label="Punto di partenza" value={draft.startAngle} min={-360} max={360} onChange={(startAngle) => patch({ startAngle })} /></div></div>}
        {(draft.kind === "line" || draft.kind === "arrow") && <div class="mt-3 grid grid-cols-2 gap-2"><label class="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 text-[9px] text-zinc-600"><input type="checkbox" checked={draft.arrowStart} onChange={(event) => patch({ arrowStart: (event.target as HTMLInputElement).checked })} /> Freccia iniziale</label><label class="flex items-center gap-2 rounded-lg border border-zinc-200 p-2 text-[9px] text-zinc-600"><input type="checkbox" checked={draft.arrowEnd} onChange={(event) => patch({ arrowEnd: (event.target as HTMLInputElement).checked })} /> Freccia finale</label></div>}
      </Section>

      {!isLineLike && draft.kind !== "ring" && <Section title="Riempimento" icon={Droplets}>
        <label class="block text-[9px] font-semibold text-zinc-500">Modalità<select value={draft.fillMode} onChange={(event) => patch({ fillMode: (event.target as HTMLSelectElement).value as NativeFillMode })} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px]"><option value="solid">Colore uniforme</option><option value="transparent">Trasparente</option><option value="linear">Gradiente lineare</option><option value="radial">Gradiente radiale</option></select></label>
        {draft.fillMode === "solid" && <div class="mt-3"><ColorField label="Colore" value={draft.fillColor} onChange={(fillColor) => patch({ fillColor })} /></div>}
        {draft.fillMode !== "transparent" && <div class="mt-3"><RangeField label="Opacità riempimento" value={draft.fillOpacity} min={0} max={1} step={0.01} onChange={(fillOpacity) => patch({ fillOpacity })} /></div>}
        {(draft.fillMode === "linear" || draft.fillMode === "radial") && <div class="mt-3 flex flex-col gap-2">
          <div class="flex items-center justify-between"><strong class="text-[9px] text-zinc-600">Nodi gradiente</strong><button disabled={draft.gradientStops.length >= 8} onClick={addStop} class="inline-flex h-7 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 text-[8px] font-semibold text-violet-700 cursor-pointer disabled:opacity-40"><Plus size={11} /> Nodo</button></div>
          {draft.gradientStops.map((stop, index) => <StopEditor key={`${index}-${stop.offset}`} stop={stop} index={index} total={draft.gradientStops.length} onChange={(value) => updateStop(index, value)} onRemove={() => removeStop(index)} />)}
          {draft.fillMode === "linear" ? <RangeField label="Angolo gradiente" value={draft.gradientAngle} min={-360} max={360} suffix="°" onChange={(gradientAngle) => patch({ gradientAngle })} /> : <div class="grid grid-cols-2 gap-2"><NumberField label="Centro X" value={draft.gradientCenterX} min={0} max={1} step={0.01} onChange={(gradientCenterX) => patch({ gradientCenterX })} /><NumberField label="Centro Y" value={draft.gradientCenterY} min={0} max={1} step={0.01} onChange={(gradientCenterY) => patch({ gradientCenterY })} /><div class="col-span-2"><RangeField label="Raggio" value={draft.gradientRadius} min={0.05} max={2} step={0.01} onChange={(gradientRadius) => patch({ gradientRadius })} /></div></div>}
        </div>}
      </Section>}

      <Section title="Bordo e linea" icon={CircleDot}>
        <div class="grid grid-cols-2 gap-2"><ColorField label="Colore" value={draft.strokeColor} onChange={(strokeColor) => patch({ strokeColor })} /><NumberField label="Spessore" value={draft.strokeWidth} min={0} max={160} step={0.5} onChange={(strokeWidth) => patch({ strokeWidth })} /></div>
        <div class="mt-3"><RangeField label="Opacità tratto" value={draft.strokeOpacity} min={0} max={1} step={0.01} onChange={(strokeOpacity) => patch({ strokeOpacity })} /></div>
        <div class="mt-3 grid grid-cols-2 gap-2">{STROKE_PRESETS.map((preset) => <button key={preset.value} onClick={() => patch({ strokeStyle: preset.value })} class={`h-8 rounded-lg border text-[8px] font-semibold cursor-pointer ${draft.strokeStyle === preset.value ? "border-violet-400 bg-violet-50 text-violet-700" : "border-zinc-200 bg-white text-zinc-500 hover:border-violet-200"}`}>{preset.label}</button>)}</div>
        {draft.strokeStyle === "custom" && <label class="mt-3 block text-[9px] font-semibold text-zinc-500">Sequenza trattini<input value={draft.customDash.join(", ")} onInput={(event) => patch({ customDash: (event.target as HTMLInputElement).value.split(/[ ,;]+/).map(Number).filter((value) => Number.isFinite(value) && value > 0) })} placeholder="16, 10, 2, 10" class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 font-mono text-[9px] outline-none focus:border-violet-400" /></label>}
        <div class="mt-3 grid grid-cols-2 gap-2"><label class="block text-[9px] font-semibold text-zinc-500">Estremità<select value={draft.strokeLineCap} onChange={(event) => patch({ strokeLineCap: (event.target as HTMLSelectElement).value as NativeStrokeCap })} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[9px]"><option value="butt">Piatta</option><option value="round">Tonda</option><option value="square">Quadrata</option></select></label><label class="block text-[9px] font-semibold text-zinc-500">Giunzioni<select value={draft.strokeLineJoin} onChange={(event) => patch({ strokeLineJoin: (event.target as HTMLSelectElement).value as NativeStrokeJoin })} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[9px]"><option value="miter">Appuntita</option><option value="round">Arrotondata</option><option value="bevel">Smussata</option></select></label></div>
      </Section>

      <button disabled={saving} onClick={() => void save()} class="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"><Save size={15} /> {saving ? "Applicazione…" : "Applica modifiche"}</button>
      {message && <p class="m-0 text-center text-[9px] text-zinc-500">{message}</p>}
      <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><div class="mb-1 flex items-center gap-2"><Gauge size={13} class="text-violet-600" /><strong class="text-[9px] text-zinc-600">Suggerimento</strong></div><p class="m-0 text-[8px] leading-relaxed text-zinc-400">Usa anello e indicatore circolare per progressi; trasforma linee in frecce attivando le punte; usa più nodi per gradienti editoriali.</p></div>
    </div>
  </div>;
}
