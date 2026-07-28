import { useMemo, useState } from "preact/hooks";
import { Circle, CornerDownRight, Hexagon, MessageSquare, Minus, MoveRight, Parentheses, RectangleHorizontal, Sparkles, Star, Triangle } from "lucide-preact";
import { buildNativeShape, createNativeShapeData, NATIVE_SHAPE_GROUPS, NATIVE_SHAPE_LABELS, type NativeShapeKind, type NativeStrokeStyle } from "../canvas/native-shapes";
import { placeObjectWithoutOverlap } from "../canvas/smart-placement";
import { useEditor } from "../context";

const ICONS: Partial<Record<NativeShapeKind, typeof Circle>> = {
  rect: RectangleHorizontal,
  "rounded-rect": RectangleHorizontal,
  circle: Circle,
  ellipse: Circle,
  line: Minus,
  arrow: MoveRight,
  triangle: Triangle,
  polygon: Hexagon,
  star: Star,
  ring: Circle,
  arc: CornerDownRight,
  "progress-ring": Circle,
  callout: MessageSquare,
  bracket: Parentheses,
};

const STROKE_PRESETS: Array<{ label: string; value: NativeStrokeStyle; dash: string }> = [
  { label: "Continua", value: "solid", dash: "none" },
  { label: "Tratteggiata", value: "dashed", dash: "10 6" },
  { label: "Puntinata", value: "dotted", dash: "1 6" },
  { label: "Dash lungo", value: "long-dash", dash: "18 7" },
  { label: "Dash-punto", value: "dash-dot", dash: "14 5 1 5" },
];

function ShapePreview({ kind, strokeStyle }: { kind: NativeShapeKind; strokeStyle: NativeStrokeStyle }) {
  const dash = STROKE_PRESETS.find((preset) => preset.value === strokeStyle)?.dash;
  const common = { fill: kind === "line" || kind === "arrow" || kind === "ring" || kind === "arc" || kind === "progress-ring" || kind === "bracket" ? "none" : "#ede9fe", stroke: "#7c3aed", strokeWidth: 2.4, strokeDasharray: dash === "none" ? undefined : dash, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "circle") return <svg viewBox="0 0 64 48"><circle cx="32" cy="24" r="17" {...common} /></svg>;
  if (kind === "ellipse") return <svg viewBox="0 0 64 48"><ellipse cx="32" cy="24" rx="23" ry="14" {...common} /></svg>;
  if (kind === "rect") return <svg viewBox="0 0 64 48"><rect x="10" y="10" width="44" height="28" {...common} /></svg>;
  if (kind === "rounded-rect") return <svg viewBox="0 0 64 48"><rect x="8" y="9" width="48" height="30" rx="9" {...common} /></svg>;
  if (kind === "triangle") return <svg viewBox="0 0 64 48"><path d="M32 7 56 40H8Z" {...common} /></svg>;
  if (kind === "polygon") return <svg viewBox="0 0 64 48"><path d="m32 5 21 10v19L32 44 11 34V15Z" {...common} /></svg>;
  if (kind === "star") return <svg viewBox="0 0 64 48"><path d="m32 4 6.5 13.5 15 2.2-10.8 10.5 2.6 14.8L32 38l-13.3 7 2.6-14.8L10.5 19.7l15-2.2Z" {...common} /></svg>;
  if (kind === "line") return <svg viewBox="0 0 64 48"><path d="M8 24h48" {...common} /></svg>;
  if (kind === "arrow") return <svg viewBox="0 0 64 48"><path d="M8 24h43m-10-10 10 10-10 10" {...common} /></svg>;
  if (kind === "ring") return <svg viewBox="0 0 64 48"><circle cx="32" cy="24" r="17" fill="none" stroke="#7c3aed" stroke-width="7" stroke-dasharray={dash === "none" ? undefined : dash} /></svg>;
  if (kind === "arc") return <svg viewBox="0 0 64 48"><path d="M10 31a23 23 0 0 1 43-9" {...common} /></svg>;
  if (kind === "progress-ring") return <svg viewBox="0 0 64 48"><circle cx="32" cy="24" r="17" fill="none" stroke="#e4e4e7" stroke-width="7" /><path d="M32 7a17 17 0 1 1-15 25" fill="none" stroke="#7c3aed" stroke-width="7" stroke-linecap="round" /></svg>;
  if (kind === "callout") return <svg viewBox="0 0 64 48"><path d="M8 7h48v27H38l-8 9v-9H8Z" {...common} /></svg>;
  return <svg viewBox="0 0 64 48"><path d="M50 7H17a8 8 0 0 0-8 8v18a8 8 0 0 0 8 8h33" {...common} /></svg>;
}

export function NativeShapesPanel() {
  const { canvas, canvasWidth, canvasHeight } = useEditor();
  const [color, setColor] = useState("#7c3aed");
  const [strokeStyle, setStrokeStyle] = useState<NativeStrokeStyle>("solid");
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return NATIVE_SHAPE_GROUPS;
    return NATIVE_SHAPE_GROUPS.map((group) => ({ ...group, items: group.items.filter((kind) => `${NATIVE_SHAPE_LABELS[kind]} ${kind}`.toLowerCase().includes(needle)) })).filter((group) => group.items.length > 0);
  }, [query]);

  const addShape = (kind: NativeShapeKind) => {
    if (!canvas) return;
    const data = createNativeShapeData(kind, color);
    data.strokeStyle = strokeStyle;
    if (kind === "line") data.arrowEnd = false;
    if (kind === "arrow") data.arrowEnd = true;
    const object = buildNativeShape(data);
    const maximumWidth = canvasWidth * 0.48;
    const maximumHeight = canvasHeight * 0.42;
    const scale = Math.min(maximumWidth / Math.max(1, object.width || data.width), maximumHeight / Math.max(1, object.height || data.height), 1);
    object.set({ scaleX: scale, scaleY: scale });
    placeObjectWithoutOverlap(canvas, object, canvasWidth, canvasHeight);
    canvas.add(object);
    canvas.setActiveObject(object);
    object.setCoords();
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: object } as never);
    window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: "shape" } }));
  };

  return <div class="flex flex-col gap-4" data-testid="native-shapes-panel">
    <div class="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-3">
      <div class="mb-1 flex items-center gap-2"><Sparkles size={15} class="text-violet-600" /><strong class="text-[11px] text-zinc-800">Forme native modificabili</strong></div>
      <p class="m-0 text-[9px] leading-relaxed text-zinc-500">Non sono immagini: geometria, riempimento, gradiente, tratto e indicatori restano editabili.</p>
    </div>
    <input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Cerca cerchio, freccia, anello…" class="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
    <div>
      <div class="mb-2 flex items-center justify-between"><strong class="text-[9px] text-zinc-600">Colore iniziale</strong><span class="font-mono text-[8px] text-zinc-400">{color}</span></div>
      <input type="color" value={color} onInput={(event) => setColor((event.target as HTMLInputElement).value)} class="h-9 w-full rounded-lg border border-zinc-200 bg-white p-1" />
    </div>
    <div>
      <strong class="mb-2 block text-[9px] text-zinc-600">Stile tratto iniziale</strong>
      <div class="grid grid-cols-2 gap-2">{STROKE_PRESETS.map((preset) => <button key={preset.value} onClick={() => setStrokeStyle(preset.value)} class={`rounded-lg border px-2 py-2 text-left cursor-pointer ${strokeStyle === preset.value ? "border-violet-400 bg-violet-50 text-violet-700" : "border-zinc-200 bg-white text-zinc-500 hover:border-violet-200"}`}><svg viewBox="0 0 70 12" class="mb-1 h-3 w-full"><path d="M4 6h62" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray={preset.dash === "none" ? undefined : preset.dash} /></svg><span class="block text-[8px] font-semibold">{preset.label}</span></button>)}</div>
    </div>
    {groups.map((group) => <section key={group.label}>
      <strong class="mb-2 block text-[10px] text-zinc-700">{group.label}</strong>
      <div class="grid grid-cols-2 gap-2">{group.items.map((kind) => {
        const Icon = ICONS[kind] ?? Circle;
        return <button key={kind} onClick={() => addShape(kind)} class="group overflow-hidden rounded-xl border border-zinc-200 bg-white text-left cursor-pointer transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md">
          <div class="relative grid h-20 place-items-center bg-zinc-50 text-violet-600"><div class="h-12 w-16"><ShapePreview kind={kind} strokeStyle={strokeStyle} /></div><Icon size={12} class="absolute right-2 top-2 text-zinc-300" /></div>
          <div class="px-2.5 py-2"><strong class="block text-[9px] text-zinc-800">{NATIVE_SHAPE_LABELS[kind]}</strong><span class="mt-0.5 block text-[7px] text-zinc-400">Vettore parametrico</span></div>
        </button>;
      })}</div>
    </section>)}
    {groups.length === 0 && <div class="rounded-xl border border-dashed border-zinc-300 p-5 text-center text-[10px] text-zinc-400">Nessuna forma trovata.</div>}
  </div>;
}
