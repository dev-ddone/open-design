import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import {
  ArrowLeft,
  Blend,
  CircleDot,
  Droplets,
  Frame,
  ImageMinus,
  Layers3,
  QrCode,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  WandSparkles,
  Waves,
} from "lucide-preact";
import * as fabric from "fabric";
import QRCode from "qrcode";
import { ensureObjectId, markSvgObject, type DDoneFabricObject } from "../canvas-model";
import {
  activeImages,
  blendImages,
  dissolveImage,
  type BlendMode,
  type DissolveDirection,
  type DissolveMode,
} from "../canvas/media-effects";
import { useEditor } from "../context";
import { SmartElementPanel } from "./smart-element-panel";
import { isSmartElement } from "../canvas/smart-elements";

export type ToolId =
  | "home"
  | "blend"
  | "dissolve"
  | "adjust"
  | "remove-background"
  | "mask"
  | "opacity"
  | "shadow"
  | "gradient"
  | "pattern"
  | "blob"
  | "wave"
  | "qr"
  | "smart-element";

interface ToolsPanelProps {
  requestedTool?: string | null;
}

const TOOL_CARDS: Array<{
  id: ToolId;
  title: string;
  description: string;
  icon: typeof Blend;
  accent: string;
  requiresImage?: boolean;
}> = [
  { id: "blend", title: "Image Blend", description: "Fondi due immagini con modalità professionali.", icon: Blend, accent: "from-violet-500 to-fuchsia-500", requiresImage: true },
  { id: "dissolve", title: "Dissolvenza", description: "Lineare, radiale o a pannello.", icon: Droplets, accent: "from-sky-500 to-cyan-400", requiresImage: true },
  { id: "adjust", title: "Regola immagine", description: "Luce, contrasto, colore, blur e filtri.", icon: SlidersHorizontal, accent: "from-amber-500 to-orange-500", requiresImage: true },
  { id: "remove-background", title: "Trasparenza", description: "Rimuovi un colore e crea PNG trasparenti.", icon: ImageMinus, accent: "from-emerald-500 to-teal-400", requiresImage: true },
  { id: "mask", title: "Maschere", description: "Cerchio, arrotondata o immagine libera.", icon: Frame, accent: "from-pink-500 to-rose-400", requiresImage: true },
  { id: "opacity", title: "Opacità", description: "Controlla la trasparenza di ogni oggetto.", icon: CircleDot, accent: "from-zinc-600 to-zinc-400" },
  { id: "shadow", title: "Ombre", description: "Genera ombre morbide e direzionali.", icon: Layers3, accent: "from-indigo-500 to-violet-500" },
  { id: "gradient", title: "Gradienti", description: "Sfondi e forme con gradienti personalizzati.", icon: SunMedium, accent: "from-fuchsia-500 to-amber-400" },
  { id: "pattern", title: "Pattern", description: "Pois, righe, griglie e scacchiere.", icon: Sparkles, accent: "from-cyan-500 to-violet-500" },
  { id: "blob", title: "Blob", description: "Genera forme organiche modificabili.", icon: WandSparkles, accent: "from-lime-500 to-emerald-500" },
  { id: "wave", title: "Onde", description: "Divisori e sfondi vettoriali ondulati.", icon: Waves, accent: "from-blue-500 to-indigo-500" },
  { id: "qr", title: "QR Code", description: "QR vettoriali con colori personalizzati.", icon: QrCode, accent: "from-zinc-900 to-zinc-600" },
  { id: "smart-element", title: "Elemento intelligente", description: "Modifica celle, griglie e cornici mantenendo la struttura.", icon: Frame, accent: "from-violet-600 to-indigo-500" },
];

function Slider({
  label,
  value,
  min,
  max,
  step,
  onInput,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onInput: (value: number) => void;
}) {
  return (
    <label class="block">
      <div class="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span>{label}</span>
        <span class="font-mono text-zinc-400">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(event) => onInput(Number((event.target as HTMLInputElement).value))}
        class="w-full accent-violet-600"
      />
    </label>
  );
}

function ToolHeader({ title, description, onBack }: { title: string; description: string; onBack: () => void }) {
  return (
    <div class="mb-4">
      <button onClick={onBack} class="mb-3 inline-flex items-center gap-1 rounded-lg border-0 bg-transparent px-1 py-1 text-[10px] font-semibold text-zinc-500 cursor-pointer hover:text-zinc-900">
        <ArrowLeft size={14} /> Strumenti
      </button>
      <h3 class="m-0 text-base font-semibold text-zinc-900">{title}</h3>
      <p class="mt-1 text-[10px] leading-relaxed text-zinc-500">{description}</p>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled = false }: { children: ComponentChildren; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      class="flex h-10 w-full items-center justify-center gap-2 rounded-lg border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-xs font-semibold text-white cursor-pointer hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function replaceObject(canvas: fabric.Canvas, source: fabric.FabricObject, replacement: fabric.FabricObject): void {
  const index = canvas.getObjects().indexOf(source);
  canvas.remove(source);
  canvas.add(replacement);
  if (index >= 0) (canvas as any).moveObjectTo?.(replacement, index);
  canvas.setActiveObject(replacement);
  canvas.requestRenderAll();
  canvas.fire("object:modified", { target: replacement } as any);
}

async function svgGroup(svg: string): Promise<fabric.FabricObject> {
  const loaded = await fabric.loadSVGFromString(svg);
  const objects = loaded.objects.filter(Boolean) as fabric.FabricObject[];
  const group = fabric.util.groupSVGElements(objects, loaded.options);
  markSvgObject(group);
  return group;
}

export function ToolsPanel({ requestedTool }: ToolsPanelProps) {
  const { canvas, selectedObject, canvasWidth, canvasHeight, setBackground } = useEditor();
  const [activeTool, setActiveTool] = useState<ToolId>("home");
  const [busy, setBusy] = useState(false);
  const target = canvas?.getActiveObject() ?? selectedObject;
  const selectedImage = target instanceof fabric.FabricImage ? target : null;
  const selectedImages = activeImages(canvas);
  const smartSelected = isSmartElement(target);

  useEffect(() => {
    if (requestedTool && TOOL_CARDS.some((tool) => tool.id === requestedTool)) setActiveTool(requestedTool as ToolId);
  }, [requestedTool]);

  useEffect(() => {
    const handler = (event: Event) => {
      const tool = (event as CustomEvent<{ tool?: string }>).detail?.tool;
      if (tool && TOOL_CARDS.some((entry) => entry.id === tool)) setActiveTool(tool as ToolId);
    };
    window.addEventListener("ddone:open-tool", handler);
    return () => window.removeEventListener("ddone:open-tool", handler);
  }, []);

  const notify = useCallback((object: fabric.FabricObject) => {
    if (!canvas) return;
    object.setCoords();
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target: object } as any);
  }, [canvas]);

  if (activeTool === "home") {
    return (
      <div>
        <div class="mb-4 rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-3">
          <div class="mb-1 flex items-center gap-2">
            <WandSparkles size={15} class="text-violet-600" />
            <strong class="text-[11px] text-zinc-800">Modifica e genera</strong>
          </div>
          <p class="m-0 text-[10px] leading-relaxed text-zinc-500">
            Gli strumenti operano sugli oggetti Fabric e partecipano a salvataggio, undo, versioni e collaborazione.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-2">
          {TOOL_CARDS.map((tool) => {
            const unavailable = tool.id === "smart-element" ? !smartSelected : tool.requiresImage && !selectedImage && !(tool.id === "blend" && selectedImages.length >= 2);
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                class="group overflow-hidden rounded-xl border border-zinc-200 bg-white text-left cursor-pointer transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
              >
                <div class={`grid h-16 place-items-center bg-gradient-to-br ${tool.accent}`}>
                  <tool.icon size={28} class="text-white drop-shadow" />
                </div>
                <div class="p-2.5">
                  <strong class="block text-[10px] text-zinc-800">{tool.title}</strong>
                  <span class="mt-0.5 block text-[8px] leading-relaxed text-zinc-400">{tool.description}</span>
                  {unavailable && <span class="mt-1 block text-[8px] font-medium text-amber-600">Seleziona un’immagine</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const onBack = () => setActiveTool("home");
  if (activeTool === "blend") return <BlendTool canvas={canvas} images={selectedImages} busy={busy} setBusy={setBusy} onBack={onBack} />;
  if (activeTool === "dissolve") return <DissolveTool canvas={canvas} image={selectedImage} busy={busy} setBusy={setBusy} onBack={onBack} />;
  if (activeTool === "adjust") return <AdjustTool image={selectedImage} notify={notify} onBack={onBack} />;
  if (activeTool === "remove-background") return <RemoveBackgroundTool image={selectedImage} notify={notify} onBack={onBack} />;
  if (activeTool === "mask") return <MaskTool image={selectedImage} notify={notify} onBack={onBack} />;
  if (activeTool === "opacity") return <OpacityTool target={target} notify={notify} onBack={onBack} />;
  if (activeTool === "shadow") return <ShadowTool target={target} notify={notify} onBack={onBack} />;
  if (activeTool === "gradient") return <GradientTool setBackground={setBackground} onBack={onBack} />;
  if (activeTool === "pattern") return <PatternTool canvas={canvas} canvasWidth={canvasWidth} canvasHeight={canvasHeight} onBack={onBack} />;
  if (activeTool === "blob") return <BlobTool canvas={canvas} canvasWidth={canvasWidth} canvasHeight={canvasHeight} onBack={onBack} />;
  if (activeTool === "wave") return <WaveTool canvas={canvas} canvasWidth={canvasWidth} canvasHeight={canvasHeight} onBack={onBack} />;
  if (activeTool === "smart-element") return <SmartElementPanel />;
  return <QrTool canvas={canvas} canvasWidth={canvasWidth} canvasHeight={canvasHeight} onBack={onBack} />;
}

function BlendTool({ canvas, images, busy, setBusy, onBack }: {
  canvas: fabric.Canvas | null;
  images: fabric.FabricImage[];
  busy: boolean;
  setBusy: (value: boolean) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<BlendMode>("multiply");
  const [opacity, setOpacity] = useState(0.72);
  const modes: Array<{ value: BlendMode; label: string }> = [
    { value: "source-over", label: "Normale" },
    { value: "multiply", label: "Moltiplica" },
    { value: "screen", label: "Scolora" },
    { value: "overlay", label: "Sovrapponi" },
    { value: "soft-light", label: "Luce soffusa" },
    { value: "difference", label: "Differenza" },
  ];
  const run = async () => {
    if (!canvas || images.length < 2) return;
    setBusy(true);
    try {
      const result = await blendImages(images[0], images[1], mode, opacity);
      canvas.add(result);
      canvas.setActiveObject(result);
      canvas.requestRenderAll();
      canvas.fire("object:modified", { target: result } as any);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <ToolHeader title="Image Blend" description="Seleziona due immagini con Shift e scegli come fondere i pixel." onBack={onBack} />
      <div class="mb-4 grid grid-cols-2 gap-2">
        {[0, 1].map((index) => (
          <div key={index} class="grid aspect-square place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-[9px] text-zinc-400">
            {images[index] ? <span class="font-semibold text-violet-600">Immagine {index + 1} pronta</span> : `Seleziona immagine ${index + 1}`}
          </div>
        ))}
      </div>
      <label class="mb-4 block text-[10px] font-semibold text-zinc-600">
        Modalità di fusione
        <select value={mode} onChange={(event) => setMode((event.target as HTMLSelectElement).value as BlendMode)} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-violet-400">
          {modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <div class="mb-4"><Slider label="Intensità seconda immagine" value={opacity} min={0} max={1} step={0.01} onInput={setOpacity} /></div>
      <PrimaryButton disabled={busy || images.length < 2} onClick={() => void run()}><Blend size={15} /> {busy ? "Fusione…" : "Crea fusione"}</PrimaryButton>
    </div>
  );
}

function DissolveTool({ canvas, image, busy, setBusy, onBack }: {
  canvas: fabric.Canvas | null;
  image: fabric.FabricImage | null;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<DissolveMode>("linear");
  const [direction, setDirection] = useState<DissolveDirection>("right");
  const [softness, setSoftness] = useState(0.35);
  const run = async () => {
    if (!canvas || !image) return;
    setBusy(true);
    try {
      const result = await dissolveImage(image, mode, direction, softness);
      const source = image as DDoneFabricObject;
      Object.assign(result as DDoneFabricObject, {
        ddoneProvider: source.ddoneProvider,
        ddoneSourceUrl: source.ddoneSourceUrl,
        ddoneLicense: source.ddoneLicense,
        ddoneAuthor: source.ddoneAuthor,
      });
      replaceObject(canvas, image, result);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <ToolHeader title="Strumenti di dissolvenza" description="Sfuma i bordi dell’immagine verso una vera trasparenza alpha." onBack={onBack} />
      <div class="mb-4 grid grid-cols-3 gap-2">
        {(["linear", "radial", "panel"] as DissolveMode[]).map((value) => (
          <button key={value} onClick={() => setMode(value)} class={`aspect-square rounded-xl border text-[10px] font-semibold cursor-pointer ${mode === value ? "border-violet-500 bg-violet-50 text-violet-700" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
            <Droplets size={22} class="mx-auto mb-2" />{value === "linear" ? "Lineare" : value === "radial" ? "Radiale" : "Pannello"}
          </button>
        ))}
      </div>
      {mode === "linear" && (
        <label class="mb-4 block text-[10px] font-semibold text-zinc-600">
          Direzione
          <select value={direction} onChange={(event) => setDirection((event.target as HTMLSelectElement).value as DissolveDirection)} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs">
            <option value="right">Verso destra</option><option value="left">Verso sinistra</option><option value="bottom">Verso il basso</option><option value="top">Verso l’alto</option>
          </select>
        </label>
      )}
      <div class="mb-4"><Slider label="Morbidezza" value={softness} min={0.05} max={0.95} step={0.01} onInput={setSoftness} /></div>
      <PrimaryButton disabled={busy || !image} onClick={() => void run()}><Droplets size={15} /> {busy ? "Elaborazione…" : "Applica dissolvenza"}</PrimaryButton>
      {!image && <p class="mt-3 text-center text-[9px] text-amber-600">Seleziona prima un’immagine nel canvas.</p>}
    </div>
  );
}

function AdjustTool({ image, notify, onBack }: { image: fabric.FabricImage | null; notify: (object: fabric.FabricObject) => void; onBack: () => void }) {
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [blur, setBlur] = useState(0);
  const [grayscale, setGrayscale] = useState(false);
  const [invert, setInvert] = useState(false);
  const apply = () => {
    if (!image) return;
    const library = fabric.filters as any;
    const filters: any[] = [];
    if (brightness) filters.push(new library.Brightness({ brightness }));
    if (contrast) filters.push(new library.Contrast({ contrast }));
    if (saturation) filters.push(new library.Saturation({ saturation }));
    if (blur) filters.push(new library.Blur({ blur }));
    if (grayscale) filters.push(new library.Grayscale({ mode: "luminosity" }));
    if (invert) filters.push(new library.Invert());
    image.filters = filters;
    image.applyFilters();
    image.dirty = true;
    notify(image);
  };
  const reset = () => {
    setBrightness(0); setContrast(0); setSaturation(0); setBlur(0); setGrayscale(false); setInvert(false);
    if (image) { image.filters = []; image.applyFilters(); notify(image); }
  };
  return (
    <div>
      <ToolHeader title="Regola immagine" description="Controlli non distruttivi Fabric per luce, colore e nitidezza." onBack={onBack} />
      <div class="flex flex-col gap-4">
        <Slider label="Luminosità" value={brightness} min={-1} max={1} step={0.01} onInput={setBrightness} />
        <Slider label="Contrasto" value={contrast} min={-1} max={1} step={0.01} onInput={setContrast} />
        <Slider label="Saturazione" value={saturation} min={-1} max={1} step={0.01} onInput={setSaturation} />
        <Slider label="Sfocatura" value={blur} min={0} max={1} step={0.01} onInput={setBlur} />
        <div class="grid grid-cols-2 gap-2">
          <button onClick={() => setGrayscale(!grayscale)} class={`h-9 rounded-lg border text-[10px] cursor-pointer ${grayscale ? "border-violet-500 bg-violet-50 text-violet-700" : "border-zinc-200 bg-white text-zinc-600"}`}>Bianco e nero</button>
          <button onClick={() => setInvert(!invert)} class={`h-9 rounded-lg border text-[10px] cursor-pointer ${invert ? "border-violet-500 bg-violet-50 text-violet-700" : "border-zinc-200 bg-white text-zinc-600"}`}>Inverti</button>
        </div>
        <PrimaryButton disabled={!image} onClick={apply}><SlidersHorizontal size={15} /> Applica regolazioni</PrimaryButton>
        <button onClick={reset} class="flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white text-[10px] text-zinc-600 cursor-pointer"><RotateCcw size={13} /> Reimposta</button>
      </div>
    </div>
  );
}

function RemoveBackgroundTool({ image, notify, onBack }: { image: fabric.FabricImage | null; notify: (object: fabric.FabricObject) => void; onBack: () => void }) {
  const [color, setColor] = useState("#ffffff");
  const [distance, setDistance] = useState(0.18);
  const apply = () => {
    if (!image) return;
    const library = fabric.filters as any;
    const retained = (image.filters ?? []).filter((filter: any) => filter?.type !== "RemoveColor");
    retained.push(new library.RemoveColor({ color, distance }));
    image.filters = retained;
    image.applyFilters();
    image.dirty = true;
    (image as DDoneFabricObject).ddoneTransparent = true;
    notify(image);
  };
  return (
    <div>
      <ToolHeader title="Rimuovi sfondo per colore" description="Rende trasparente un colore. Ideale per loghi e fondali uniformi." onBack={onBack} />
      <label class="mb-4 block text-[10px] font-semibold text-zinc-600">Colore da rimuovere<input type="color" value={color} onInput={(event) => setColor((event.target as HTMLInputElement).value)} class="mt-2 h-12 w-full rounded-lg border border-zinc-200 bg-transparent p-1 cursor-pointer" /></label>
      <div class="mb-4"><Slider label="Tolleranza" value={distance} min={0.01} max={0.8} step={0.01} onInput={setDistance} /></div>
      <PrimaryButton disabled={!image} onClick={apply}><ImageMinus size={15} /> Rendi trasparente</PrimaryButton>
    </div>
  );
}

function MaskTool({ image, notify, onBack }: { image: fabric.FabricImage | null; notify: (object: fabric.FabricObject) => void; onBack: () => void }) {
  const apply = (type: "none" | "circle" | "rounded") => {
    if (!image) return;
    let clipPath: fabric.FabricObject | undefined;
    if (type === "circle") clipPath = new fabric.Circle({ radius: Math.min(image.width || 1, image.height || 1) / 2, originX: "center", originY: "center" });
    if (type === "rounded") clipPath = new fabric.Rect({ width: image.width || 1, height: image.height || 1, rx: Math.min(image.width || 1, image.height || 1) * 0.12, ry: Math.min(image.width || 1, image.height || 1) * 0.12, originX: "center", originY: "center" });
    image.set({ clipPath });
    notify(image);
  };
  return (
    <div>
      <ToolHeader title="Maschere immagine" description="Ritaglia visivamente senza modificare il file originale." onBack={onBack} />
      <div class="grid grid-cols-3 gap-2">
        {(["none", "circle", "rounded"] as const).map((type) => (
          <button key={type} disabled={!image} onClick={() => apply(type)} class="aspect-square rounded-xl border border-zinc-200 bg-zinc-50 text-[9px] font-semibold text-zinc-600 cursor-pointer hover:border-violet-400 disabled:opacity-40">
            <span class={`mx-auto mb-2 block h-10 w-10 border-2 border-violet-500 ${type === "circle" ? "rounded-full" : type === "rounded" ? "rounded-xl" : "rounded-none"}`} />
            {type === "none" ? "Originale" : type === "circle" ? "Cerchio" : "Arrotondata"}
          </button>
        ))}
      </div>
    </div>
  );
}

function OpacityTool({ target, notify, onBack }: { target: fabric.FabricObject | null; notify: (object: fabric.FabricObject) => void; onBack: () => void }) {
  const [value, setValue] = useState(target?.opacity ?? 1);
  const change = (next: number) => { setValue(next); if (target) { target.set({ opacity: next }); notify(target); } };
  return <div><ToolHeader title="Opacità" description="Regola la trasparenza dell’oggetto selezionato." onBack={onBack} /><Slider label="Opacità" value={value} min={0} max={1} step={0.01} onInput={change} /></div>;
}

function ShadowTool({ target, notify, onBack }: { target: fabric.FabricObject | null; notify: (object: fabric.FabricObject) => void; onBack: () => void }) {
  const [color, setColor] = useState("#000000");
  const [blur, setBlur] = useState(20);
  const [x, setX] = useState(8);
  const [y, setY] = useState(10);
  const [opacity, setOpacity] = useState(0.3);
  const apply = () => {
    if (!target) return;
    const number = Number.parseInt(color.replace("#", ""), 16);
    const rgba = `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${opacity})`;
    target.set({ shadow: new fabric.Shadow({ color: rgba, blur, offsetX: x, offsetY: y }) });
    notify(target);
  };
  return (
    <div>
      <ToolHeader title="Generatore ombre" description="Crea profondità con ombre completamente regolabili." onBack={onBack} />
      <input type="color" value={color} onInput={(event) => setColor((event.target as HTMLInputElement).value)} class="mb-4 h-10 w-full rounded-lg border border-zinc-200" />
      <div class="flex flex-col gap-4">
        <Slider label="Opacità" value={opacity} min={0} max={1} step={0.01} onInput={setOpacity} />
        <Slider label="Sfocatura" value={blur} min={0} max={80} step={1} onInput={setBlur} />
        <Slider label="Spostamento X" value={x} min={-60} max={60} step={1} onInput={setX} />
        <Slider label="Spostamento Y" value={y} min={-60} max={60} step={1} onInput={setY} />
        <PrimaryButton disabled={!target} onClick={apply}><Layers3 size={15} /> Applica ombra</PrimaryButton>
      </div>
    </div>
  );
}

function GradientTool({ setBackground, onBack }: { setBackground: (type: "color" | "gradient" | "image", value: string) => void; onBack: () => void }) {
  const [a, setA] = useState("#6d5dfc");
  const [b, setB] = useState("#f15bb5");
  const [angle, setAngle] = useState(135);
  const css = `linear-gradient(${angle}deg, ${a}, ${b})`;
  return (
    <div>
      <ToolHeader title="Generatore gradienti" description="Crea sfondi con due colori e direzione libera." onBack={onBack} />
      <div class="mb-4 aspect-video rounded-xl border border-zinc-200" style={{ background: css }} />
      <div class="mb-4 grid grid-cols-2 gap-2">
        <input type="color" value={a} onInput={(event) => setA((event.target as HTMLInputElement).value)} class="h-10 w-full rounded-lg border border-zinc-200" />
        <input type="color" value={b} onInput={(event) => setB((event.target as HTMLInputElement).value)} class="h-10 w-full rounded-lg border border-zinc-200" />
      </div>
      <div class="mb-4"><Slider label="Angolo" value={angle} min={0} max={360} step={1} onInput={setAngle} /></div>
      <PrimaryButton onClick={() => setBackground("gradient", css)}><SunMedium size={15} /> Usa come sfondo</PrimaryButton>
    </div>
  );
}

function PatternTool({ canvas, canvasWidth, canvasHeight, onBack }: { canvas: fabric.Canvas | null; canvasWidth: number; canvasHeight: number; onBack: () => void }) {
  const [type, setType] = useState("dots");
  const [fg, setFg] = useState("#6d5dfc");
  const [bg, setBg] = useState("#ffffff");
  const [size, setSize] = useState(36);
  const create = async () => {
    if (!canvas) return;
    const body = type === "dots"
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${Math.max(2, size * 0.1)}" fill="${fg}"/>`
      : type === "grid"
        ? `<path d="M0 0H${size}V${size}" fill="none" stroke="${fg}" stroke-width="2"/>`
        : `<path d="M-${size / 2} ${size / 2}L${size / 2}-${size / 2}M0 ${size}L${size} 0" stroke="${fg}" stroke-width="5"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}"><defs><pattern id="p" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><rect width="${size}" height="${size}" fill="${bg}"/>${body}</pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`;
    const group = await svgGroup(svg);
    group.set({ left: 0, top: 0 });
    ensureObjectId(group);
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
  };
  return (
    <div>
      <ToolHeader title="Generatore pattern" description="Pattern vettoriali per sfondi e texture." onBack={onBack} />
      <div class="mb-4 grid grid-cols-3 gap-2">{["dots", "stripes", "grid"].map((value) => <button key={value} onClick={() => setType(value)} class={`h-16 rounded-xl border text-[9px] font-semibold cursor-pointer ${type === value ? "border-violet-500 bg-violet-50 text-violet-700" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>{value}</button>)}</div>
      <div class="mb-4 grid grid-cols-2 gap-2"><input type="color" value={fg} onInput={(event) => setFg((event.target as HTMLInputElement).value)} class="h-10 rounded-lg border" /><input type="color" value={bg} onInput={(event) => setBg((event.target as HTMLInputElement).value)} class="h-10 rounded-lg border" /></div>
      <div class="mb-4"><Slider label="Dimensione" value={size} min={10} max={120} step={1} onInput={setSize} /></div>
      <PrimaryButton onClick={() => void create()}><Sparkles size={15} /> Inserisci pattern</PrimaryButton>
    </div>
  );
}

function BlobTool({ canvas, canvasWidth, canvasHeight, onBack }: { canvas: fabric.Canvas | null; canvasWidth: number; canvasHeight: number; onBack: () => void }) {
  const [color, setColor] = useState("#6d5dfc");
  const create = () => {
    if (!canvas) return;
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = index / 10 * Math.PI * 2;
      const radius = 90 + Math.random() * 45;
      return [150 + Math.cos(angle) * radius, 150 + Math.sin(angle) * radius] as const;
    });
    const path = `${points.map((point, index) => `${index ? "L" : "M"}${point[0]} ${point[1]}`).join(" ")} Z`;
    const object = new fabric.Path(path, { fill: color, left: canvasWidth / 2 - 150, top: canvasHeight / 2 - 150 });
    markSvgObject(object);
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
  };
  return <div><ToolHeader title="Generatore blob" description="Forme organiche casuali, vettoriali e modificabili." onBack={onBack} /><input type="color" value={color} onInput={(event) => setColor((event.target as HTMLInputElement).value)} class="mb-4 h-12 w-full rounded-lg border" /><PrimaryButton onClick={create}><WandSparkles size={15} /> Genera blob</PrimaryButton></div>;
}

function WaveTool({ canvas, canvasWidth, canvasHeight, onBack }: { canvas: fabric.Canvas | null; canvasWidth: number; canvasHeight: number; onBack: () => void }) {
  const [color, setColor] = useState("#6d5dfc");
  const [amplitude, setAmplitude] = useState(70);
  const create = () => {
    if (!canvas) return;
    const width = canvasWidth * 0.7;
    const y = canvasHeight / 2;
    const path = new fabric.Path(`M0 ${amplitude} C${width * 0.25} 0 ${width * 0.25} ${amplitude * 2} ${width * 0.5} ${amplitude} S${width * 0.75} 0 ${width} ${amplitude}`, {
      left: canvasWidth * 0.15,
      top: y - amplitude,
      fill: "",
      stroke: color,
      strokeWidth: 12,
      strokeLineCap: "round",
    });
    markSvgObject(path);
    canvas.add(path);
    canvas.setActiveObject(path);
    canvas.requestRenderAll();
  };
  return <div><ToolHeader title="Generatore onde" description="Crea separatori fluidi per menu, post e presentazioni." onBack={onBack} /><input type="color" value={color} onInput={(event) => setColor((event.target as HTMLInputElement).value)} class="mb-4 h-12 w-full rounded-lg border" /><div class="mb-4"><Slider label="Ampiezza" value={amplitude} min={20} max={180} step={1} onInput={setAmplitude} /></div><PrimaryButton onClick={create}><Waves size={15} /> Inserisci onda</PrimaryButton></div>;
}

function QrTool({ canvas, canvasWidth, canvasHeight, onBack }: { canvas: fabric.Canvas | null; canvasWidth: number; canvasHeight: number; onBack: () => void }) {
  const [text, setText] = useState("https://ddone.it");
  const [dark, setDark] = useState("#171717");
  const [light, setLight] = useState("#ffffff");
  const create = async () => {
    if (!canvas || !text.trim()) return;
    const svg = await QRCode.toString(text.trim(), { type: "svg", margin: 1, color: { dark, light } });
    const object = await svgGroup(svg);
    const scale = Math.min((canvasWidth * 0.28) / (object.width || 1), (canvasHeight * 0.28) / (object.height || 1));
    object.set({ left: canvasWidth / 2 - (object.width || 0) * scale / 2, top: canvasHeight / 2 - (object.height || 0) * scale / 2, scaleX: scale, scaleY: scale });
    ensureObjectId(object);
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
  };
  return (
    <div>
      <ToolHeader title="QR Code vettoriale" description="Genera un QR nitido e recolorabile per menu e volantini." onBack={onBack} />
      <textarea value={text} onInput={(event) => setText((event.target as HTMLTextAreaElement).value)} class="mb-4 min-h-24 w-full resize-y rounded-lg border border-zinc-200 p-2 text-xs outline-none focus:border-violet-400" />
      <div class="mb-4 grid grid-cols-2 gap-2"><label class="text-[9px] text-zinc-500">Primo piano<input type="color" value={dark} onInput={(event) => setDark((event.target as HTMLInputElement).value)} class="mt-1 h-10 w-full rounded-lg border" /></label><label class="text-[9px] text-zinc-500">Sfondo<input type="color" value={light} onInput={(event) => setLight((event.target as HTMLInputElement).value)} class="mt-1 h-10 w-full rounded-lg border" /></label></div>
      <PrimaryButton onClick={() => void create()}><QrCode size={15} /> Inserisci QR</PrimaryButton>
    </div>
  );
}
