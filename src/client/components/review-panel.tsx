import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { CheckCircle2, MessageSquarePlus, RefreshCw, Search, Send, Undo2 } from "lucide-preact";
import { api } from "../api";
import type { DDoneFabricObject } from "../canvas-model";
import { useEditor } from "../context";
import {
  REVIEW_COMMENT_FOCUS_EVENT,
  dispatchReviewCommentsLoaded,
  extractCommentMentions,
  notifyReviewCommentsChanged,
  type ReviewComment,
  type ReviewResponse,
  type ReviewStatus,
} from "../review-comments";

const STATUS_LABELS: Record<ReviewStatus, string> = {
  DRAFT: "Bozza",
  IN_REVIEW: "In revisione",
  CHANGES_REQUESTED: "Modifiche richieste",
  APPROVED: "Approvato",
};

type CommentStatusFilter = "open" | "resolved" | "all";
type CommentScopeFilter = "all" | "page" | "object";

export function ReviewPanel() {
  const {
    activeDesign,
    activePageId,
    selectedObject,
    canvasWidth,
    canvasHeight,
    canvasMap,
    setActiveCanvas,
    switchToPage,
  } = useEditor();
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [attachSelection, setAttachSelection] = useState(true);
  const [statusFilter, setStatusFilter] = useState<CommentStatusFilter>("open");
  const [scopeFilter, setScopeFilter] = useState<CommentScopeFilter>("all");
  const [query, setQuery] = useState("");
  const [replyingTo, setReplyingTo] = useState<ReviewComment | null>(null);
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const designId = activeDesign?.id;
  const selectedMetadata = selectedObject as DDoneFabricObject | null;
  const selectedObjectId = selectedMetadata?.ddoneId ?? null;

  const load = useCallback(async () => {
    if (!designId) return;
    setLoading(true);
    try {
      const result = await api<ReviewResponse>("GET", `/api/designs/${designId}/review`);
      result.comments = result.comments.map((comment) => ({
        ...comment,
        mentions: Array.isArray(comment.mentions) ? comment.mentions : [],
      }));
      setData(result);
      setNote(result.review.note ?? "");
      dispatchReviewCommentsLoaded(result.comments);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Revisione non disponibile");
    } finally {
      setLoading(false);
    }
  }, [designId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const focus = (event: Event) => {
      const commentId = (event as CustomEvent<{ commentId?: string }>).detail?.commentId;
      if (!commentId) return;
      setFocusedCommentId(commentId);
      setStatusFilter("all");
      setScopeFilter("all");
      window.setTimeout(() => {
        document.querySelector(`[data-review-comment-id="${commentId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    };
    window.addEventListener(REVIEW_COMMENT_FOCUS_EVENT, focus);
    return () => window.removeEventListener(REVIEW_COMMENT_FOCUS_EVENT, focus);
  }, []);

  const addComment = async () => {
    if (!designId || !body.trim()) return;
    const center = selectedObject?.getCenterPoint();
    const anchorX = center ? center.x / Math.max(1, canvasWidth) : 0.5;
    const anchorY = center ? center.y / Math.max(1, canvasHeight) : 0.5;
    try {
      await api("POST", `/api/designs/${designId}/comments`, {
        body: body.trim(),
        pageId: activePageId ?? null,
        objectId: attachSelection ? selectedObjectId : null,
        parentId: replyingTo?.id ?? null,
        anchorX,
        anchorY,
      });
      setBody("");
      setReplyingTo(null);
      notifyReviewCommentsChanged();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Commento non salvato");
    }
  };

  const toggleResolved = async (comment: ReviewComment) => {
    if (!designId) return;
    try {
      await api("PATCH", `/api/designs/${designId}/comments/${comment.id}`, {
        resolved: !comment.resolved_at,
      });
      notifyReviewCommentsChanged();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Commento non aggiornato");
    }
  };

  const updateStatus = async (status: ReviewStatus) => {
    if (!designId) return;
    try {
      await api("PUT", `/api/designs/${designId}/review`, { status, note: note.trim() || null });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Stato non aggiornato");
    }
  };

  const selectCommentTarget = (comment: ReviewComment) => {
    if (!comment.page_id) return;
    switchToPage(comment.page_id);
    setActiveCanvas(comment.page_id);
    window.setTimeout(() => {
      const targetCanvas = canvasMap.current.get(comment.page_id!);
      if (!targetCanvas) return;
      if (comment.object_id) {
        const target = targetCanvas.getObjects().find((object) => (object as DDoneFabricObject).ddoneId === comment.object_id);
        if (target?.selectable) targetCanvas.setActiveObject(target);
      }
      targetCanvas.requestRenderAll();
    }, 0);
  };

  const comments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.comments ?? []).filter((comment) => {
      if (statusFilter === "open" && comment.resolved_at) return false;
      if (statusFilter === "resolved" && !comment.resolved_at) return false;
      if (scopeFilter === "page" && comment.page_id !== activePageId) return false;
      if (scopeFilter === "object" && (!selectedObjectId || comment.object_id !== selectedObjectId)) return false;
      if (!normalizedQuery) return true;
      return `${comment.author_name} ${comment.body} ${(comment.mentions ?? []).join(" ")}`.toLowerCase().includes(normalizedQuery);
    });
  }, [data?.comments, statusFilter, scopeFilter, activePageId, selectedObjectId, query]);

  const status = data?.review.status ?? "DRAFT";
  const typedMentions = extractCommentMentions(body);

  return (
    <aside class="flex h-full w-[320px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 p-4 pt-12">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="m-0 text-xs font-semibold text-zinc-800">Revisione</h2>
            <p class="mt-1 text-[9px] text-zinc-400">Pin contestuali, risposte, filtri e approvazione.</p>
          </div>
          <button title="Aggiorna" onClick={() => void load()} class="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 cursor-pointer"><RefreshCw size={13} class={loading ? "animate-spin" : ""} /></button>
        </div>
        <span class={`mt-2 inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ${status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : status === "CHANGES_REQUESTED" ? "bg-red-100 text-red-700" : status === "IN_REVIEW" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600"}`}>{STATUS_LABELS[status]}</span>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        {!designId && <p class="text-[10px] text-zinc-400">Apri un progetto per usare la revisione.</p>}
        {error && <div class="mb-3 rounded-lg border border-red-100 bg-red-50 p-2 text-[9px] text-red-600">{error}</div>}

        {designId && (
          <>
            <section class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div class="mb-2 flex items-center gap-2"><MessageSquarePlus size={14} class="text-violet-600" /><strong class="text-[10px] text-zinc-700">{replyingTo ? `Risposta a ${replyingTo.author_name}` : "Nuovo commento"}</strong></div>
              {replyingTo && <button onClick={() => setReplyingTo(null)} class="mb-2 border-0 bg-transparent p-0 text-[8px] text-violet-600 cursor-pointer">Annulla risposta</button>}
              <textarea value={body} onInput={(event) => setBody((event.target as HTMLTextAreaElement).value)} rows={3} placeholder="Scrivi feedback o usa @nome per menzionare…" class="w-full resize-y rounded-lg border border-zinc-200 bg-white p-2 text-[10px] outline-none focus:border-violet-400" />
              <label class="mt-2 flex items-center gap-2 text-[9px] text-zinc-500">
                <input type="checkbox" checked={attachSelection} onChange={(event) => setAttachSelection((event.target as HTMLInputElement).checked)} />
                Pin sull’oggetto selezionato {selectedObjectId ? "" : "(centro pagina)"}
              </label>
              {typedMentions.length > 0 && <div class="mt-2 flex flex-wrap gap-1">{typedMentions.map((mention) => <span key={mention} class="rounded-full bg-violet-100 px-2 py-0.5 text-[7px] text-violet-700">@{mention}</span>)}</div>}
              <button disabled={!body.trim()} onClick={() => void addComment()} class="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-lg border-0 bg-violet-600 text-[9px] font-semibold text-white cursor-pointer disabled:opacity-40"><Send size={12} /> {replyingTo ? "Pubblica risposta" : "Pubblica commento"}</button>
              <p class="mb-0 mt-2 text-[7px] leading-relaxed text-zinc-400">Le menzioni vengono conservate nel thread; le notifiche email saranno abilitate in un rilascio successivo.</p>
            </section>

            {data?.canReview && (
              <section class="mt-3 rounded-xl border border-zinc-200 p-3">
                <strong class="mb-2 block text-[10px] text-zinc-700">Decisione</strong>
                <textarea value={note} onInput={(event) => setNote((event.target as HTMLTextAreaElement).value)} rows={2} placeholder="Nota per revisori o cliente…" class="w-full resize-y rounded-lg border border-zinc-200 p-2 text-[9px] outline-none focus:border-violet-400" />
                <div class="mt-2 grid grid-cols-2 gap-2">
                  <button onClick={() => void updateStatus("IN_REVIEW")} class="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-[8px] font-semibold text-amber-700 cursor-pointer">Richiedi revisione</button>
                  <button onClick={() => void updateStatus("CHANGES_REQUESTED")} class="rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-[8px] font-semibold text-red-700 cursor-pointer">Richiedi modifiche</button>
                  <button onClick={() => void updateStatus("APPROVED")} class="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-[8px] font-semibold text-emerald-700 cursor-pointer"><CheckCircle2 size={11} class="mr-1 inline" />Approva</button>
                  <button onClick={() => void updateStatus("DRAFT")} class="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-[8px] font-semibold text-zinc-600 cursor-pointer"><Undo2 size={11} class="mr-1 inline" />Torna a bozza</button>
                </div>
              </section>
            )}

            <section class="mt-4">
              <div class="flex items-center justify-between"><strong class="text-[10px] text-zinc-700">Commenti ({comments.length})</strong><span class="text-[8px] text-zinc-400">{data?.comments.length ?? 0} totali</span></div>
              <div class="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1">
                {(["open", "resolved", "all"] as const).map((value) => <button key={value} onClick={() => setStatusFilter(value)} class={`rounded-md border-0 px-1 py-1.5 text-[8px] font-semibold cursor-pointer ${statusFilter === value ? "bg-white text-violet-700 shadow-sm" : "bg-transparent text-zinc-500"}`}>{value === "open" ? "Aperti" : value === "resolved" ? "Risolti" : "Tutti"}</button>)}
              </div>
              <div class="mt-2 grid grid-cols-[1fr_104px] gap-2">
                <label class="relative"><Search size={11} class="absolute left-2 top-2.5 text-zinc-400" /><input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Cerca…" class="h-8 w-full rounded-lg border border-zinc-200 pl-7 pr-2 text-[9px] outline-none focus:border-violet-400" /></label>
                <select value={scopeFilter} onChange={(event) => setScopeFilter((event.target as HTMLSelectElement).value as CommentScopeFilter)} class="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[8px] outline-none focus:border-violet-400"><option value="all">Tutto</option><option value="page">Pagina</option><option value="object">Oggetto</option></select>
              </div>
            </section>

            <div class="mt-2">
              {comments.map((comment) => (
                <article
                  key={comment.id}
                  data-review-comment-id={comment.id}
                  class={`mb-2 rounded-xl border p-3 transition ${comment.parent_id ? "ml-4" : ""} ${focusedCommentId === comment.id ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : comment.resolved_at ? "border-zinc-200 bg-zinc-50 opacity-65" : "border-violet-100 bg-violet-50/40"}`}
                >
                  <button onClick={() => selectCommentTarget(comment)} class="w-full border-0 bg-transparent p-0 text-left cursor-pointer">
                    <div class="flex items-center justify-between gap-2"><strong class="text-[9px] text-zinc-700">{comment.author_name}</strong><span class="text-[7px] text-zinc-400">{new Date(comment.created_at).toLocaleString()}</span></div>
                    <p class="my-2 whitespace-pre-wrap text-[9px] leading-relaxed text-zinc-600">{comment.body}</p>
                    <span class="text-[7px] text-zinc-400">{comment.object_id ? "Pin su oggetto" : comment.page_id ? "Pin sulla pagina" : "Commento generale"}</span>
                    {(comment.mentions ?? []).length > 0 && <div class="mt-1 flex flex-wrap gap-1">{comment.mentions.map((mention) => <span key={mention} class="rounded bg-white px-1.5 py-0.5 text-[7px] text-violet-600">@{mention}</span>)}</div>}
                  </button>
                  <div class="mt-2 flex gap-2">
                    <button onClick={() => setReplyingTo(comment)} class="rounded-md border border-violet-200 bg-white px-2 py-1 text-[8px] text-violet-600 cursor-pointer">Rispondi</button>
                    <button onClick={() => void toggleResolved(comment)} class="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[8px] text-zinc-500 cursor-pointer">{comment.resolved_at ? "Riapri" : "Risolvi"}</button>
                  </div>
                </article>
              ))}
              {!loading && comments.length === 0 && <p class="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-[9px] text-zinc-400">Nessun commento corrisponde ai filtri.</p>}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
