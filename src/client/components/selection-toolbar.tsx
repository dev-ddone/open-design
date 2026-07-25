import { useState } from "preact/hooks";
import {
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
  Palette,
  SendToBack,
  SlidersHorizontal,
  Trash2,
  Unlock,
} from "lucide-preact";
import * as fabric from "fabric";
import { useEditor } from "../context";
import type { DDoneFabricObject } from "../canvas-model";

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
  } = useEditor();
  const [positionOpen, setPositionOpen] = useState(false);
  const target = canvas?.getActiveObject() ?? selectedObject;
  if (!target || readOnly || cropState.active) return null;

  const image = target instanceof fabric.FabricImage;
  const metadata = target as DDoneFabricObject;
  const vector = Boolean(metadata.ddoneIsSvg || metadata.ddoneMediaKind === "vector");
  const locked = Boolean(target.lockMovementX && target.lockMovementY && target.lockScalingX && target.lockScalingY);

  return (
    <div class="relative z-30 flex min-h-11 items-center gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-3 shadow-sm">
      {image && (
        <>
          <ToolbarButton label="Modifica" icon={SlidersHorizontal} onClick={() => openTool("adjust")} />
          <ToolbarButton label="Rimuovi sfondo" icon={ImageMinus} onClick={() => openTool("remove-background")} />
          <ToolbarButton label="Ritaglia" icon={Crop} onClick={() => beginCrop(target)} />
          <ToolbarButton label="Fusione" icon={Blend} onClick={() => openTool("blend")} />
        </>
      )}

      {vector && (
        <div class="flex items-center gap-1 border-l border-zinc-200 pl-2">
          <Palette size={14} class="text-zinc-400" />
          {VECTOR_COLORS.map((color) => (
            <button
              key={color}
              title={`Colore ${color}`}
              onClick={() => recolorSelectedVector(color)}
              class="h-6 w-6 rounded-full border border-zinc-300 cursor-pointer transition hover:scale-110"
              style={{ background: color }}
            />
          ))}
          <input
            type="color"
            title="Colore personalizzato"
            onInput={(event) => recolorSelectedVector((event.target as HTMLInputElement).value)}
            class="h-7 w-7 rounded border border-zinc-200 bg-transparent p-0 cursor-pointer"
          />
        </div>
      )}

      <div class="ml-auto flex items-center gap-0.5 border-l border-zinc-200 pl-2">
        <ToolbarButton label="Duplica" icon={Copy} onClick={() => void duplicateSelected()} />
        <ToolbarButton label="Ribalta X" icon={FlipHorizontal2} onClick={() => flipSelected("x")} />
        <ToolbarButton label="Ribalta Y" icon={FlipVertical2} onClick={() => flipSelected("y")} />

        <div class="relative">
          <button
            onClick={() => setPositionOpen((value) => !value)}
            class="inline-flex h-8 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-[10px] font-semibold text-zinc-700 cursor-pointer hover:bg-zinc-100"
          >
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
