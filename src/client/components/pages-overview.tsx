import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ChevronLeft, ChevronRight, Copy, GripVertical, Pencil, Plus, Search, Trash2, X } from "lucide-preact";
import { api } from "../api";
import { useEditor } from "../context";
import type { Page } from "../types";
import { PageThumbnail } from "./page-thumbnail";

interface PagesOverviewProps { onClose: () => void; }

export function PagesOverview({ onClose }: PagesOverviewProps) {
  const { pages, activePageId, activeDesign, canvasWidth, canvasHeight, readOnly, setActiveCanvas, switchToPage, addPage, duplicatePage, deletePage, renamePage, loadDesign } = useEditor();
  const [query, setQuery] = useState("");
  const [orderedPages, setOrderedPages] = useState<Page[]>(pages);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => setOrderedPages(pages), [pages]);
  useEffect(() => { if (renamingId) { renameRef.current?.focus(); renameRef.current?.select(); } }, [renamingId]);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [onClose]);

  const filteredPages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return orderedPages;
    return orderedPages.filter((page, index) => `${index + 1} ${page.title}`.toLowerCase().includes(normalized));
  }, [orderedPages, query]);

  const activate = (pageId: string) => {
    setActiveCanvas(pageId); switchToPage(pageId); onClose();
    window.setTimeout(() => document.querySelector(`[data-page-id="${pageId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  };

  const finishRename = async () => {
    const id = renamingId; const value = renameValue.trim(); setRenamingId(null);
    if (!id || !value || readOnly) return;
    setWorking(true);
    try { await renamePage(id, value); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Pagina non rinominata"); }
    finally { setWorking(false); }
  };

  const persistOrder = async (nextPages: Page[]) => {
    if (!activeDesign || readOnly) return;
    setWorking(true);
    try {
      await api<Page[]>("PUT", `/api/designs/${activeDesign.id}/pages/order`, { pageIds: nextPages.map((page) => page.id) });
      await loadDesign(activeDesign.id); setError(null);
    } catch (caught) {
      setOrderedPages(pages); setError(caught instanceof Error ? caught.message : "Ordine non salvato");
    } finally { setWorking(false); setDraggedId(null); setDropTargetId(null); }
  };

  const movePage = async (pageId: string, delta: number) => {
    if (readOnly || working || query.trim()) return;
    const index = orderedPages.findIndex((page) => page.id === pageId);
    const target = Math.max(0, Math.min(orderedPages.length - 1, index + delta));
    if (index < 0 || target === index) return;
    const next = [...orderedPages];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setOrderedPages(next);
    await persistOrder(next);
  };

  const drop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId || query.trim() || readOnly) return;
    const sourceIndex = orderedPages.findIndex((page) => page.id === draggedId);
    const targetIndex = orderedPages.findIndex((page) => page.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...orderedPages]; const [moved] = next.splice(sourceIndex, 1); next.splice(targetIndex, 0, moved);
    setOrderedPages(next); await persistOrder(next);
  };

  const duplicate = async (pageId: string) => { setWorking(true); try { await duplicatePage(pageId); setError(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "Pagina non duplicata"); } finally { setWorking(false); } };
  const remove = async (pageId: string) => { if (pages.length <= 1) return; setWorking(true); try { await deletePage(pageId); setError(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "Pagina non eliminata"); } finally { setWorking(false); } };
  const add = async () => { setWorking(true); try { await addPage(); setError(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "Pagina non aggiunta"); } finally { setWorking(false); } };

  return (
    <div class="fixed inset-0 z-[115] flex flex-col bg-zinc-100" role="dialog" aria-modal="true" aria-labelledby="pages-overview-title">
      <header class="flex min-h-16 items-center justify-between border-b border-zinc-200 bg-white px-5 py-3"><div><h2 id="pages-overview-title" class="m-0 text-sm font-semibold text-zinc-900">Panoramica pagine</h2><p class="mb-0 mt-1 text-[10px] text-zinc-500">{pages.length} pagine · trascina oppure usa frecce e Alt+←/→.</p></div><div class="flex items-center gap-2">{!readOnly && <button disabled={working} onClick={() => void add()} class="flex h-9 items-center gap-2 rounded-xl border-0 bg-violet-600 px-4 text-[10px] font-semibold text-white cursor-pointer disabled:opacity-40"><Plus size={14} /> Nuova pagina</button>}<button onClick={onClose} aria-label="Chiudi panoramica" class="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-500 cursor-pointer hover:bg-zinc-50"><X size={16} /></button></div></header>
      <div class="border-b border-zinc-200 bg-white px-5 py-3"><label class="relative block max-w-xl"><Search size={15} class="absolute left-3 top-2.5 text-zinc-400" /><input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Cerca per numero o titolo pagina…" class="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-3 text-xs outline-none focus:border-violet-400 focus:bg-white" /></label>{query.trim() && !readOnly && <p class="mb-0 mt-2 text-[8px] text-amber-600">Rimuovi il filtro per riordinare le pagine.</p>}{error && <p class="mb-0 mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[9px] text-red-600">{error}</p>}</div>
      <main class="flex-1 overflow-y-auto p-5"><div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">{filteredPages.map((page) => {
        const pageIndex = orderedPages.findIndex((item) => item.id === page.id); const active = page.id === activePageId; const dropTarget = page.id === dropTargetId && page.id !== draggedId;
        return <article key={page.id} tabIndex={0} aria-label={`Pagina ${pageIndex + 1}: ${page.title}`} draggable={!readOnly && !query.trim() && !working} onKeyDown={(event) => { if (!event.altKey) return; if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); void movePage(page.id, -1); } if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); void movePage(page.id, 1); } }} onDragStart={(event) => { setDraggedId(page.id); const transfer = event.dataTransfer; if (transfer) { transfer.effectAllowed = "move"; transfer.setData("text/plain", page.id); } }} onDragOver={(event) => { if (!draggedId || readOnly || query.trim()) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; setDropTargetId(page.id); }} onDragLeave={() => setDropTargetId((current) => current === page.id ? null : current)} onDrop={(event) => { event.preventDefault(); void drop(page.id); }} onDragEnd={() => { setDraggedId(null); setDropTargetId(null); }} class={`group relative rounded-2xl border bg-white p-3 shadow-sm outline-none transition focus:ring-2 focus:ring-violet-400 ${active ? "border-violet-500 ring-2 ring-violet-100" : dropTarget ? "border-violet-400 ring-2 ring-violet-100" : "border-zinc-200 hover:border-zinc-300 hover:shadow-md"} ${draggedId === page.id ? "opacity-45" : ""}`}>
          <button onClick={() => activate(page.id)} class="block w-full border-0 bg-transparent p-0 text-left cursor-pointer"><div class="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-zinc-100 p-2"><PageThumbnail page={page} canvasWidth={canvasWidth} canvasHeight={canvasHeight} maxPixels={480} className="h-full w-full object-contain" /><span class="absolute left-2 top-2 rounded-full bg-zinc-900/75 px-2 py-1 text-[8px] font-semibold text-white">{pageIndex + 1}</span>{!readOnly && !query.trim() && <span class="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-zinc-400 opacity-0 shadow-sm transition group-hover:opacity-100"><GripVertical size={14} /></span>}</div></button>
          <div class="mt-3 flex min-w-0 items-center justify-between gap-2">{renamingId === page.id && !readOnly ? <input ref={renameRef} value={renameValue} onInput={(event) => setRenameValue((event.target as HTMLInputElement).value)} onBlur={() => void finishRename()} onKeyDown={(event) => { if (event.key === "Enter") void finishRename(); if (event.key === "Escape") setRenamingId(null); }} class="h-8 min-w-0 flex-1 rounded-lg border border-violet-400 px-2 text-[10px] outline-none" /> : <button onClick={() => activate(page.id)} class="min-w-0 flex-1 border-0 bg-transparent p-0 text-left cursor-pointer"><strong class="block truncate text-[10px] text-zinc-800">{page.title}</strong><span class="text-[8px] text-zinc-400">Posizione {pageIndex + 1}</span></button>}
            {!readOnly && <div class="flex shrink-0 gap-1"><button disabled={working || pageIndex === 0 || Boolean(query.trim())} title="Sposta prima" aria-label={`Sposta ${page.title} prima`} onClick={() => void movePage(page.id, -1)} class="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 cursor-pointer hover:bg-zinc-50 disabled:opacity-30"><ChevronLeft size={12} /></button><button disabled={working || pageIndex === orderedPages.length - 1 || Boolean(query.trim())} title="Sposta dopo" aria-label={`Sposta ${page.title} dopo`} onClick={() => void movePage(page.id, 1)} class="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 cursor-pointer hover:bg-zinc-50 disabled:opacity-30"><ChevronRight size={12} /></button><button disabled={working} title="Rinomina" onClick={() => { setRenamingId(page.id); setRenameValue(page.title); }} class="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 cursor-pointer hover:bg-zinc-50 disabled:opacity-40"><Pencil size={12} /></button><button disabled={working} title="Duplica" onClick={() => void duplicate(page.id)} class="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 cursor-pointer hover:bg-zinc-50 disabled:opacity-40"><Copy size={12} /></button><button disabled={working || pages.length <= 1} title="Elimina" onClick={() => void remove(page.id)} class="grid h-8 w-8 place-items-center rounded-lg border border-red-100 bg-red-50 text-red-500 cursor-pointer hover:bg-red-100 disabled:opacity-30"><Trash2 size={12} /></button></div>}
          </div>
        </article>;
      })}</div>{filteredPages.length === 0 && <div class="mx-auto mt-20 max-w-sm rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center"><Search size={24} class="mx-auto text-zinc-300" /><p class="mb-0 mt-3 text-[10px] text-zinc-500">Nessuna pagina corrisponde alla ricerca.</p></div>}</main>
    </div>
  );
}