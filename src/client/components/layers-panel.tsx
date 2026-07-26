import { useEffect, useMemo, useState } from "preact/hooks";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Layers3,
  Lock,
  Shapes,
  Table2,
  Type,
  Unlock,
} from "lucide-preact";
import * as fabric from "fabric";
import { ensureObjectId, type DDoneFabricObject } from "../canvas-model";
import { readSmartElementData } from "../canvas/smart-elements";
import { useEditor } from "../context";
import type { EditorContextMenuRequest } from "./editor-context-menu";

function layerName(object: fabric.FabricObject, index: number): string {
  const metadata = object as DDoneFabricObject;
  if (metadata.ddoneName?.trim()) return metadata.ddoneName.trim();
  if (metadata._isBgImage) return "Sfondo";
  if (metadata.ddoneSmartType === "table") return "Tabella intelligente";
  if (metadata.ddoneSmartType === "grid") return "Griglia intelligente";
  if (metadata.ddoneSmartType === "frame") return "Cornice intelligente";
  if (object instanceof fabric.Textbox || object instanceof fabric.IText) {
    return String((object as fabric.Textbox).text || "Testo").slice(0, 32);
  }
  if (object instanceof fabric.FabricImage) return "Immagine";
  if (metadata.ddoneIsSvg) return "Vettore SVG";
  if (object instanceof fabric.Group) return `Gruppo ${index + 1}`;
  return `${object.type || "Oggetto"} ${index + 1}`;
}

function childName(object: fabric.FabricObject, index: number): string {
  const cellIndex = (object as any).ddoneSmartCellIndex;
  if (Number.isInteger(cellIndex) && object instanceof fabric.Textbox) {
    return `Cella ${Number(cellIndex) + 1} · ${String(object.text || "Vuota").slice(0, 24)}`;
  }
  if (object instanceof fabric.Textbox || object instanceof fabric.IText) return String(object.text || `Testo ${index + 1}`).slice(0, 32);
  if (object instanceof fabric.FabricImage) return `Immagine ${index + 1}`;
  if (object instanceof fabric.Line) return `Linea ${index + 1}`;
  if (object instanceof fabric.Rect) return `Forma ${index + 1}`;
  return `${object.type || "Elemento"} ${index + 1}`;
}

function groupSummary(object: fabric.FabricObject): string | null {
  if (!(object instanceof fabric.Group)) return null;
  const data = readSmartElementData(object);
  if (data?.type === "table") return `${data.rows} righe × ${data.columns} colonne`;
  if (data?.type === "grid") return `${data.slots.length} aree immagine`;
  if (data?.type === "frame") return data.imageUrl ? "Cornice con immagine" : "Cornice vuota";
  return `${object.getObjects().length} elementi raggruppati`;
}

function LayerIcon({ object }: { object: fabric.FabricObject }) {
  const metadata = object as DDoneFabricObject;
  if (metadata.ddoneSmartType === "table") return <Table2 size={14} />;
  if (object instanceof fabric.Textbox || object instanceof fabric.IText) return <Type size={14} />;
  if (object instanceof fabric.FabricImage || metadata._isBgImage) return <ImageIcon size={14} />;
  return <Shapes size={14} />;
}

export function LayersPanel() {
  const { canvas, selectedObject, readOnly, activePageId } = useEditor();
  const [revision, setRevision] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!canvas) return;
    const refresh = () => setRevision((value) => value + 1);
    canvas.on("object:added", refresh);
    canvas.on("object:removed", refresh);
    canvas.on("object:modified", refresh);
    canvas.on("selection:created", refresh);
    canvas.on("selection:updated", refresh);
    canvas.on("selection:cleared", refresh);
    return () => {
      canvas.off("object:added", refresh);
      canvas.off("object:removed", refresh);
      canvas.off("object:modified", refresh);
      canvas.off("selection:created", refresh);
      canvas.off("selection:updated", refresh);
      canvas.off("selection:cleared", refresh);
    };
  }, [canvas]);

  const layers = useMemo(() => {
    void revision;
    return [...(canvas?.getObjects() ?? [])].reverse();
  }, [canvas, revision]);

  const selected = canvas?.getActiveObject() ?? selectedObject;

  const notify = (object: fabric.FabricObject) => {
    object.setCoords();
    canvas?.requestRenderAll();
    canvas?.fire("object:modified", { target: object } as any);
    setRevision((value) => value + 1);
  };

  const select = (object: fabric.FabricObject) => {
    if (!canvas || !object.selectable) return;
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    setRevision((value) => value + 1);
  };

  const openContextMenu = (event: MouseEvent, object: fabric.FabricObject) => {
    event.preventDefault();
    event.stopPropagation();
    if (!activePageId) return;
    if (object.selectable) select(object);
    const detail: EditorContextMenuRequest = {
      x: event.clientX,
      y: event.clientY,
      pageId: activePageId,
      target: object,
    };
    window.dispatchEvent(new CustomEvent("ddone:context-menu", { detail }));
  };

  const toggleVisibility = (object: fabric.FabricObject) => {
    object.set("visible", object.visible === false);
    if (object.visible === false && selected === object) canvas?.discardActiveObject();
    notify(object);
  };

  const toggleLock = (object: fabric.FabricObject) => {
    const locked = Boolean(object.lockMovementX && object.lockMovementY && object.lockScalingX && object.lockScalingY);
    object.set({
      lockMovementX: !locked,
      lockMovementY: !locked,
      lockScalingX: !locked,
      lockScalingY: !locked,
      lockRotation: !locked,
      hasControls: locked,
      selectable: locked,
      evented: locked,
      hoverCursor: locked ? "move" : "default",
    });
    notify(object);
  };

  const move = (object: fabric.FabricObject, direction: "up" | "down") => {
    if (!canvas) return;
    const api = canvas as any;
    direction === "up" ? api.bringObjectForward?.(object) : api.sendObjectBackwards?.(object);
    notify(object);
  };

  const startRename = (object: fabric.FabricObject, index: number) => {
    const id = ensureObjectId(object);
    setEditingId(id);
    setEditingName(layerName(object, index));
  };

  const finishRename = (object: fabric.FabricObject) => {
    const metadata = object as DDoneFabricObject;
    metadata.ddoneName = editingName.trim().slice(0, 100) || undefined;
    setEditingId(null);
    notify(object);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <aside class="flex h-full w-[300px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 p-4">
        <div class="flex items-center gap-2">
          <Layers3 size={16} class="text-violet-600" />
          <h2 class="m-0 text-xs font-semibold text-zinc-800">Livelli</h2>
        </div>
        <p class="mt-1 mb-0 text-[9px] leading-relaxed text-zinc-400">Gruppi espandibili, ordine, visibilità, blocco e menu con clic destro.</p>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        {layers.length === 0 && <div class="p-6 text-center text-[10px] text-zinc-400">Il canvas non contiene ancora livelli.</div>}
        {layers.map((object, index) => {
          const id = ensureObjectId(object);
          const active = selected === object;
          const locked = Boolean(object.lockMovementX && object.lockMovementY && object.lockScalingX && object.lockScalingY);
          const visible = object.visible !== false;
          const grouped = object instanceof fabric.Group;
          const expanded = grouped && expandedIds.has(id);
          const summary = groupSummary(object);
          return (
            <div key={id} class="mb-1">
              <div
                class={`flex min-h-11 items-center gap-1 rounded-lg border px-1.5 transition ${active ? "border-violet-300 bg-violet-50" : "border-transparent hover:bg-zinc-50"}`}
                onContextMenu={(event) => openContextMenu(event as unknown as MouseEvent, object)}
              >
                {grouped ? (
                  <button title={expanded ? "Comprimi gruppo" : "Espandi gruppo"} onClick={() => toggleExpanded(id)} class="grid h-7 w-5 shrink-0 place-items-center border-0 bg-transparent text-zinc-400 cursor-pointer hover:text-zinc-700">
                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                ) : <GripVertical size={13} class="shrink-0 text-zinc-300" />}
                <button disabled={!object.selectable} onClick={() => select(object)} onDblClick={() => !readOnly && startRename(object, index)} class="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent px-1 py-2 text-left cursor-pointer disabled:cursor-default">
                  <span class={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${active ? "bg-violet-600 text-white" : "bg-zinc-100 text-zinc-500"}`}><LayerIcon object={object} /></span>
                  <span class="min-w-0 flex-1">
                    {editingId === id ? (
                      <input autoFocus value={editingName} onInput={(event) => setEditingName((event.target as HTMLInputElement).value)} onBlur={() => finishRename(object)} onKeyDown={(event) => { if (event.key === "Enter") finishRename(object); if (event.key === "Escape") setEditingId(null); }} onClick={(event) => event.stopPropagation()} class="h-7 w-full rounded border border-violet-300 bg-white px-1.5 text-[9px] outline-none" />
                    ) : (
                      <>
                        <span class="block truncate text-[9px] font-medium text-zinc-700">{layerName(object, index)}</span>
                        {summary && <span class="block truncate text-[8px] text-zinc-400">{summary}</span>}
                      </>
                    )}
                  </span>
                </button>
                {!readOnly && (
                  <div class="flex shrink-0 items-center">
                    <button title="Porta avanti" onClick={() => move(object, "up")} class="grid h-7 w-6 place-items-center border-0 bg-transparent text-zinc-400 cursor-pointer hover:text-zinc-700"><ChevronUp size={12} /></button>
                    <button title="Porta indietro" onClick={() => move(object, "down")} class="grid h-7 w-6 place-items-center border-0 bg-transparent text-zinc-400 cursor-pointer hover:text-zinc-700"><ChevronDown size={12} /></button>
                    <button title={visible ? "Nascondi" : "Mostra"} onClick={() => toggleVisibility(object)} class="grid h-7 w-7 place-items-center border-0 bg-transparent text-zinc-400 cursor-pointer hover:text-zinc-700">{visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                    <button title={locked ? "Sblocca" : "Blocca"} onClick={() => toggleLock(object)} class="grid h-7 w-7 place-items-center border-0 bg-transparent text-zinc-400 cursor-pointer hover:text-zinc-700">{locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
                  </div>
                )}
              </div>
              {expanded && object instanceof fabric.Group && (
                <div class="ml-7 border-l border-zinc-200 py-1 pl-3">
                  {object.getObjects().map((child, childIndex) => (
                    <div key={`${id}-${childIndex}`} class="flex h-7 items-center gap-2 rounded-md px-2 text-[8px] text-zinc-500 hover:bg-zinc-50">
                      <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
                      <span class="truncate">{childName(child, childIndex)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div class="border-t border-zinc-200 p-3 text-[8px] leading-relaxed text-zinc-400">Doppio clic rinomina. Clic destro apre le azioni. Ctrl/Cmd+G raggruppa; Ctrl/Cmd+Shift+G separa i gruppi normali.</div>
    </aside>
  );
}
