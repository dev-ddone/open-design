import { useEffect, useMemo, useState } from "preact/hooks";
import type { DDoneFabricObject } from "../canvas-model";
import { useEditor } from "../context";

interface CursorView { id: string; name: string; color: string; left: number; top: number; }
interface SelectionView { id: string; name: string; color: string; left: number; top: number; width: number; height: number; }

export function RemotePresenceOverlay() {
  const { collaborators, canvasMap } = useEditor();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const timer = window.setInterval(refresh, 250);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => { window.clearInterval(timer); window.removeEventListener("resize", refresh); window.removeEventListener("scroll", refresh, true); };
  }, []);

  const views = useMemo(() => {
    void revision;
    const cursors: CursorView[] = [];
    const selections: SelectionView[] = [];
    for (const collaborator of collaborators) {
      if (collaborator.cursor) {
        const canvas = canvasMap.current.get(collaborator.cursor.pageId);
        if (canvas?.upperCanvasEl) {
          const bounds = canvas.upperCanvasEl.getBoundingClientRect();
          const left = bounds.left + (collaborator.cursor.x / Math.max(1, canvas.getWidth())) * bounds.width;
          const top = bounds.top + (collaborator.cursor.y / Math.max(1, canvas.getHeight())) * bounds.height;
          cursors.push({ id: String(collaborator.clientId), name: collaborator.name, color: collaborator.color, left, top });
        }
      }
      if (collaborator.selection?.objectId) {
        const canvas = canvasMap.current.get(collaborator.selection.pageId);
        const object = canvas?.getObjects().find((item) => (item as DDoneFabricObject).ddoneId === collaborator.selection?.objectId);
        if (canvas?.upperCanvasEl && object) {
          const canvasBounds = canvas.upperCanvasEl.getBoundingClientRect();
          const objectBounds = object.getBoundingRect();
          const ratioX = canvasBounds.width / Math.max(1, canvas.getWidth());
          const ratioY = canvasBounds.height / Math.max(1, canvas.getHeight());
          selections.push({
            id: String(collaborator.clientId),
            name: collaborator.name,
            color: collaborator.color,
            left: canvasBounds.left + objectBounds.left * ratioX,
            top: canvasBounds.top + objectBounds.top * ratioY,
            width: objectBounds.width * ratioX,
            height: objectBounds.height * ratioY,
          });
        }
      }
    }
    return { cursors, selections };
  }, [collaborators, canvasMap, revision]);

  return (
    <div class="pointer-events-none fixed inset-0 z-[62]" aria-hidden="true">
      {views.selections.map((selection) => <div key={`selection-${selection.id}`} class="absolute rounded-sm border-2" style={{ left: `${selection.left}px`, top: `${selection.top}px`, width: `${selection.width}px`, height: `${selection.height}px`, borderColor: selection.color }}><span class="absolute -top-5 left-0 rounded px-1.5 py-0.5 text-[7px] font-semibold text-white" style={{ background: selection.color }}>{selection.name}</span></div>)}
      {views.cursors.map((cursor) => <div key={`cursor-${cursor.id}`} class="absolute transition-[left,top] duration-75" style={{ left: `${cursor.left}px`, top: `${cursor.top}px` }}><svg width="18" height="22" viewBox="0 0 18 22" fill="none"><path d="M1 1L16 12L9 13.5L6 20L1 1Z" fill={cursor.color} stroke="white" stroke-width="1.5" /></svg><span class="absolute left-3 top-4 whitespace-nowrap rounded px-1.5 py-0.5 text-[7px] font-semibold text-white shadow" style={{ background: cursor.color }}>{cursor.name}</span></div>)}
    </div>
  );
}