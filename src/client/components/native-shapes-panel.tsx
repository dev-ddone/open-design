import { useMemo, useState } from "preact/hooks";
import { BarChart3, Circle, CornerDownRight, Hexagon, MessageSquare, Minus, MoveRight, Parentheses, RectangleHorizontal, Sparkles, Star, Triangle } from "lucide-preact";
import { buildNativeShape, createNativeShapeData, NATIVE_SHAPE_GROUPS, NATIVE_SHAPE_LABELS, type NativeShapeKind, type NativeStrokeStyle } from "../canvas/native-shapes";
import { buildSmartElement, type SmartChartData, type SmartChartType } from "../canvas/smart-elements";
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

const CHART_PRESETS: Array<{ type: SmartChartType; label: string; description: string }> = [
  { type: "bar", label: "Barre", description: "Confronto semplice" },
  { type: "grouped-bar", label: "Barre raggruppate", description: "Più serie affiancate" },
  { type: "stacked-bar", label: "Barre impilate", description: "Composizione per categoria" },
  { type: "line", label: "Linee", description: "Andamento e trend" },
  { type: "area", label: "Area", description: "Trend con riempimento" },
  { type: "donut", label: "Anello", description: "Composizione circolare" },
  { type: "pie", label: "Torta", description: "Quote di un totale" },
  { type: "radar", label: "Radar", description: "Confronto multi-asse" },
  { type: "progress", label: "Progress ring", description: "Avanzamento percentuale" },
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

function ChartPreview({ type }: { type: SmartChartType }) {
  if (type === "line" || type === "area") return <svg viewBox="0 0 72 46"><path d="M7 38 22 28 34 32 49 13 65 19" fill={type === "area" ? "#ede9fe" : "none"} stroke="#7c3aed" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /><path d="M7 40h58" stroke="#d4d4d8" /></svg>;
  if (type === "donut" || type === "pie" || type === "progress") return <svg viewBox="0 0 72 46"><circle cx="36" cy="23" r="16" fill={type === "pie" ? "#ede9fe" : "none"} stroke="#e4e4e7" stroke-width={type === "pie" ? 1 : 7} /><path d="M36 7a16 16 0 1 1-14 24" fill="none" stroke="#7c3aed" stroke-width={type === "pie" ? 16 : 7} stroke-linecap="round" /></svg>;
  if (type === "radar") return <svg viewBox="0 0 72 46"><path d="m36 5 25 15-9 21H20L11 20Z" fill="none" stroke="#d4d4d8" /><path d="m36 11 18 11-7 13H24l-6-13Z" fill="#ede9fe" stroke="#7c3aed" stroke-width="2" /></svg>;
  const grouped = type === "grouped-bar"; const stacked = type === "stacked-bar";
  return <svg viewBox="0 0 72 46"><path d="M7 40h58" stroke="#d4d4d8" />{[0, 1, 2, 3].map((index) => grouped ? <g key={index}><rect x={10 + index * 15} y={25 - index * 3} width="5" height={15 + index * 3} fill="#7c3aed" /><rect x={15 + index * 15} y={19 + index} width="5" height={21 - index} fill="#ec4899" /></g> : stacked ? <g key={index}><rect x={11 + index * 15} y={25 - index * 2} width="9" height={15 + index * 2} fill="#7c3aed" /><rect x={11 + index * 15} y={15 - index} width="9" height={10 + index} fill="#ec4899" /></g> : <rect key={index} x={11 + index * 15} y={27 - index * 5} width="9" height={13 + index * 5} rx="2" fill="#7c3aed" />)}</svg>;
}

function createChartData(type: SmartChartType, color: string): SmartChartData {
  const labels = ["Gen", "Feb", "Mar", "Apr", "Mag"];
  const values = type === "progress" ? [72] : [32, 58, 46, 82, 68];
  const multi = ["grouped-bar", "stacked-bar", "line", "area", "radar"].includes(type);
  const series = multi ? [{ name: "Serie A", values, color }, { name: "Serie B", values: [24, 44, 62, 56, 78], color: "#ec4899" }] : [{ name: "Serie A", values, color }];
  return { type: "chart", variant: `chart-${type}`, chartType: type, width: 620, height: 420, title: type === "progress" ? "Avanzamento progetto" : "Risultati", labels: type === "progress" ? ["Avanzamento"] : labels, values, colors: [color, "#ec4899", "#14b8a6", "#f59e0b", "#2563eb"], series, backgroundColor: "#ffffff", textColor: "#18181b", gridColor: "#e4e4e7", showLegend: multi || type === "donut" || type === "pie", showValues: true, showGrid: !["donut", "pie", "progress"].includes(type), rounded: true, valueFormat: type === "progress" ? "percent" : "number", currencySymbol: "€", maxValue: 100 };
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
  const visibleCharts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? CHART_PRESETS.filter((chart) => `${chart.label} ${chart.description} grafico chart`.toLowerCase().includes(needle)) : CHART_PRESETS;
  }, [query]);

  const insertObject = (object: fabric.FabricObject, detail?: { tab?: string; tool?: string }) => {
    if (!canvas) return;
    const maximumWidth = canvasWidth * 0.52;
    const maximumHeight = canvasHeight * 0.48;
    const scale = Math.min(maximumWidth / Math.max(1, object.width || 1), maximumHeight / Math.max(1, object.height || 1), 1);
    object.set({ scaleX: scale, scaleY: scale });
    placeObjectWithoutOverlap(canvas, object, canvasWidth, canvasHeight);
    canvas.add(object);
    canvas.setActiveObject(object);
    object.setCoords();
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: object } as never);
    if (detail?.tab) window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: detail.tab } }));
    if (detail?.tool) window.dispatchEvent(new CustomEvent("ddone:open-tool", { detail: { tool: detail.tool } }));
  };

  const addShape = (kind: NativeShapeKind) => {
    const data = createNativeShapeData(kind, color);
    data.strokeStyle = strokeStyle;
    if (kind === "line") data.arrowEnd = false;
    if (kind === "arrow") data.arrowEnd = true;
    insertObject(buildNativeShape(data), { tab: "shape" });
  };
  const addChart = async (type: SmartChartType) => insertObject(await buildSmartElement(createChartData(type, color)), { tool: "smart-element" });

  return <div class="flex flex-col gap-4" data-testid="native-shapes-panel">
    <div class="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-3">
      <div class="mb-1 flex items-center gap-2"><Sparkles size={15} class="text-violet-600" /><strong class="text-[11px] text-zinc-800">Forme e grafici modificabili</strong></div>
      <p class="m-0 text-[9px] leading-relaxed text-zinc-500">Non sono immagini: geometria, riempimento, tratto, dati e indicatori restano editabili.</p>
    </div>
    <input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Cerca cerchio, freccia, grafico…" class="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
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
    {visibleCharts.length > 0 && <section>
      <div class="mb-2 flex items-center gap-2"><BarChart3 size={14} class="text-violet-600" /><strong class="text-[10px] text-zinc-700">Grafici smart</strong></div>
      <div class="grid grid-cols-2 gap-2">{visibleCharts.map((chart) => <button key={chart.type} onClick={() => void addChart(chart.type)} class="group overflow-hidden rounded-xl border border-zinc-200 bg-white text-left cursor-pointer transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"><div class="grid h-20 place-items-center bg-zinc-50"><div class="h-12 w-20"><ChartPreview type={chart.type} /></div></div><div class="px-2.5 py-2"><strong class="block text-[9px] text-zinc-800">{chart.label}</strong><span class="mt-0.5 block text-[7px] text-zinc-400">{chart.description}</span></div></button>)}</div>
    </section>}
    {groups.length === 0 && visibleCharts.length === 0 && <div class="rounded-xl border border-dashed border-zinc-300 p-5 text-center text-[10px] text-zinc-400">Nessun elemento trovato.</div>}
  </div>;
}
