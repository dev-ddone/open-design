import { useEffect, useMemo, useState } from "preact/hooks";
import {
  BringToFront,
  ChevronDown,
  ChevronUp,
  Copy,
  Crop,
  Layers3,
  Lock,
  PanelTopOpen,
  SendToBack,
  SlidersHorizontal,
  Trash2,
  Unlock,
} from "lucide-preact";
import * as fabric from "fabric";
import { canUngroupObject, groupActiveSelection, isActiveSelection, ungroupActiveObject } from "../canvas/grouping";
import { isSmartElement, readSmartElementData } from "../canvas/smart-elements";
import { useEditor } from "../context";

export interface EditorContextMenuRequest {
  x: number;
  y: number;
  pageId: string;
  target?: fabric.FabricObject | null;
}

function dispatchTool(tool: string): void {
  window.dispatchEvent(new CustomEvent("ddone:open-tool", { detail: { tool } }));
}

function dispatchRightPanel(tab: "properties" | "layers"): void {
  window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab } }));
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  disabled = false,
  danger = false,
  onClick,
}: {
  icon: typeof Crop;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      class={`flex h-9 w-full items-center gap-2 rounded-lg border-0 px-2.5 text-left text-[11px] transition ${
        disabled
          ? "cursor-not-allowed bg-transparent text-zinc-300"
          : danger
            ? "cursor-pointer bg-transparent text-red-600 hover:bg-red-50"
            : "cursor-pointer bg-transparent text-zinc-700 hover:bg-zinc-100"
      }`}
    >
      <Icon size={14} class="shrink-0" />
      <span class="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <span class="text-[8px] text-zinc-400">{shortcut}</span>}
    </button>
  );
}

export function EditorContextMenu() {
  const {
    canvasMap,
    setActiveCanvas,
    beginCrop,
    duplicateSelected,
    arrangeSelected,
    toggleSelectedLock,
    deleteSelected,
    readOnly,
  } = useEditor();
  const [request, setRequest] = useState<EditorContextMenuRequest | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<EditorContextMenuRequest>).detail;
      if (!detail || !Number.isFinite(detail.x) || !Number.isFinite(detail.y) || !detail.pageId) return;
      setActiveCanvas(detail.pageId);
      setRequest(detail);
    };
    const close = () => setRequest(null);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("ddone:context-menu", open);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("ddone:context-menu", open);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", escape);
    };
  }, [setActiveCanvas]);

  const state = useMemo(() => {
    if (!request) return null;
    const canvas = canvasMap.current.get(request.pageId) ?? null;
    const target = request.target ?? canvas?.getActiveObject() ?? null;
    const smartData = readSmartElementData(target);
    const selectedCount = canvas?.getActiveObjects().length ?? 0;
    const locked = Boolean(target?.lockMovementX && target?.lockMovementY && target?.lockScalingX && target?.lockScalingY);
    return {
      canvas,
      target,
      smartData,
      selectedCount,
      locked,
      image: target instanceof fabric.FabricImage,
      smart: isSmartElement(target),
      canGroup: isActiveSelection(canvas?.getActiveObject()) && selectedCount >= 2,
      canUngroup: canUngroupObject(target),
    };
  }, [request, canvasMap]);

  if (!request || !state) return null;

  const run = (action: () => void | Promise<void>) => {
    setRequest(null);
    void action();
  };
  const left = Math.max(8, Math.min(request.x, window.innerWidth - 250));
  const top = Math.max(8, Math.min(request.y, window.innerHeight - 440));
  const smartLabel = state.smartData?.type === "table"
    ? "Modifica tabella"
    : state.smartData?.type === "grid"
      ? "Modifica griglia"
      : "Modifica cornice";

  return (
    <>
      <div class="fixed inset-0 z-[90]" onPointerDown={() => setRequest(null)} onContextMenu={(event) => { event.preventDefault(); setRequest(null); }} />
      <div
        role="menu"
        class="fixed z-[100] w-60 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl"
        style={{ left, top }}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {state.target ? (
          <>
            {state.smart && !readOnly && (
              <MenuItem icon={PanelTopOpen} label={smartLabel} onClick={() => run(() => dispatchTool("smart-element"))} />
            )}
            {state.image && !readOnly && (
              <MenuItem icon={Crop} label="Ritaglia immagine" onClick={() => run(() => beginCrop(state.target as fabric.FabricImage))} />
            )}
            <MenuItem icon={SlidersHorizontal} label="Apri proprietà" onClick={() => run(() => dispatchRightPanel("properties"))} />
            <MenuItem icon={Layers3} label="Mostra nei livelli" onClick={() => run(() => dispatchRightPanel("layers"))} />

            {!readOnly && (
              <>
                <div class="my-1 border-t border-zinc-100" />
                <MenuItem icon={Layers3} label="Raggruppa selezione" shortcut="Ctrl+G" disabled={!state.canGroup} onClick={() => run(() => { if (state.canvas) groupActiveSelection(state.canvas); })} />
                <MenuItem icon={PanelTopOpen} label="Separa gruppo" shortcut="Ctrl+⇧+G" disabled={!state.canUngroup} onClick={() => run(() => { if (state.canvas) ungroupActiveObject(state.canvas); })} />
                <MenuItem icon={Copy} label="Duplica" shortcut="Ctrl+D" onClick={() => run(duplicateSelected)} />

                <div class="my-1 border-t border-zinc-100" />
                <MenuItem icon={BringToFront} label="Porta in primo piano" onClick={() => run(() => arrangeSelected("front"))} />
                <MenuItem icon={ChevronUp} label="Porta avanti" onClick={() => run(() => arrangeSelected("forward"))} />
                <MenuItem icon={ChevronDown} label="Porta indietro" onClick={() => run(() => arrangeSelected("backward"))} />
                <MenuItem icon={SendToBack} label="Porta sullo sfondo" onClick={() => run(() => arrangeSelected("back"))} />

                <div class="my-1 border-t border-zinc-100" />
                <MenuItem icon={state.locked ? Unlock : Lock} label={state.locked ? "Sblocca livello" : "Blocca livello"} onClick={() => run(toggleSelectedLock)} />
                <MenuItem icon={Trash2} label="Elimina" shortcut="Canc" danger onClick={() => run(deleteSelected)} />
              </>
            )}
          </>
        ) : (
          <>
            <div class="px-2.5 py-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Pagina</div>
            <MenuItem icon={Layers3} label="Apri livelli" onClick={() => run(() => dispatchRightPanel("layers"))} />
            <MenuItem icon={SlidersHorizontal} label="Apri proprietà" onClick={() => run(() => dispatchRightPanel("properties"))} />
          </>
        )}
      </div>
    </>
  );
}
