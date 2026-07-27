import { useEffect, useState } from "preact/hooks";
import { BadgeCheck, Database, Layers3, Maximize2, MessageSquareCheck, SlidersHorizontal } from "lucide-preact";
import { useEditor } from "../context";
import { DesignAuditPanel } from "./design-audit-panel";
import { LayersPanel } from "./layers-panel";
import { ReviewPanel } from "./review-panel";
import { RightSidebar } from "./right-sidebar";
import { SmartResizePanel } from "./smart-resize-panel";
import { TemplateDataPanel } from "./template-data-panel";

type RightPanelTab = "properties" | "layers" | "resize" | "audit" | "review" | "data";

export function RightPanel() {
  const { readOnly } = useEditor();
  const [tab, setTab] = useState<RightPanelTab>(readOnly ? "review" : "properties");

  useEffect(() => {
    if (readOnly && tab !== "review") setTab("review");
  }, [readOnly, tab]);

  useEffect(() => {
    const open = (event: Event) => {
      const requested = (event as CustomEvent<{ tab?: RightPanelTab }>).detail?.tab;
      if (!requested) return;
      if (readOnly) {
        if (requested === "review") setTab("review");
        return;
      }
      if (["properties", "layers", "resize", "audit", "review", "data"].includes(requested)) setTab(requested);
    };
    window.addEventListener("ddone:open-right-panel", open);
    return () => window.removeEventListener("ddone:open-right-panel", open);
  }, [readOnly]);

  const content = readOnly || tab === "review"
    ? <ReviewPanel />
    : tab === "properties"
      ? <RightSidebar />
      : tab === "layers"
        ? <LayersPanel />
        : tab === "resize"
          ? <SmartResizePanel />
          : tab === "audit"
            ? <DesignAuditPanel />
            : <TemplateDataPanel />;

  const buttonClass = (value: RightPanelTab) => `grid h-7 w-8 place-items-center rounded-md border-0 cursor-pointer ${tab === value ? "bg-violet-600 text-white" : "bg-transparent text-zinc-400 hover:bg-zinc-100"}`;

  return (
    <div class="relative flex h-full shrink-0 flex-col">
      <div class="absolute right-3 top-2 z-20 flex rounded-lg border border-zinc-200 bg-white p-0.5 shadow-sm">
        {!readOnly && <button aria-label="Proprietà" title="Proprietà" onClick={() => setTab("properties")} class={buttonClass("properties")}><SlidersHorizontal size={13} /></button>}
        {!readOnly && <button aria-label="Livelli" title="Livelli" onClick={() => setTab("layers")} class={buttonClass("layers")}><Layers3 size={13} /></button>}
        {!readOnly && <button aria-label="Smart Resize" title="Smart Resize" onClick={() => setTab("resize")} class={buttonClass("resize")}><Maximize2 size={13} /></button>}
        {!readOnly && <button aria-label="Controllo design" title="Controllo design" onClick={() => setTab("audit")} class={buttonClass("audit")}><BadgeCheck size={13} /></button>}
        <button aria-label="Commenti e approvazione" title="Commenti e approvazione" onClick={() => setTab("review")} class={buttonClass("review")}><MessageSquareCheck size={13} /></button>
        {!readOnly && <button aria-label="Template e dati CSV" title="Template e dati CSV" onClick={() => setTab("data")} class={buttonClass("data")}><Database size={13} /></button>}
      </div>
      {content}
    </div>
  );
}
