import { useState } from "preact/hooks";
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Download,
  Save,
  ChevronDown,
  Home,
  Wifi,
  WifiOff,
  Eye,
  History,
  LayoutTemplate,
} from "lucide-preact";
import { useEditor, CANVAS_SIZES } from "../context";
import { VersionHistory } from "./version-history";
import { TemplateManager } from "./template-manager";

export function Toolbar() {
  const {
    canvasWidth,
    canvasHeight,
    setCanvasSize,
    undo,
    redo,
    canUndo,
    canRedo,
    zoom,
    fitScale,
    zoomToFit,
    zoomIn,
    zoomOut,
    exportDesign,
    saveDesign,
    saving,
    activeDesign,
    renameDesign,
    navigate,
    readOnly,
    collaborationConnected,
    collaborationSynced,
    collaborators,
  } = useEditor();

  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const currentSize = CANVAS_SIZES.find((size) => size.width === canvasWidth && size.height === canvasHeight);
  const sizeLabel = currentSize ? currentSize.label : `${canvasWidth} × ${canvasHeight}`;
  const filename = activeDesign?.name ?? "design";

  const finishRename = () => {
    if (!readOnly && activeDesign && nameValue.trim()) void renameDesign(activeDesign.id, nameValue.trim());
    setEditingName(false);
  };

  return (
    <>
      <div class="flex items-center justify-between px-3 py-1.5 bg-white border-b border-zinc-200 shrink-0 min-h-11">
        <div class="flex items-center gap-3 min-w-0">
          <button class="p-1.5 rounded-md text-zinc-400 bg-transparent border-none cursor-pointer hover:bg-zinc-100 hover:text-zinc-900" onClick={() => navigate("/")} title="Back to designs"><Home size={16} /></button>
          {activeDesign && (editingName ? (
            <input
              class="bg-zinc-100 border border-accent rounded px-2 py-0.5 text-xs text-zinc-900 outline-none w-40"
              value={nameValue}
              onInput={(event) => setNameValue((event.target as HTMLInputElement).value)}
              onBlur={finishRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") finishRename();
                if (event.key === "Escape") setEditingName(false);
              }}
              autoFocus
            />
          ) : (
            <span
              class={`text-xs font-semibold text-zinc-600 truncate max-w-44 ${readOnly ? "cursor-default" : "cursor-pointer hover:text-zinc-900"}`}
              onDblClick={() => {
                if (!readOnly) {
                  setNameValue(activeDesign.name);
                  setEditingName(true);
                }
              }}
              title={readOnly ? activeDesign.name : "Double click to rename"}
            >{activeDesign.name}</span>
          ))}
          {readOnly && <span class="hidden sm:inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-[9px] font-semibold text-zinc-500"><Eye size={11} /> VIEW ONLY</span>}

          <div class="relative hidden md:block">
            <button disabled={readOnly} class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-zinc-400 bg-zinc-100 border border-zinc-300 cursor-pointer hover:text-zinc-900 disabled:opacity-60" onClick={() => !readOnly && setShowSizeDropdown(!showSizeDropdown)}>
              {sizeLabel} <ChevronDown size={12} />
            </button>
            {showSizeDropdown && !readOnly && (
              <>
                <div class="fixed inset-0 z-10" onClick={() => setShowSizeDropdown(false)} />
                <div class="absolute top-full left-0 mt-1 bg-white border border-zinc-300 rounded-lg shadow-xl z-20 min-w-[220px] py-1 max-h-80 overflow-auto">
                  {CANVAS_SIZES.map((size) => (
                    <button key={size.label} class={`w-full text-left px-3 py-1.5 text-xs cursor-pointer border-none ${size.width === canvasWidth && size.height === canvasHeight ? "bg-accent/20 text-accent" : "text-zinc-600 bg-transparent hover:bg-zinc-100"}`} onClick={() => { setCanvasSize(size.width, size.height); setShowSizeDropdown(false); }}>
                      <span class="font-medium">{size.label}</span><span class="text-zinc-400 ml-2">{size.width} × {size.height}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div class="hidden lg:flex items-center gap-2">
          <span class={`inline-flex items-center gap-1 text-[10px] ${collaborationConnected && collaborationSynced ? "text-emerald-600" : "text-zinc-400"}`}>
            {collaborationConnected ? <Wifi size={13} /> : <WifiOff size={13} />}
            {collaborationSynced ? "Synced" : collaborationConnected ? "Syncing" : "Offline"}
          </span>
          <div class="flex -space-x-1.5">
            {collaborators.slice(0, 5).map((collaborator) => (
              <span key={collaborator.clientId} title={collaborator.name} class="w-6 h-6 rounded-full border-2 border-white grid place-items-center text-[9px] font-bold text-white uppercase" style={{ background: collaborator.color }}>
                {collaborator.name.slice(0, 1)}
              </span>
            ))}
          </div>
        </div>

        <div class="flex items-center gap-1">
          {!readOnly && (
            <>
              <button class="p-1.5 rounded-md text-zinc-400 bg-transparent border-none cursor-pointer hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30" onClick={undo} disabled={!canUndo} title="Undo"><Undo2 size={16} /></button>
              <button class="p-1.5 rounded-md text-zinc-400 bg-transparent border-none cursor-pointer hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30" onClick={redo} disabled={!canRedo} title="Redo"><Redo2 size={16} /></button>
            </>
          )}
          <button class="p-1.5 rounded-md text-zinc-400 bg-transparent border-none cursor-pointer hover:bg-zinc-100 hover:text-zinc-900" onClick={zoomOut}><ZoomOut size={15} /></button>
          <span class="text-[11px] text-zinc-400 font-mono w-10 text-center">{Math.round((zoom / (fitScale || 1)) * 100)}%</span>
          <button class="p-1.5 rounded-md text-zinc-400 bg-transparent border-none cursor-pointer hover:bg-zinc-100 hover:text-zinc-900" onClick={zoomIn}><ZoomIn size={15} /></button>
          <button class="hidden sm:grid p-1.5 rounded-md text-zinc-400 bg-transparent border-none cursor-pointer hover:bg-zinc-100 hover:text-zinc-900" onClick={zoomToFit}><Maximize size={15} /></button>
          <div class="w-px h-5 bg-zinc-300 mx-1" />

          <button class="p-1.5 rounded-md text-zinc-400 bg-transparent border-none cursor-pointer hover:bg-zinc-100 hover:text-zinc-900" onClick={() => setShowHistory(true)} title="Version history"><History size={16} /></button>
          {!readOnly && <button class="p-1.5 rounded-md text-zinc-400 bg-transparent border-none cursor-pointer hover:bg-zinc-100 hover:text-zinc-900" onClick={() => setShowTemplateManager(true)} title="Create template"><LayoutTemplate size={16} /></button>}

          <div class="relative">
            <button class="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold border border-zinc-300 cursor-pointer bg-transparent text-zinc-600 hover:bg-zinc-100" onClick={() => setShowExportDropdown(!showExportDropdown)}>
              <Download size={13} /> <span class="hidden sm:inline">Export</span> <ChevronDown size={11} />
            </button>
            {showExportDropdown && (
              <>
                <div class="fixed inset-0 z-10" onClick={() => setShowExportDropdown(false)} />
                <div class="absolute right-0 top-full mt-1 w-48 rounded-lg border border-zinc-200 bg-white shadow-xl z-20 py-1">
                  {[
                    { format: "png" as const, label: "PNG · current page" },
                    { format: "jpg" as const, label: "JPG · current page" },
                    { format: "svg" as const, label: "SVG · current page" },
                    { format: "pdf" as const, label: "PDF · all pages" },
                  ].map((item) => (
                    <button key={item.format} class="w-full text-left px-3 py-2 text-xs text-zinc-600 bg-transparent border-0 cursor-pointer hover:bg-zinc-100" onClick={() => { setShowExportDropdown(false); void exportDesign(item.format, filename, item.format === "pdf"); }}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {!readOnly && (
            <button class="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer bg-accent text-white hover:bg-accent-hover disabled:opacity-50" onClick={() => void saveDesign()} disabled={saving || !activeDesign}>
              {saving ? <span class="spinner !border-white/30 !border-t-white" /> : <Save size={13} />}
              <span class="hidden sm:inline">{saving ? "Saving…" : "Save"}</span>
            </button>
          )}
        </div>
      </div>
      {showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}
      {showTemplateManager && <TemplateManager onClose={() => setShowTemplateManager(false)} />}
    </>
  );
}
