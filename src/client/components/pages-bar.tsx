import { useState, useRef, useEffect } from "preact/hooks";
import { Plus, MoreHorizontal, Copy, Trash2, Pencil, ChevronUp, ChevronDown, Grid2X2 } from "lucide-preact";
import { useEditor } from "../context";
import { PageThumbnail } from "./page-thumbnail";
import { PagesOverview } from "./pages-overview";

export function PagesBar() {
  const { pages, activePageId, addPage, duplicatePage, deletePage, renamePage, switchToPage, setActiveCanvas, canvasWidth, canvasHeight, readOnly } = useEditor();
  const [expanded, setExpanded] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [menuPageId, setMenuPageId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const open = () => setShowOverview(true);
    window.addEventListener("ddone:open-pages-overview", open);
    return () => window.removeEventListener("ddone:open-pages-overview", open);
  }, []);
  useEffect(() => {
    if (!menuPageId) return;
    const close = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuPageId(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuPageId]);
  useEffect(() => { if (renamingId && renameRef.current) { renameRef.current.focus(); renameRef.current.select(); } }, [renamingId]);

  const finishRename = () => { if (!readOnly && renamingId && renameValue.trim()) void renamePage(renamingId, renameValue.trim()); setRenamingId(null); };
  const activate = (pageId: string) => { setActiveCanvas(pageId); switchToPage(pageId); document.querySelector(`[data-page-id="${pageId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  if (pages.length === 0) return null;

  return (
    <>
      <div class="shrink-0 border-t border-zinc-200 bg-white">
        <div class="flex items-center justify-between px-4 py-1.5"><button class="flex flex-1 items-center justify-between border-none bg-transparent p-0 text-left cursor-pointer hover:text-zinc-700" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}><span class="text-[11px] font-medium text-zinc-400">Pagine ({pages.length})</span>{expanded ? <ChevronDown size={14} class="text-zinc-400" /> : <ChevronUp size={14} class="text-zinc-400" />}</button><button onClick={() => setShowOverview(true)} class="ml-3 flex h-7 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-[8px] font-semibold text-zinc-500 cursor-pointer hover:border-violet-300 hover:text-violet-600" title="Apri panoramica pagine"><Grid2X2 size={12} /> Griglia</button></div>
        {expanded && <div class="flex items-center gap-2 overflow-x-auto border-t border-zinc-100 px-4 py-2">{pages.map((page) => { const active = page.id === activePageId; return <div key={page.id} class="group relative flex-shrink-0"><div class={`relative flex flex-col items-center gap-1 rounded-lg border-2 bg-white p-1 cursor-pointer ${active ? "border-[#6366f1] shadow-sm" : "border-zinc-200 hover:border-zinc-300"}`} onClick={() => activate(page.id)} style={{ width: 88 }}><div class="h-[50px] w-full overflow-hidden rounded bg-zinc-100 p-0.5"><PageThumbnail page={page} canvasWidth={canvasWidth} canvasHeight={canvasHeight} maxPixels={200} /></div>{!readOnly && <button aria-label={`Azioni ${page.title}`} class="absolute right-0.5 top-0.5 rounded border-none bg-white/80 p-0.5 opacity-0 cursor-pointer group-hover:opacity-100 hover:bg-zinc-100" onClick={(event) => { event.stopPropagation(); setMenuPageId(menuPageId === page.id ? null : page.id); }}><MoreHorizontal size={12} class="text-zinc-400" /></button>}</div><div class="mt-0.5 text-center" style={{ width: 88 }}>{renamingId === page.id && !readOnly ? <input ref={renameRef} class="w-full rounded border border-[#6366f1] bg-zinc-100 px-1 py-0 text-center text-[10px] text-zinc-700 outline-none" value={renameValue} onInput={(event) => setRenameValue((event.target as HTMLInputElement).value)} onBlur={finishRename} onKeyDown={(event) => { if (event.key === "Enter") finishRename(); if (event.key === "Escape") setRenamingId(null); }} /> : <span class={`block truncate text-[10px] ${active ? "font-medium text-zinc-800" : "text-zinc-500"}`}>{page.title}</span>}</div>{menuPageId === page.id && !readOnly && <div ref={menuRef} class="absolute bottom-full left-0 z-30 mb-1 min-w-[130px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"><button class="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-xs text-zinc-600 cursor-pointer hover:bg-zinc-100" onClick={() => { setMenuPageId(null); setRenamingId(page.id); setRenameValue(page.title); }}><Pencil size={12} /> Rinomina</button><button class="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-xs text-zinc-600 cursor-pointer hover:bg-zinc-100" onClick={() => { setMenuPageId(null); void duplicatePage(page.id); }}><Copy size={12} /> Duplica</button>{pages.length > 1 && <button class="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-xs text-red-500 cursor-pointer hover:bg-red-50" onClick={() => { setMenuPageId(null); void deletePage(page.id); }}><Trash2 size={12} /> Elimina</button>}</div>}</div>; })}{!readOnly && <button class="flex h-[62px] w-10 flex-shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-transparent cursor-pointer hover:border-[#6366f1] hover:bg-[#6366f1]/5" onClick={() => void addPage()} title="Aggiungi pagina"><Plus size={16} class="text-zinc-400" /></button>}</div>}
      </div>
      {showOverview && <PagesOverview onClose={() => setShowOverview(false)} />}
    </>
  );
}