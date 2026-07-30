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
import translations from "../translations";
import { config } from "../../server/config";

const lang = config.lang;

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
    <label class="block font-semibold text-[8px] text-zinc-400">
      {label}
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        onInput={(event) => onChange(Number((event.target as HTMLInputElement).value))}
        class="mt-1 px-2 border border-zinc-200 focus:border-violet-400 rounded-md outline-none w-full h-8 text-[10px] text-zinc-700"
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
    <div class="z-30 relative flex items-center gap-1 bg-white shadow-sm px-3 border-zinc-200 border-b min-h-11 overflow-x-auto">
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
        <div class="flex items-center gap-1 pl-2 border-zinc-200 border-l">
          <Palette size={14} class="text-zinc-400" />
          {palette.length > 1 ? palette.slice(0, 8).map((color, index) => (
            <label key={`${color}-${index}`} title={`Sostituisci ${color}`} class="relative border border-zinc-300 rounded-full w-7 h-7 overflow-hidden cursor-pointer" style={{ background: color }}>
              <input type="color" value={color} onInput={(event) => replacePaletteColor(color, (event.target as HTMLInputElement).value)} class="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
            </label>
          )) : (
            <>
              {VECTOR_COLORS.map((color) => (
                <button key={color} title={`Colore ${color}`} onClick={() => recolorSelectedVector(color)} class="border border-zinc-300 rounded-full w-6 h-6 hover:scale-110 transition cursor-pointer" style={{ background: color }} />
              ))}
              <input type="color" title={translations[lang].customColor} onInput={(event) => recolorSelectedVector((event.target as HTMLInputElement).value)} class="bg-transparent p-0 border border-zinc-200 rounded w-7 h-7 cursor-pointer" />
            </>
          )}
        </div>
      )}

      <div class="relative pl-1 border-zinc-200 border-l">
        <button onClick={() => setPrecisionOpen((value) => !value)} class="inline-flex items-center gap-1.5 bg-transparent hover:bg-zinc-100 px-2.5 border-0 rounded-lg h-8 font-semibold text-[10px] text-zinc-700 cursor-pointer">
          <Move size={14} /> Precisione
        </button>
        {precisionOpen && (
          <>
            <div class="z-30 fixed inset-0" onClick={() => setPrecisionOpen(false)} />
            <div class="top-full left-0 z-40 absolute bg-white shadow-xl mt-1 p-3 border border-zinc-200 rounded-xl w-72">
              <div class="gap-2 grid grid-cols-2 mb-3">
                <NumericField label="X" value={target.left ?? 0} onChange={(value) => updatePosition("left", value)} />
                <NumericField label="Y" value={target.top ?? 0} onChange={(value) => updatePosition("top", value)} />
                <NumericField label="Larghezza" value={target.getScaledWidth()} onChange={(value) => updateSize("width", value)} />
                <NumericField label="Altezza" value={target.getScaledHeight()} onChange={(value) => updateSize("height", value)} />
                <NumericField label="Rotazione" value={target.angle ?? 0} onChange={(value) => { target.set("angle", value); notify(); }} />
                <NumericField label="Opacità %" value={(target.opacity ?? 1) * 100} onChange={(value) => { target.set("opacity", Math.max(0, Math.min(100, value)) / 100); notify(); }} />
              </div>
              <strong class="block mb-2 text-[9px] text-zinc-500">Allinea al canvas</strong>
              <div class="gap-1 grid grid-cols-6">
                <button title="Sinistra" onClick={() => align("left")} class="place-items-center grid bg-white hover:bg-zinc-50 border border-zinc-200 rounded-md h-8"><AlignStartVertical size={14} /></button>
                <button title="Centro orizzontale" onClick={() => align("center-x")} class="place-items-center grid bg-white hover:bg-zinc-50 border border-zinc-200 rounded-md h-8"><AlignCenterVertical size={14} /></button>
                <button title="Destra" onClick={() => align("right")} class="place-items-center grid bg-white hover:bg-zinc-50 border border-zinc-200 rounded-md h-8"><AlignEndVertical size={14} /></button>
                <button title="Alto" onClick={() => align("top")} class="place-items-center grid bg-white hover:bg-zinc-50 border border-zinc-200 rounded-md h-8"><AlignStartHorizontal size={14} /></button>
                <button title="Centro verticale" onClick={() => align("center-y")} class="place-items-center grid bg-white hover:bg-zinc-50 border border-zinc-200 rounded-md h-8"><AlignCenterHorizontal size={14} /></button>
                <button title="Basso" onClick={() => align("bottom")} class="place-items-center grid bg-white hover:bg-zinc-50 border border-zinc-200 rounded-md h-8"><AlignEndHorizontal size={14} /></button>
              </div>
            </div>
          </>
        )}
      </div>

      <div class="flex items-center gap-0.5 ml-auto pl-2 border-zinc-200 border-l">
        <ToolbarButton label="Duplica" icon={Copy} onClick={() => void duplicateSelected()} />
        <ToolbarButton label="Ribalta X" icon={FlipHorizontal2} onClick={() => flipSelected("x")} />
        <ToolbarButton label="Ribalta Y" icon={FlipVertical2} onClick={() => flipSelected("y")} />

        <div class="relative">
          <button onClick={() => setPositionOpen((value) => !value)} class="inline-flex items-center gap-1.5 bg-transparent hover:bg-zinc-100 px-2.5 border-0 rounded-lg h-8 font-semibold text-[10px] text-zinc-700 cursor-pointer">
            <Layers3 size={14} /> Posizione <ChevronDown size={12} />
          </button>
          {positionOpen && (
            <>
              <div class="z-30 fixed inset-0" onClick={() => setPositionOpen(false)} />
              <div class="top-full right-0 z-40 absolute bg-white shadow-xl mt-1 p-1.5 border border-zinc-200 rounded-xl w-48">
                <button onClick={() => { arrangeSelected("front"); setPositionOpen(false); }} class="flex items-center gap-2 bg-transparent hover:bg-zinc-100 px-2.5 py-2 border-0 rounded-lg w-full text-zinc-700 text-xs text-left cursor-pointer"><BringToFront size={14} /> Porta in primo piano</button>
                <button onClick={() => { arrangeSelected("forward"); setPositionOpen(false); }} class="flex items-center gap-2 bg-transparent hover:bg-zinc-100 px-2.5 py-2 border-0 rounded-lg w-full text-zinc-700 text-xs text-left cursor-pointer"><Layers3 size={14} /> Porta avanti</button>
                <button onClick={() => { arrangeSelected("backward"); setPositionOpen(false); }} class="flex items-center gap-2 bg-transparent hover:bg-zinc-100 px-2.5 py-2 border-0 rounded-lg w-full text-zinc-700 text-xs text-left cursor-pointer"><Layers3 size={14} /> Porta indietro</button>
                <button onClick={() => { arrangeSelected("back"); setPositionOpen(false); }} class="flex items-center gap-2 bg-transparent hover:bg-zinc-100 px-2.5 py-2 border-0 rounded-lg w-full text-zinc-700 text-xs text-left cursor-pointer"><SendToBack size={14} /> Porta sullo sfondo</button>
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
