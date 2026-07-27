import { useEffect, useState } from "preact/hooks";
import { BadgeCheck, Database, Layers3, Maximize2, MessageSquareCheck, SlidersHorizontal } from "lucide-preact";
import { DesignAuditPanel } from "./design-audit-panel";
import { LayersPanel } from "./layers-panel";
import { ReviewPanel } from "./review-panel";
import { RightSidebar } from "./right-sidebar";
import { SmartResizePanel } from "./smart-resize-panel";
import { TemplateDataPanel } from "./template-data-panel";

type RightPanelTab = "properties" | "layers" | "resize" | "audit" | "review" | "data";

export function RightPanel() {
  const [tab, setTab] = useState<RightPanelTab>("properties");

  useEffect(() => {
    const open = (event: Event) => {
      const requested = (event as CustomEvent<{ tab?: RightPanelTab }>).detail?.tab;
      if (["properties", "layers", "resize", "audit", "review", "data"].includes(requested ?? "")) setTab(requested!);
    };
    window.addEventListener("ddone:open-right-panel", open);
    return () => window.removeEventListener("ddone:open-right-panel", open);
  }, []);

  const content = tab === "properties"
    ? <RightSidebar />
    : tab === "layers"
      ? <LayersPanel />
      : tab === "resize"
        ? <SmartResizePanel />
        : tab === "audit"
          ? <DesignAuditPanel />
          : tab === "review"
            ? <ReviewPanel />
            : <TemplateDataPanel />;

  return (
    <div class="relative flex h-full shrink-0 flex-col">
      <div class="absolute right-3 top-2 z-20 flex rounded-lg border border-zinc-200 bg-white p-0.5 shadow-sm">
        <button title="Proprietà" onClick={() => setTab("properties")} class={`grid h-7 w-8 place-items-center rounded-md border-0 cursor-pointer ${tab === "properties" ? "bg-violet-600 text-white" : "bg-transparent text-zinc-400 hover:bg-zinc-100"}`}><SlidersHorizontal size={13} /></button>
        <button title="Livelli" onClick={() => setTab("layers")} class={`grid h-7 w-8 place-items-center rounded-md border-0 cursor-pointer ${tab === "layers" ? "bg-violet-600 text-white" : "bg-transparent text-zinc-400 hover:bg-zinc-100"}`}><Layers3 size={13} /></button>
        <button title="Smart Resize" onClick={() => setTab("resize")} class={`grid h-7 w-8 place-items-center rounded-md border-0 cursor-pointer ${tab === "resize" ? "bg-violet-600 text-white" : "bg-transparent text-zinc-400 hover:bg-zinc-100"}`}><Maximize2 size={13} /></button>
        <button title="Controllo design" onClick={() => setTab("audit")} class={`grid h-7 w-8 place-items-center rounded-md border-0 cursor-pointer ${tab === "audit" ? "bg-violet-600 text-white" : "bg-transparent text-zinc-400 hover:bg-zinc-100"}`}><BadgeCheck size={13} /></button>
        <button title="Commenti e approvazione" onClick={() => setTab("review")} class={`grid h-7 w-8 place-items-center rounded-md border-0 cursor-pointer ${tab === "review" ? "bg-violet-600 text-white" : "bg-transparent text-zinc-400 hover:bg-zinc-100"}`}><MessageSquareCheck size={13} /></button>
        <button title="Template e dati CSV" onClick={() => setTab("data")} class={`grid h-7 w-8 place-items-center rounded-md border-0 cursor-pointer ${tab === "data" ? "bg-violet-600 text-white" : "bg-transparent text-zinc-400 hover:bg-zinc-100"}`}><Database size={13} /></button>
      </div>
      {content}
    </div>
  );
}
