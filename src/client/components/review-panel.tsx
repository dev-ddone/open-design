import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { CheckCircle2, MessageSquarePlus, RefreshCw, Send, Undo2 } from "lucide-preact";
import { api } from "../api";
import type { DDoneFabricObject } from "../canvas-model";
import { useEditor } from "../context";

type ReviewStatus = "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED";

interface ReviewRecord {
  status: ReviewStatus;
  note: string | null;
  requested_at: string | null;
  reviewed_at: string | null;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
}

interface ReviewComment {
  id: string;
  page_id: string | null;
  object_id: string | null;
  body: string;
  author_id: string;
  author_name: string;
  resolved_at: string | null;
  resolved_by_name?: string | null;
  created_at: string;
}

interface ReviewResponse {
  review: ReviewRecord;
  comments: ReviewComment[];
  canReview: boolean;
}

const STATUS_LABELS: Record<ReviewStatus, string> = {
  DRAFT: "Bozza",
  IN_REVIEW: "In revisione",
  CHANGES_REQUESTED: "Modifiche richieste",
  APPROVED: "Approvato",
};

export function ReviewPanel() {
  const { activeDesign, activePageId, canvas } = useEditor();
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [attachSelection, setAttachSelection] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const designId = activeDesign?.id;
  const selectedObjectId = useMemo(() => {
    const object = canvas?.getActiveObject() as DDoneFabricObject | undefined;
    return object?.ddoneId ?? null;
  }, [canvas, canvas?.getActiveObject()]);

  const load = useCallback(async () => {
    if (!designId) return;
    setLoading(true);
    try {
      const result = await api<ReviewResponse>("GET", `/api/designs/${designId}/review`);
      setData(result);
      setNote(result.review.note ?? "");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Revisione non disponibile");
    } finally {
      setLoading(false);
    }
  }, [designId]);

  useEffect(() => { void load(); }, [load]);

  const addComment = async () => {
    if (!designId || !body.trim()) return;
    try {
      await api("POST", `/api/designs/${designId}/comments`, {
        body: body.trim(),
        pageId: activePageId ?? null,
        objectId: attachSelection ? selectedObjectId : null,
      });
      setBody("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Commento non salvato");
    }
  };

  const toggleResolved = async (comment: ReviewComment) => {
    if (!designId) return;
    try {
      await api("PATCH", `/api/designs/${designId}/comments/${comment.id}`, {});
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

  const selectCommentObject = (comment: ReviewComment) => {
    if (!canvas || !comment.object_id) return;
    const target = canvas.getObjects().find((object) => (object as DDoneFabricObject).ddoneId === comment.object_id);
    if (!target || !target.selectable) return;
    canvas.setActiveObject(target);
    canvas.requestRenderAll();
  };

  const comments = (data?.comments ?? []).filter((comment) => showResolved || !comment.resolved_at);
  const status = data?.review.status ?? "DRAFT";

  return (
    <aside class="flex h-full w-[300px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 p-4 pt-12">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="m-0 text-xs font-semibold text-zinc-800">Revisione</h2>
            <p class="mt-1 text-[9px] text-zinc-400">Commenti su pagina e oggetti, richiesta e approvazione.</p>
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
              <div class="mb-2 flex items-center gap-2"><MessageSquarePlus size={14} class="text-violet-600" /><strong class="text-[10px] text-zinc-700">Nuovo commento</strong></div>
              <textarea value={body} onInput={(event) => setBody((event.target as HTMLTextAreaElement).value)} rows={3} placeholder="Scrivi una richiesta o un feedback…" class="w-full resize-y rounded-lg border border-zinc-200 bg-white p-2 text-[10px] outline-none focus:border-violet-400" />
              <label class="mt-2 flex items-center gap-2 text-[9px] text-zinc-500">
                <input type="checkbox" checked={attachSelection} onChange={(event) => setAttachSelection((event.target as HTMLInputElement).checked)} />
                Collega all’oggetto selezionato {selectedObjectId ? "" : "(nessun oggetto)"}
              </label>
              <button disabled={!body.trim()} onClick={() => void addComment()} class="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-lg border-0 bg-violet-600 text-[9px] font-semibold text-white cursor-pointer disabled:opacity-40"><Send size={12} /> Pubblica commento</button>
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

            <div class="mt-4 flex items-center justify-between">
              <strong class="text-[10px] text-zinc-700">Commenti ({comments.length})</strong>
              <label class="flex items-center gap-1 text-[8px] text-zinc-400"><input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved((event.target as HTMLInputElement).checked)} /> risolti</label>
            </div>

            <div class="mt-2">
              {comments.map((comment) => (
                <article key={comment.id} class={`mb-2 rounded-xl border p-3 ${comment.resolved_at ? "border-zinc-200 bg-zinc-50 opacity-65" : "border-violet-100 bg-violet-50/40"}`}>
                  <button onClick={() => selectCommentObject(comment)} class="w-full border-0 bg-transparent p-0 text-left cursor-pointer">
                    <div class="flex items-center justify-between gap-2"><strong class="text-[9px] text-zinc-700">{comment.author_name}</strong><span class="text-[7px] text-zinc-400">{new Date(comment.created_at).toLocaleString()}</span></div>
                    <p class="my-2 whitespace-pre-wrap text-[9px] leading-relaxed text-zinc-600">{comment.body}</p>
                    <span class="text-[7px] text-zinc-400">{comment.object_id ? "Oggetto collegato" : comment.page_id ? "Pagina collegata" : "Commento generale"}</span>
                  </button>
                  <button onClick={() => void toggleResolved(comment)} class="mt-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[8px] text-zinc-500 cursor-pointer">{comment.resolved_at ? "Riapri" : "Risolvi"}</button>
                </article>
              ))}
              {!loading && comments.length === 0 && <p class="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-[9px] text-zinc-400">Nessun commento aperto.</p>}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
