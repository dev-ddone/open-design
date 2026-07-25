import { useState, useRef, useEffect } from "preact/hooks";
import * as fabric from "fabric";
import { Plus, MoreHorizontal, Copy, Trash2, Pencil, ChevronUp, ChevronDown } from "lucide-preact";
import { useEditor } from "../context";
import type { Page } from "../types";

function PageThumb({ page, width, height }: { page: Page; width: number; height: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const previousJson = useRef("");

  useEffect(() => {
    if (page.canvas_json === previousJson.current) return;
    previousJson.current = page.canvas_json;
    const element = document.createElement("canvas");
    const canvas = new fabric.StaticCanvas(element, { width, height });
    try {
      canvas.loadFromJSON(JSON.parse(page.canvas_json)).then(() => {
        canvas.renderAll();
        setSrc(canvas.toDataURL({ format: "png", multiplier: Math.min(200 / width, 200 / height, 1) }));
        canvas.dispose();
      });
    } catch {
      canvas.dispose();
    }
  }, [page.canvas_json, width, height]);

  return src ? (
    <img src={src} class="rounded w-full h-full object-cover" alt={page.title} />
  ) : (
    <div class="rounded w-full h-full bg-zinc-100" />
  );
}

export function PagesBar() {
  const {
    pages,
    activePageId,
    addPage,
    duplicatePage,
    deletePage,
    renamePage,
    switchToPage,
    setActiveCanvas,
    canvasWidth,
    canvasHeight,
    readOnly,
  } = useEditor();
  const [expanded, setExpanded] = useState(false);
  const [menuPageId, setMenuPageId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuPageId) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuPageId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuPageId]);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  const finishRename = () => {
    if (!readOnly && renamingId && renameValue.trim()) void renamePage(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  const activate = (pageId: string) => {
    setActiveCanvas(pageId);
    switchToPage(pageId);
    document.querySelector(`[data-page-id="${pageId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (pages.length === 0) return null;

  return (
    <div class="bg-white border-t border-zinc-200 shrink-0">
      <button
        class="w-full flex items-center justify-between px-4 py-1.5 bg-transparent border-none cursor-pointer hover:bg-zinc-50"
        onClick={() => setExpanded(!expanded)}
      >
        <span class="text-[11px] text-zinc-400 font-medium">Pages ({pages.length})</span>
        {expanded ? <ChevronDown size={14} class="text-zinc-400" /> : <ChevronUp size={14} class="text-zinc-400" />}
      </button>

      {expanded && (
        <div class="flex items-center gap-2 px-4 py-2 border-t border-zinc-100 overflow-x-auto">
          {pages.map((page) => {
            const active = page.id === activePageId;
            return (
              <div key={page.id} class="relative flex-shrink-0 group">
                <div
                  class={`relative flex flex-col items-center gap-1 cursor-pointer border-2 rounded-lg p-1 bg-white ${
                    active ? "border-[#6366f1] shadow-sm" : "border-zinc-200 hover:border-zinc-300"
                  }`}
                  onClick={() => activate(page.id)}
                  style={{ width: 88 }}
                >
                  <div class="rounded w-full overflow-hidden" style={{ height: 50 }}>
                    <PageThumb page={page} width={canvasWidth} height={canvasHeight} />
                  </div>
                  {!readOnly && (
                    <button
                      class="absolute top-0.5 right-0.5 p-0.5 rounded bg-white/80 border-none cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-zinc-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMenuPageId(menuPageId === page.id ? null : page.id);
                      }}
                    >
                      <MoreHorizontal size={12} class="text-zinc-400" />
                    </button>
                  )}
                </div>
                <div class="mt-0.5 text-center" style={{ width: 88 }}>
                  {renamingId === page.id && !readOnly ? (
                    <input
                      ref={renameRef}
                      class="w-full text-center text-[10px] text-zinc-700 bg-zinc-100 border border-[#6366f1] rounded px-1 py-0 outline-none"
                      value={renameValue}
                      onInput={(event) => setRenameValue((event.target as HTMLInputElement).value)}
                      onBlur={finishRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") finishRename();
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <span class={`text-[10px] truncate block ${active ? "text-zinc-800 font-medium" : "text-zinc-500"}`}>
                      {page.title}
                    </span>
                  )}
                </div>

                {menuPageId === page.id && !readOnly && (
                  <div ref={menuRef} class="absolute bottom-full left-0 mb-1 bg-white border border-zinc-200 rounded-lg shadow-lg z-30 min-w-[130px] py-1">
                    <button
                      class="w-full text-left px-3 py-1.5 text-xs text-zinc-600 bg-transparent border-none cursor-pointer hover:bg-zinc-100 flex items-center gap-2"
                      onClick={() => {
                        setMenuPageId(null);
                        setRenamingId(page.id);
                        setRenameValue(page.title);
                      }}
                    >
                      <Pencil size={12} /> Rename
                    </button>
                    <button
                      class="w-full text-left px-3 py-1.5 text-xs text-zinc-600 bg-transparent border-none cursor-pointer hover:bg-zinc-100 flex items-center gap-2"
                      onClick={() => {
                        setMenuPageId(null);
                        void duplicatePage(page.id);
                      }}
                    >
                      <Copy size={12} /> Duplicate
                    </button>
                    {pages.length > 1 && (
                      <button
                        class="w-full text-left px-3 py-1.5 text-xs text-red-500 bg-transparent border-none cursor-pointer hover:bg-red-50 flex items-center gap-2"
                        onClick={() => {
                          setMenuPageId(null);
                          void deletePage(page.id);
                        }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!readOnly && (
            <button
              class="flex-shrink-0 flex items-center justify-center w-10 h-[62px] rounded-lg border-2 border-dashed border-zinc-300 bg-transparent cursor-pointer hover:border-[#6366f1] hover:bg-[#6366f1]/5"
              onClick={() => void addPage()}
              title="Add page"
            >
              <Plus size={16} class="text-zinc-400" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
