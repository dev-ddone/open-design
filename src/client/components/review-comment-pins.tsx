import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { MessageSquare } from "lucide-preact";
import { api } from "../api";
import type { DDoneFabricObject } from "../canvas-model";
import { useEditor } from "../context";
import {
  REVIEW_COMMENT_FOCUS_EVENT,
  REVIEW_COMMENTS_CHANGED_EVENT,
  REVIEW_COMMENTS_LOADED_EVENT,
  type ReviewComment,
  type ReviewResponse,
} from "../review-comments";

interface PositionedPin {
  comment: ReviewComment;
  left: number;
  top: number;
  number: number;
}

export function ReviewCommentPins() {
  const { activeDesign, canvasMap, setActiveCanvas, switchToPage } = useEditor();
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [layoutRevision, setLayoutRevision] = useState(0);

  const load = useCallback(async () => {
    if (!activeDesign?.id) {
      setComments([]);
      return;
    }
    try {
      const result = await api<ReviewResponse>("GET", `/api/designs/${activeDesign.id}/review`);
      setComments(result.comments);
    } catch {
      setComments([]);
    }
  }, [activeDesign?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const loaded = (event: Event) => {
      const next = (event as CustomEvent<{ comments?: ReviewComment[] }>).detail?.comments;
      if (Array.isArray(next)) setComments(next);
    };
    const changed = () => void load();
    window.addEventListener(REVIEW_COMMENTS_LOADED_EVENT, loaded);
    window.addEventListener(REVIEW_COMMENTS_CHANGED_EVENT, changed);
    return () => {
      window.removeEventListener(REVIEW_COMMENTS_LOADED_EVENT, loaded);
      window.removeEventListener(REVIEW_COMMENTS_CHANGED_EVENT, changed);
    };
  }, [load]);

  useEffect(() => {
    const refresh = () => setLayoutRevision((value) => value + 1);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    const timer = window.setInterval(refresh, 900);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      window.clearInterval(timer);
    };
  }, []);

  const pins = useMemo<PositionedPin[]>(() => {
    void layoutRevision;
    const openComments = comments.filter((comment) => !comment.resolved_at && comment.page_id);
    return openComments.flatMap((comment, index) => {
      const canvas = comment.page_id ? canvasMap.current.get(comment.page_id) : null;
      if (!canvas?.upperCanvasEl) return [];
      const bounds = canvas.upperCanvasEl.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return [];

      let x = comment.anchor_x ?? 0.5;
      let y = comment.anchor_y ?? 0.5;
      if (comment.object_id) {
        const target = canvas.getObjects().find((object) => (object as DDoneFabricObject).ddoneId === comment.object_id);
        if (target) {
          const center = target.getCenterPoint();
          x = center.x / Math.max(1, canvas.getWidth());
          y = center.y / Math.max(1, canvas.getHeight());
        }
      }

      return [{
        comment,
        left: bounds.left + Math.max(0, Math.min(1, x)) * bounds.width,
        top: bounds.top + Math.max(0, Math.min(1, y)) * bounds.height,
        number: index + 1,
      }];
    });
  }, [comments, canvasMap, layoutRevision]);

  const focus = (pin: PositionedPin) => {
    const pageId = pin.comment.page_id;
    if (!pageId) return;
    switchToPage(pageId);
    setActiveCanvas(pageId);
    const canvas = canvasMap.current.get(pageId);
    if (canvas && pin.comment.object_id) {
      const target = canvas.getObjects().find((object) => (object as DDoneFabricObject).ddoneId === pin.comment.object_id);
      if (target?.selectable) canvas.setActiveObject(target);
      canvas.requestRenderAll();
    }
    window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: "review" } }));
    window.dispatchEvent(new CustomEvent(REVIEW_COMMENT_FOCUS_EVENT, { detail: { commentId: pin.comment.id } }));
  };

  return (
    <div class="pointer-events-none fixed inset-0 z-[65]">
      {pins.map((pin) => (
        <button
          key={pin.comment.id}
          type="button"
          title={`${pin.comment.author_name}: ${pin.comment.body}`}
          aria-label={`Apri commento ${pin.number}`}
          onClick={() => focus(pin)}
          class="pointer-events-auto absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-violet-600 text-[9px] font-bold text-white shadow-lg cursor-pointer transition hover:scale-110 hover:bg-violet-700"
          style={{ left: `${pin.left}px`, top: `${pin.top}px` }}
        >
          <MessageSquare size={11} class="absolute opacity-30" />
          <span class="relative">{pin.number}</span>
        </button>
      ))}
    </div>
  );
}
