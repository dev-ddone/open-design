import { useState } from "preact/hooks";
import { Layers3, SlidersHorizontal } from "lucide-preact";
import { LayersPanel } from "./layers-panel";
import { RightSidebar } from "./right-sidebar";

export function RightPanel() {
  const [tab, setTab] = useState<"properties" | "layers">("properties");
  return (
    <div class="relative flex h-full shrink-0 flex-col">
      <div class="absolute right-3 top-2 z-20 flex rounded-lg border border-zinc-200 bg-white p-0.5 shadow-sm">
        <button title="Proprietà" onClick={() => setTab("properties")} class={`grid h-7 w-8 place-items-center rounded-md border-0 cursor-pointer ${tab === "properties" ? "bg-violet-600 text-white" : "bg-transparent text-zinc-400 hover:bg-zinc-100"}`}><SlidersHorizontal size={13} /></button>
        <button title="Livelli" onClick={() => setTab("layers")} class={`grid h-7 w-8 place-items-center rounded-md border-0 cursor-pointer ${tab === "layers" ? "bg-violet-600 text-white" : "bg-transparent text-zinc-400 hover:bg-zinc-100"}`}><Layers3 size={13} /></button>
      </div>
      {tab === "properties" ? <RightSidebar /> : <LayersPanel />}
    </div>
  );
}
