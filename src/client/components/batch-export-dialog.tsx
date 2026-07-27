import { useMemo, useState } from "preact/hooks";
import { Archive, CheckSquare2, Download, Square, X } from "lucide-preact";
import { api } from "../api";
import { useEditor } from "../context";
import type { DesignWithPages } from "../types";
import {
  buildBatchExportZip,
  downloadBatchZip,
  type BatchExportProgress,
  type BatchImageFormat,
} from "../export/batch-zip";

interface BatchExportDialogProps { onClose: () => void; }

const FORMATS: Array<{ value: BatchImageFormat; label: string; detail: string }> = [
  { value: "png", label: "PNG", detail: "qualità e trasparenza" },
  { value: "jpg", label: "JPG", detail: "file più leggeri" },
  { value: "svg", label: "SVG", detail: "vettoriale modificabile" },
  { value: "json", label: "JSON", detail: "sorgente Fabric" },
];

export function BatchExportDialog({ onClose }: BatchExportDialogProps) {
  const { designs, activeDesign, saveDesign } = useEditor();
  const [selectedIds, setSelectedIds] = useState<string[]>(activeDesign ? [activeDesign.id] : []);
  const [formats, setFormats] = useState<BatchImageFormat[]>(["png"]);
  const [scale, setScale] = useState(2);
  const [progress, setProgress] = useState<BatchExportProgress | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDesigns = useMemo(() => designs.filter((design) => selectedIds.includes(design.id)), [designs, selectedIds]);
  const toggleDesign = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleFormat = (format: BatchImageFormat) => setFormats((current) => current.includes(format) ? current.filter((value) => value !== format) : [...current, format]);

  const run = async () => {
    if (selectedIds.length === 0 || formats.length === 0) return;
    setWorking(true);
    setError(null);
    try {
      if (activeDesign && selectedIds.includes(activeDesign.id)) await saveDesign();
      const projects = await Promise.all(selectedIds.map((id) => api<DesignWithPages>("GET", `/api/designs/${id}`)));
      const blob = await buildBatchExportZip({ projects, formats, scale, onProgress: setProgress });
      const archiveName = selectedIds.length === 1 ? projects[0].name : `DDone-campagna-${new Date().toISOString().slice(0, 10)}`;
      downloadBatchZip(blob, archiveName);
      await Promise.all(projects.map((project) => api("POST", `/api/designs/${project.id}/governance`, {
        eventType: "BATCH_EXPORT",
        payload: { formats, scale, projectCount: projects.length, pageCount: projects.reduce((sum, item) => sum + item.pages.length, 0) },
      })));
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Esportazione ZIP non riuscita");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div class="fixed inset-0 z-[130] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="batch-export-title">
      <div class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header class="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div class="flex items-center gap-3"><span class="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><Archive size={19} /></span><div><h2 id="batch-export-title" class="m-0 text-sm font-semibold text-zinc-900">Export batch ZIP</h2><p class="mb-0 mt-1 text-[9px] text-zinc-500">Pagine e campagne in più formati con manifest.</p></div></div>
          <button onClick={onClose} disabled={working} class="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-500 cursor-pointer disabled:opacity-40"><X size={16} /></button>
        </header>

        <div class="grid min-h-0 flex-1 md:grid-cols-[1.15fr_0.85fr]">
          <section class="min-h-0 overflow-y-auto border-r border-zinc-200 p-5">
            <div class="mb-3 flex items-center justify-between"><strong class="text-[10px] text-zinc-700">Progetti e campagne</strong><button onClick={() => setSelectedIds(selectedIds.length === designs.length ? [] : designs.map((design) => design.id))} class="border-0 bg-transparent text-[8px] text-violet-600 cursor-pointer">{selectedIds.length === designs.length ? "Deseleziona tutti" : "Seleziona tutti"}</button></div>
            <div class="flex flex-col gap-2">
              {designs.map((design) => {
                const selected = selectedIds.includes(design.id);
                return <button key={design.id} onClick={() => toggleDesign(design.id)} class={`flex items-center gap-3 rounded-xl border p-3 text-left cursor-pointer ${selected ? "border-violet-300 bg-violet-50" : "border-zinc-200 bg-white hover:border-zinc-300"}`}>{selected ? <CheckSquare2 size={16} class="text-violet-600" /> : <Square size={16} class="text-zinc-300" />}<span class="min-w-0"><strong class="block truncate text-[10px] text-zinc-800">{design.name}</strong><span class="text-[8px] text-zinc-400">{design.width} × {design.height}{design.id === activeDesign?.id ? " · aperto" : ""}</span></span></button>;
              })}
            </div>
          </section>

          <section class="overflow-y-auto p-5">
            <strong class="text-[10px] text-zinc-700">Formati</strong>
            <div class="mt-2 grid grid-cols-2 gap-2">{FORMATS.map((item) => { const selected = formats.includes(item.value); return <button key={item.value} onClick={() => toggleFormat(item.value)} class={`rounded-xl border p-3 text-left cursor-pointer ${selected ? "border-violet-300 bg-violet-50" : "border-zinc-200 bg-white"}`}><strong class="block text-[10px] text-zinc-800">{item.label}</strong><span class="text-[8px] text-zinc-400">{item.detail}</span></button>; })}</div>
            <label class="mt-4 block text-[9px] font-semibold text-zinc-500">Scala raster: {scale}×<input type="range" min="0.5" max="4" step="0.5" value={scale} onInput={(event) => setScale(Number((event.target as HTMLInputElement).value))} class="mt-2 w-full accent-violet-600" /></label>
            <div class="mt-4 rounded-xl bg-zinc-50 p-3 text-[8px] leading-relaxed text-zinc-500"><strong class="block text-[9px] text-zinc-700">Riepilogo</strong>{selectedDesigns.length} progetti selezionati · {formats.length} formati. Il file include `manifest.json` con dimensioni, pagine e timestamp.</div>
            {progress && <div class="mt-4"><div class="mb-1 flex justify-between text-[8px] text-zinc-500"><span class="truncate">{progress.current}</span><span>{progress.percent}%</span></div><div class="h-2 overflow-hidden rounded-full bg-zinc-100"><div class="h-full bg-violet-600 transition-all" style={{ width: `${progress.percent}%` }} /></div></div>}
            {error && <p class="mt-3 rounded-lg border border-red-100 bg-red-50 p-2 text-[9px] text-red-600">{error}</p>}
          </section>
        </div>

        <footer class="flex items-center justify-between border-t border-zinc-200 px-5 py-4"><span class="text-[8px] text-zinc-400">Limite di sicurezza: 2.000 file per archivio.</span><button disabled={working || selectedIds.length === 0 || formats.length === 0} onClick={() => void run()} class="flex h-10 items-center gap-2 rounded-xl border-0 bg-violet-600 px-5 text-[10px] font-semibold text-white cursor-pointer disabled:opacity-40"><Download size={14} /> {working ? "Preparazione…" : "Crea ZIP"}</button></footer>
      </div>
    </div>
  );
}