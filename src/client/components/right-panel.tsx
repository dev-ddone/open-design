import { useEffect, useState } from "preact/hooks";
import { BadgeCheck, CircleDashed, Database, Layers3, Maximize2, MessageSquareCheck, SlidersHorizontal } from "lucide-preact";
import { isNativeShape } from "../canvas/native-shapes";
import { useEditor } from "../context";
import { DesignAuditPanel } from "./design-audit-panel";
import { LayersPanel } from "./layers-panel";
import { NativeShapeInspector } from "./native-shape-inspector";
import { ReviewPanel } from "./review-panel";
import { RightSidebar } from "./right-sidebar";
import { SmartResizePanel } from "./smart-resize-panel";
import { TemplateDataPanel } from "./template-data-panel";

type RightPanelTab = "properties" | "shape" | "layers" | "resize" | "audit" | "review" | "data";

export function RightPanel() {
  const { readOnly, selectedObject, canvas } = useEditor();
  const activeObject = canvas?.getActiveObject() ?? selectedObject;
  const nativeShapeSelected = isNativeShape(activeObject);
  const [tab, setTab] = useState<RightPanelTab>(readOnly ? "review" : nativeShapeSelected ? "shape" : "properties");

  useEffect(() => {
    if (readOnly && tab !== "review") setTab("review");
  }, [readOnly, tab]);

  useEffect(() => {
    if (readOnly) return;
    if (nativeShapeSelected && tab === "properties") setTab("shape");
    if (!nativeShapeSelected && tab === "shape") setTab("properties");
  }, [nativeShapeSelected, readOnly, tab]);

  useEffect(() => {
    const open = (event: Event) => {
      const requested = (event as CustomEvent<{ tab?: RightPanelTab }>).detail?.tab;
      if (!requested) return;
      if (readOnly) {
        if (requested === "review") setTab("review");
        return;
      }
      if (["properties", "shape", "layers", "resize", "audit", "review", "data"].includes(requested)) setTab(requested);
    };
    window.addEventListener("ddone:open-right-panel", open);
    return () => window.removeEventListener("ddone:open-right-panel", open);
  }, [readOnly]);

  const content = readOnly || tab === "review"
    ? <ReviewPanel />
    : tab === "shape"
      ? <NativeShapeInspector />
      : tab === "properties"
        ? <RightSidebar />
        : tab === "layers"
          ? <LayersPanel />
          : tab === "resize"
            ? <SmartResizePanel />
            : tab === "audit"
              ? <DesignAuditPanel />
              : <TemplateDataPanel />;

  const buttonClass = (value: RightPanelTab) => `grid h-8 w-8 place-items-center rounded-lg border-0 cursor-pointer ${tab === value ? "bg-violet-600 text-white shadow-sm" : "bg-transparent text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"}`;

  return (
    <div class="flex h-full w-[280px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <div class="flex min-h-11 shrink-0 items-center justify-between border-b border-zinc-200 px-3">
        <div><strong class="block text-[9px] font-semibold text-zinc-600">Pannello</strong><span class="block text-[7px] text-zinc-400">Proprietà, livelli e revisione</span></div>
        <div class="flex rounded-xl border border-zinc-200 bg-zinc-50 p-0.5">
          {!readOnly && <button aria-label="Proprietà" title="Proprietà" onClick={() => setTab("properties")} class={buttonClass("properties")}><SlidersHorizontal size={13} /></button>}
          {!readOnly && nativeShapeSelected && <button aria-label="Forma nativa" title="Forma nativa" onClick={() => setTab("shape")} class={buttonClass("shape")}><CircleDashed size={13} /></button>}
          {!readOnly && <button aria-label="Livelli" title="Livelli" onClick={() => setTab("layers")} class={buttonClass("layers")}><Layers3 size={13} /></button>}
          {!readOnly && <button aria-label="Smart Resize" title="Smart Resize" onClick={() => setTab("resize")} class={buttonClass("resize")}><Maximize2 size={13} /></button>}
          {!readOnly && <button aria-label="Controllo design" title="Controllo design" onClick={() => setTab("audit")} class={buttonClass("audit")}><BadgeCheck size={13} /></button>}
          <button aria-label="Commenti e approvazione" title="Commenti e approvazione" onClick={() => setTab("review")} class={buttonClass("review")}><MessageSquareCheck size={13} /></button>
          {!readOnly && <button aria-label="Template e dati CSV" title="Template e dati CSV" onClick={() => setTab("data")} class={buttonClass("data")}><Database size={13} /></button>}
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-hidden">{content}</div>
    </div>
  );
}
