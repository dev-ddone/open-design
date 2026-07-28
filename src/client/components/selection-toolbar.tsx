import { useMemo, useState } from "preact/hooks";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Blend,
  BringToFront,
  ChevronDown,
  Copy,
  Crop,
  FlipHorizontal2,
  FlipVertical2,
  ImageMinus,
  Layers3,
  Lock,
  Move,
  Palette,
  PanelTopOpen,
  SendToBack,
  SlidersHorizontal,
  Trash2,
  Unlock,
} from "lucide-preact";
import * as fabric from "fabric";
import { useEditor } from "../context";
import type { DDoneFabricObject } from "../canvas-model";
import { extractVectorPalette, replaceVectorColor } from "../canvas/media-effects";
import { isSmartElement } from "../canvas/smart-elements";

const VECTOR_COLORS = ["#111827", "#ffffff", "#7c3aed", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "#0ea5e9"];

function openTool(tool: string): void {
  window.dispatchEvent(new CustomEvent("ddone:open-tool", { detail: { tool } }));
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: typeof Crop;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      class={`inline-flex h-8 items-center gap-1.5 rounded-lg border-0 px-2.5 text-[10px] font-semibold cursor-pointer transition ${
        danger ? "bg-transparent text-red-500 hover:bg-red-50" : "bg-transparent text-zinc-700 hover:bg-zinc-100"
      }`}
    >
      <Icon size={14} /> <span class="hidden xl:inline">{label}</span>
    </button>
  );
}

function NumericField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label class="block text-[8px] font-semibold text-zinc-400">
      {label}
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onInput={(event) => onChange(Number((event.target as HTMLInputElement).value))}
        class="mt-1 h-8 w-full rounded-md border border-zinc-200 px-2 text-[10px] text-zinc-700 outline-none focus:border-violet-400"
      />
    </label>
  );
}

export function SelectionToolbar() {
  const {
    canvas,
    selectedObject,
    readOnly,
    beginCrop,
    duplicateSelected,
    arrangeSelected,
    flipSelected,
    toggleSelectedLock,
    recolorSelectedVector,
    deleteSelected,
    cropState,
    canvasWidth,
    canvasHeight,
  } = useEditor();
  const [positionOpen, setPositionOpen] = useState(false);
  const [precisionOpen, setPrecisionOpen] = useState(false);
  const target = canvas?.getActiveObject() ?? selectedObject;
  const metadata = target as DDoneFabricObject | null;
  const vector = Boolean(metadata?.ddoneIsSvg || metadata?.ddoneMediaKind === "vector");
  const palette = useMemo(() => target && vector ? extractVectorPalette(target) : [], [target, vector]);

  if (!target || readOnly || cropState.active) return null;

  const image = target instanceof fabric.FabricImage;
  const smart = isSmartElement(target);
  const locked = Boolean(target.lockMovementX && target.lockMovementY && target.lockScalingX && target.lockScalingY);

  const notify = () => {
    target.setCoords();
    canvas?.requestRenderAll();
    canvas?.fire("object:modified", { target } as any);
  };

  const updatePosition = (axis: "left" | "top", value: number) => {
    target.set(axis, value);
    notify();
  };

  const updateSize = (axis: "width" | "height", value: number) => {
    const base = axis === "width" ? target.width || 1 : target.height || 1;
    const scale = Math.max(0.01, value / base);
    target.set(axis === "width" ? "scaleX" : "scaleY", scale);
    notify();
  };

  const align = (mode: "left" | "center-x" | "right" | "top" | "center-y" | "bottom") => {
    const width = target.getScaledWidth();
    const height = target.getScaledHeight();
    if (mode === "left") target.set("left", 0);
    if (mode === "center-x") target.set("left", (canvasWidth - width) / 2);
    if (mode === "right") target.set("left", canvasWidth - width);
    if (mode === "top") target.set("top", 0);
    if (mode === "center-y") target.set("top", (canvasHeight - height) / 2);
    if (mode === "bottom") target.set("top", canvasHeight - height);
    notify();
  };

  const replacePaletteColor = (from: string, to: string) => {
    if (replaceVectorColor(target, from, to) === 0) return;
    notify();
  };

  return (
    <div class="relative z-30 flex min-h-11 items-center gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-3 shadow-sm">
      {image && (
        <>
          <ToolbarButton label="Modifica" icon={SlidersHorizontal} onClick={() => openTool("adjust")} />
          <ToolbarButton label="Rimuovi colore" icon={ImageMinus} onClick={() => openTool("remove-background")} />
          <ToolbarButton label="Ritaglia" icon={Crop} onClick={() => beginCrop(target)} />
          <ToolbarButton label="Fusione" icon={Blend} onClick={() => openTool("blend")} />
        </>
      )}

      {smart && <ToolbarButton label="Modifica struttura" icon={PanelTopOpen} onClick={() => openTool("smart-element")} />}

      {vector && (
        <div class="flex items-center gap-1 border-l border-zinc-200 pl-2">
          <Palette size={14} class="text-zinc-400" />
          {palette.length > 1 ? palette.slice(0, 8).map((color, index) => (
            <label key={`${color}-${index}`} title={`Sostituisci ${color}`} class="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-zinc-300" style={{ background: color }}>
              <input type="color" value={color} onInput={(event) => replacePaletteColor(color, (event.target as HTMLInputElement).value)} class="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
          )) : (
            <>
              {VECTOR_COLORS.map((color) => (
                <button key={color} title={`Colore ${color}`} onClick={() => recolorSelectedVector(color)} class="h-6 w-6 rounded-full border border-zinc-300 cursor-pointer transition hover:scale-110" style={{ background: color }} />
              ))}
              <input type="color" title="Colore personalizzato" onInput={(event) => recolorSelectedVector((event.target as HTMLInputElement).value)} class="h-7 w-7 rounded border border-zinc-200 bg-transparent p-0 cursor-pointer" />
            </>
          )}
        </div>
      )}

      <div class="relative border-l border-zinc-200 pl-1">
        <button onClick={() => setPrecisionOpen((value) => !value)} class="inline-flex h-8 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-[10px] font-semibold text-zinc-700 cursor-pointer hover:bg-zinc-100">
          <Move size={14} /> Precisione
        </button>
        {precisionOpen && (
          <>
            <div class="fixed inset-0 z-30" onClick={() => setPrecisionOpen(false)} />
            <div class="absolute left-0 top-full z-40 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl">
              <div class="mb-3 grid grid-cols-2 gap-2">
                <NumericField label="X" value={target.left ?? 0} onChange={(value) => updatePosition("left", value)} />
                <NumericField label="Y" value={target.top ?? 0} onChange={(value) => updatePosition("top", value)} />
                <NumericField label="Larghezza" value={target.getScaledWidth()} onChange={(value) => updateSize("width", value)} />
                <NumericField label="Altezza" value={target.getScaledHeight()} onChange={(value) => updateSize("height", value)} />
                <NumericField label="Rotazione" value={target.angle ?? 0} onChange={(value) => { target.set("angle", value); notify(); }} />
                <NumericField label="Opacità %" value={(target.opacity ?? 1) * 100} onChange={(value) => { target.set("opacity", Math.max(0, Math.min(100, value)) / 100); notify(); }} />
              </div>
              <strong class="mb-2 block text-[9px] text-zinc-500">Allinea al canvas</strong>
              <div class="grid grid-cols-6 gap-1">
                <button title="Sinistra" onClick={() => align("left")} class="grid h-8 place-items-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50"><AlignStartVertical size={14} /></button>
                <button title="Centro orizzontale" onClick={() => align("center-x")} class="grid h-8 place-items-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50"><AlignCenterVertical size={14} /></button>
                <button title="Destra" onClick={() => align("right")} class="grid h-8 place-items-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50"><AlignEndVertical size={14} /></button>
                <button title="Alto" onClick={() => align("top")} class="grid h-8 place-items-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50"><AlignStartHorizontal size={14} /></button>
                <button title="Centro verticale" onClick={() => align("center-y")} class="grid h-8 place-items-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50"><AlignCenterHorizontal size={14} /></button>
                <button title="Basso" onClick={() => align("bottom")} class="grid h-8 place-items-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50"><AlignEndHorizontal size={14} /></button>
              </div>
            </div>
          </>
        )}
      </div>

      <div class="ml-auto flex items-center gap-0.5 border-l border-zinc-200 pl-2">
        <ToolbarButton label="Duplica" icon={Copy} onClick={() => void duplicateSelected()} />
        <ToolbarButton label="Ribalta X" icon={FlipHorizontal2} onClick={() => flipSelected("x")} />
        <ToolbarButton label="Ribalta Y" icon={FlipVertical2} onClick={() => flipSelected("y")} />

        <div class="relative">
          <button onClick={() => setPositionOpen((value) => !value)} class="inline-flex h-8 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-[10px] font-semibold text-zinc-700 cursor-pointer hover:bg-zinc-100">
            <Layers3 size={14} /> Posizione <ChevronDown size={12} />
          </button>
          {positionOpen && (
            <>
              <div class="fixed inset-0 z-30" onClick={() => setPositionOpen(false)} />
              <div class="absolute right-0 top-full z-40 mt-1 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
                <button onClick={() => { arrangeSelected("front"); setPositionOpen(false); }} class="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-xs text-zinc-700 cursor-pointer hover:bg-zinc-100"><BringToFront size={14} /> Porta in primo piano</button>
                <button onClick={() => { arrangeSelected("forward"); setPositionOpen(false); }} class="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-xs text-zinc-700 cursor-pointer hover:bg-zinc-100"><Layers3 size={14} /> Porta avanti</button>
                <button onClick={() => { arrangeSelected("backward"); setPositionOpen(false); }} class="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-xs text-zinc-700 cursor-pointer hover:bg-zinc-100"><Layers3 size={14} /> Porta indietro</button>
                <button onClick={() => { arrangeSelected("back"); setPositionOpen(false); }} class="flex w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-xs text-zinc-700 cursor-pointer hover:bg-zinc-100"><SendToBack size={14} /> Porta sullo sfondo</button>
              </div>
            </>
          )}
        </div>

        <ToolbarButton label={locked ? "Sblocca" : "Blocca"} icon={locked ? Unlock : Lock} onClick={toggleSelectedLock} />
        <ToolbarButton label="Elimina" icon={Trash2} onClick={deleteSelected} danger />
      </div>
    </div>
  );
}
