import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { MessageSquare } from "lucide-preact";
import { api } from "../api";
import type { DDoneFabricObject } from "../canvas-model";
import { useEditor } from "../context";
import {
  REVIEW_COMMENT_FOCUS_EVENT,
  REVIEW_COMMENTS_CHANGED_EVENT,
  REVIEW_COMMENTS_LOADED_EVENT,
  clampCommentRegion,
  notifyReviewCommentsChanged,
  type ReviewComment,
  type ReviewResponse,
} from "../review-comments";

interface PositionedPin {
  comment: ReviewComment;
  left: number;
  top: number;
  width: number;
  height: number;
  number: number;
}

interface DragAnchor { commentId: string; x: number; y: number; }

export function ReviewCommentPins() {
  const { activeDesign, canvasMap, setActiveCanvas, switchToPage } = useEditor();
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [dragAnchor, setDragAnchor] = useState<DragAnchor | null>(null);

  const load = useCallback(async () => {
    if (!activeDesign?.id) { setComments([]); return; }
    try { const result = await api<ReviewResponse>("GET", `/api/designs/${activeDesign.id}/review`); setComments(result.comments); }
    catch { setComments([]); }
  }, [activeDesign?.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const loaded = (event: Event) => { const next = (event as CustomEvent<{ comments?: ReviewComment[] }>).detail?.comments; if (Array.isArray(next)) setComments(next); };
    const changed = () => void load();
    window.addEventListener(REVIEW_COMMENTS_LOADED_EVENT, loaded);
    window.addEventListener(REVIEW_COMMENTS_CHANGED_EVENT, changed);
    return () => { window.removeEventListener(REVIEW_COMMENTS_LOADED_EVENT, loaded); window.removeEventListener(REVIEW_COMMENTS_CHANGED_EVENT, changed); };
  }, [load]);
  useEffect(() => {
    const refresh = () => setLayoutRevision((value) => value + 1);
    window.addEventListener("resize", refresh); window.addEventListener("scroll", refresh, true);
    const timer = window.setInterval(refresh, 400);
    return () => { window.removeEventListener("resize", refresh); window.removeEventListener("scroll", refresh, true); window.clearInterval(timer); };
  }, []);

  const pins = useMemo<PositionedPin[]>(() => {
    void layoutRevision;
    const openComments = comments.filter((comment) => !comment.resolved_at && comment.page_id);
    return openComments.flatMap((comment, index) => {
      const canvas = comment.page_id ? canvasMap.current.get(comment.page_id) : null;
      if (!canvas?.upperCanvasEl) return [];
      const bounds = canvas.upperCanvasEl.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return [];
      let x = dragAnchor?.commentId === comment.id ? dragAnchor.x : comment.anchor_x ?? 0.5;
      let y = dragAnchor?.commentId === comment.id ? dragAnchor.y : comment.anchor_y ?? 0.5;
      let width = clampCommentRegion(comment.anchor_width, 0.25);
      let height = clampCommentRegion(comment.anchor_height, 0.15);
      if (comment.object_id) {
        const target = canvas.getObjects().find((object) => (object as DDoneFabricObject).ddoneId === comment.object_id);
        if (target) {
          const objectBounds = target.getBoundingRect();
          if (comment.anchor_mode === "region") {
            x = objectBounds.left / Math.max(1, canvas.getWidth());
            y = objectBounds.top / Math.max(1, canvas.getHeight());
            width = objectBounds.width / Math.max(1, canvas.getWidth());
            height = objectBounds.height / Math.max(1, canvas.getHeight());
          } else {
            const center = target.getCenterPoint();
            x = center.x / Math.max(1, canvas.getWidth());
            y = center.y / Math.max(1, canvas.getHeight());
          }
        }
      }
      return [{
        comment,
        left: bounds.left + Math.max(0, Math.min(1, x)) * bounds.width,
        top: bounds.top + Math.max(0, Math.min(1, y)) * bounds.height,
        width: Math.max(22, width * bounds.width),
        height: Math.max(22, height * bounds.height),
        number: index + 1,
      }];
    });
  }, [comments, canvasMap, layoutRevision, dragAnchor]);

  const focus = (pin: PositionedPin) => {
    const pageId = pin.comment.page_id;
    if (!pageId) return;
    switchToPage(pageId); setActiveCanvas(pageId);
    const canvas = canvasMap.current.get(pageId);
    if (canvas && pin.comment.object_id) {
      const target = canvas.getObjects().find((object) => (object as DDoneFabricObject).ddoneId === pin.comment.object_id);
      if (target?.selectable) canvas.setActiveObject(target);
      canvas.requestRenderAll();
    }
    window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: "review" } }));
    window.dispatchEvent(new CustomEvent(REVIEW_COMMENT_FOCUS_EVENT, { detail: { commentId: pin.comment.id } }));
  };

  const startDrag = (event: PointerEvent, pin: PositionedPin) => {
    event.preventDefault(); event.stopPropagation();
    const pageId = pin.comment.page_id;
    const canvas = pageId ? canvasMap.current.get(pageId) : null;
    if (!canvas?.upperCanvasEl || !activeDesign?.id) return;
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const bounds = canvas.upperCanvasEl.getBoundingClientRect();
    const region = pin.comment.anchor_mode === "region";
    const update = (clientX: number, clientY: number) => {
      const x = Math.max(0, Math.min(region ? 1 - pin.width / bounds.width : 1, (clientX - bounds.left - (region ? pin.width / 2 : 0)) / bounds.width));
      const y = Math.max(0, Math.min(region ? 1 - pin.height / bounds.height : 1, (clientY - bounds.top - (region ? pin.height / 2 : 0)) / bounds.height));
      setDragAnchor({ commentId: pin.comment.id, x, y });
      return { x, y };
    };
    update(event.clientX, event.clientY);
    const move = (moveEvent: PointerEvent) => update(moveEvent.clientX, moveEvent.clientY);
    const end = async (endEvent: PointerEvent) => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      const anchor = update(endEvent.clientX, endEvent.clientY);
      setDragAnchor(null);
      await api("PATCH", `/api/designs/${activeDesign.id}/comments/${pin.comment.id}`, {
        anchorX: anchor.x,
        anchorY: anchor.y,
        objectId: null,
      }).catch(() => undefined);
      notifyReviewCommentsChanged();
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  };

  return (
    <div class="pointer-events-none fixed inset-0 z-[65]">
      {pins.map((pin) => pin.comment.anchor_mode === "region" ? (
        <button key={pin.comment.id} type="button" title="Trascina per spostare la regione" aria-label={`Apri regione commento ${pin.number}`} onPointerDown={(event) => startDrag(event as unknown as PointerEvent, pin)} onDoubleClick={() => focus(pin)} class="pointer-events-auto absolute rounded-lg border-2 border-violet-500 bg-violet-400/10 text-left cursor-move shadow-sm hover:bg-violet-400/20" style={{ left: `${pin.left}px`, top: `${pin.top}px`, width: `${pin.width}px`, height: `${pin.height}px` }}><span class="absolute -left-3 -top-3 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-violet-600 text-[9px] font-bold text-white shadow-lg">{pin.number}</span><span class="absolute bottom-1 right-1 rounded bg-violet-600/90 px-1.5 py-0.5 text-[7px] font-semibold text-white">{pin.comment.assigned_to_name ?? pin.comment.author_name}</span></button>
      ) : (
        <button key={pin.comment.id} type="button" title={`${pin.comment.author_name}: ${pin.comment.body} · trascina per riposizionare`} aria-label={`Apri commento ${pin.number}`} onPointerDown={(event) => startDrag(event as unknown as PointerEvent, pin)} onDoubleClick={() => focus(pin)} class="pointer-events-auto absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-violet-600 text-[9px] font-bold text-white shadow-lg cursor-move transition hover:scale-110 hover:bg-violet-700" style={{ left: `${pin.left}px`, top: `${pin.top}px` }}><MessageSquare size={11} class="absolute opacity-30" /><span class="relative">{pin.number}</span></button>
      ))}
    </div>
  );
}