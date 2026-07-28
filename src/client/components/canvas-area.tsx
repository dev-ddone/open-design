import { useRef, useEffect, useState } from "preact/hooks";
import { Plus, Copy, Trash2, MousePointer2 } from "lucide-preact";
import { useEditor } from "../context";
import { PageCanvas } from "./page-canvas";

export function CanvasArea() {
  const {
    pages,
    activePageId,
    setActiveCanvas,
    canvasWidth,
    canvasHeight,
    zoom,
    setZoomRaw,
    setFitScale,
    addPage,
    duplicatePage,
    deletePage,
    renamePage,
    readOnly,
    collaborators,
  } = useEditor();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const calculate = () => {
      const availableWidth = wrapper.clientWidth - 120;
      setFitScale(Math.min(availableWidth / canvasWidth, 1));
    };
    calculate();
    const observer = new ResizeObserver(calculate);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [canvasWidth, canvasHeight, setFitScale]);

  useEffect(() => { setZoomRaw(0.58); }, [canvasWidth, canvasHeight, setZoomRaw]);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const handler = (event: WheelEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      const previousZoom = zoomRef.current;
      const nextZoom = Math.min(Math.max(previousZoom * (event.deltaY > 0 ? 0.95 : 1.05), 0.05), 3);
      const rectangle = wrapper.getBoundingClientRect();
      const mouseX = event.clientX - rectangle.left + wrapper.scrollLeft;
      const mouseY = event.clientY - rectangle.top + wrapper.scrollTop;
      const scale = nextZoom / previousZoom;
      wrapper.scrollLeft = mouseX * scale - (event.clientX - rectangle.left);
      wrapper.scrollTop = mouseY * scale - (event.clientY - rectangle.top);
      setZoomRaw(nextZoom);
    };
    wrapper.addEventListener("wheel", handler, { passive: false });
    return () => wrapper.removeEventListener("wheel", handler);
  }, [setZoomRaw]);

  useEffect(() => {
    if (!activePageId && pages.length > 0) setActiveCanvas(pages[0].id);
  }, [pages, activePageId, setActiveCanvas]);

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
  const inverseScale = 1 / zoom;

  return (
    <div ref={wrapperRef} class="flex-1 overflow-auto bg-[#E8EAEF]">
      <div
        style={{
          width: Math.max((canvasWidth + 80) * zoom, wrapperRef.current?.clientWidth ?? 0),
          minHeight: "100%",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          class="flex flex-col items-center"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center top", padding: "40px 40px 80px" }}
        >
          {pages.map((page) => {
            const pageCollaborators = collaborators.filter((collaborator) => collaborator.cursor?.pageId === page.id);
            return (
              <div key={page.id} class="mb-10" data-page-id={page.id}>
                <div style={{ height: 32 * inverseScale, marginBottom: 4 * inverseScale }}>
                  <div
                    class="flex items-center justify-between py-1.5"
                    style={{ transform: `scale(${inverseScale})`, transformOrigin: "left top", width: canvasWidth * zoom, height: 32 }}
                  >
                    <div class="flex items-center gap-1.5">
                      {renamingId === page.id && !readOnly ? (
                        <input
                          ref={renameRef}
                          class="text-[11px] text-zinc-700 bg-white border border-[#6366f1] rounded px-1.5 py-0.5 outline-none font-medium"
                          style={{ width: 140 }}
                          value={renameValue}
                          onInput={(event) => setRenameValue((event.target as HTMLInputElement).value)}
                          onBlur={finishRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") finishRename();
                            if (event.key === "Escape") setRenamingId(null);
                          }}
                        />
                      ) : (
                        <span
                          class={`text-[11px] text-zinc-400 font-medium transition-colors ${readOnly ? "cursor-default" : "cursor-pointer hover:text-zinc-600"}`}
                          onClick={() => {
                            if (!readOnly) {
                              setRenamingId(page.id);
                              setRenameValue(page.title);
                            }
                          }}
                        >
                          {page.title}
                        </span>
                      )}
                      {pageCollaborators.length > 0 && (
                        <span class="text-[9px] text-zinc-400">· {pageCollaborators.length} here</span>
                      )}
                    </div>
                    {!readOnly && (
                      <div class="flex items-center gap-0.5">
                        <button class="p-1 rounded bg-transparent border-none cursor-pointer text-zinc-400 hover:text-[#6366f1] hover:bg-[#6366f1]/10" onClick={() => void addPage(page.id)} title="Add page below"><Plus size={14} /></button>
                        <button class="p-1 rounded bg-transparent border-none cursor-pointer text-zinc-400 hover:text-[#6366f1] hover:bg-[#6366f1]/10" onClick={() => void duplicatePage(page.id)} title="Duplicate page"><Copy size={14} /></button>
                        {pages.length > 1 && (
                          <button class="p-1 rounded bg-transparent border-none cursor-pointer text-zinc-400 hover:text-red-500 hover:bg-red-500/10" onClick={() => void deletePage(page.id)} title="Delete page"><Trash2 size={14} /></button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div class="relative" style={{ width: canvasWidth, height: canvasHeight }}>
                  <PageCanvas
                    page={page}
                    isActive={page.id === activePageId}
                    width={canvasWidth}
                    height={canvasHeight}
                    onActivate={() => setActiveCanvas(page.id)}
                  />
                  <div class="absolute inset-0 pointer-events-none overflow-visible z-20">
                    {pageCollaborators.map((collaborator) => (
                      <div
                        key={collaborator.clientId}
                        class="absolute transition-[left,top] duration-75 ease-linear"
                        style={{ left: collaborator.cursor!.x, top: collaborator.cursor!.y }}
                      >
                        <MousePointer2 size={22} fill={collaborator.color} style={{ color: collaborator.color, transform: "translate(-2px,-2px)" }} />
                        <span
                          class="absolute left-4 top-4 whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold text-white shadow-lg"
                          style={{ background: collaborator.color }}
                        >
                          {collaborator.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {!readOnly && (
            <div style={{ height: 40 * inverseScale }}>
              <div style={{ transform: `scale(${inverseScale})`, transformOrigin: "center top", height: 40 }}>
                <button class="flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 border-dashed border-zinc-300 bg-transparent cursor-pointer text-xs text-zinc-400 font-medium hover:border-[#6366f1] hover:text-[#6366f1] hover:bg-[#6366f1]/5" onClick={() => void addPage()}>
                  <Plus size={14} /> Add page
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
