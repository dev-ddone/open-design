import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { BadgeCheck, Download, FileText, RefreshCw, ShieldAlert } from "lucide-preact";
import { api } from "../api";
import {
  attributionReportCsv,
  attributionReportMarkdown,
  collectAttributions,
  downloadTextFile,
} from "../canvas/attribution-report";
import { auditDesign, type DesignAuditReport } from "../canvas/design-audit";
import type { DDoneFabricObject } from "../canvas-model";
import { useEditor } from "../context";
import type { BrandKit } from "../types";

function safeFilename(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "design";
}

export function DesignAuditPanel() {
  const { canvas, canvasWidth, canvasHeight, activeDesign } = useEditor();
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [selectedKitId, setSelectedKitId] = useState("");
  const [report, setReport] = useState<DesignAuditReport | null>(null);
  const [loadingKits, setLoadingKits] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api<BrandKit[] | { brandKits?: BrandKit[] }>("GET", "/api/brand-kits")
      .then((result) => {
        if (cancelled) return;
        const kits = Array.isArray(result) ? result : result.brandKits ?? [];
        setBrandKits(kits);
        const preferred = kits.find((kit) => kit.is_default) ?? kits[0];
        setSelectedKitId(preferred?.id ?? "");
      })
      .catch(() => setBrandKits([]))
      .finally(() => { if (!cancelled) setLoadingKits(false); });
    return () => { cancelled = true; };
  }, []);

  const activeKit = useMemo(
    () => brandKits.find((kit) => kit.id === selectedKitId) ?? null,
    [brandKits, selectedKitId],
  );

  const scan = useCallback(() => {
    if (!canvas) {
      setReport(null);
      return;
    }
    setReport(auditDesign(canvas, canvasWidth, canvasHeight, activeKit));
  }, [canvas, canvasWidth, canvasHeight, activeKit]);

  useEffect(() => {
    scan();
    if (!canvas) return;
    const refresh = () => scan();
    canvas.on("object:added", refresh);
    canvas.on("object:removed", refresh);
    canvas.on("object:modified", refresh);
    return () => {
      canvas.off("object:added", refresh);
      canvas.off("object:removed", refresh);
      canvas.off("object:modified", refresh);
    };
  }, [canvas, scan]);

  const selectObject = (objectId?: string) => {
    if (!canvas || !objectId) return;
    const target = canvas.getObjects().find((object) => (object as DDoneFabricObject).ddoneId === objectId);
    if (!target || !target.selectable) return;
    canvas.setActiveObject(target);
    canvas.requestRenderAll();
  };

  const downloadAttributions = (format: "csv" | "md") => {
    if (!canvas) return;
    const entries = collectAttributions(canvas);
    const designName = activeDesign?.name ?? "Design";
    const filename = `${safeFilename(designName)}-attributions.${format}`;
    if (format === "csv") {
      downloadTextFile(filename, attributionReportCsv(entries), "text/csv;charset=utf-8");
    } else {
      downloadTextFile(filename, attributionReportMarkdown(entries, designName), "text/markdown;charset=utf-8");
    }
  };

  const attributionCount = canvas ? collectAttributions(canvas).length : 0;

  return (
    <aside class="flex h-full w-[300px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 p-4 pt-12">
        <div class="mb-1 flex items-center gap-2">
          <BadgeCheck size={16} class="text-emerald-600" />
          <h2 class="m-0 text-xs font-semibold text-zinc-800">Controllo design</h2>
        </div>
        <p class="m-0 text-[9px] leading-relaxed text-zinc-400">Verifica layout, template, leggibilità, brand e attribuzioni richieste.</p>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <label class="block text-[9px] font-semibold text-zinc-500">
          Brand kit
          <select disabled={loadingKits} value={selectedKitId} onChange={(event) => setSelectedKitId((event.target as HTMLSelectElement).value)} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-emerald-400">
            <option value="">Nessun controllo brand</option>
            {brandKits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}{kit.is_default ? " · predefinito" : ""}</option>)}
          </select>
        </label>

        <button onClick={scan} class="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-[10px] font-semibold text-zinc-700 cursor-pointer hover:border-emerald-300">
          <RefreshCw size={13} /> Riesegui controllo
        </button>

        <section class="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2"><FileText size={13} class="text-zinc-500" /><strong class="text-[9px] text-zinc-700">Attribuzioni</strong></div><span class="text-[8px] text-zinc-400">{attributionCount}</span></div>
          <p class="my-2 text-[8px] leading-relaxed text-zinc-400">Esporta sorgente, autore, licenza e testo richiesto dalle risorse usate nella pagina.</p>
          <div class="grid grid-cols-2 gap-2">
            <button onClick={() => downloadAttributions("csv")} class="flex h-8 items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white text-[8px] text-zinc-600 cursor-pointer"><Download size={11} /> CSV</button>
            <button onClick={() => downloadAttributions("md")} class="flex h-8 items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white text-[8px] text-zinc-600 cursor-pointer"><Download size={11} /> Markdown</button>
          </div>
        </section>

        {report && (
          <>
            <div class="mt-3 grid grid-cols-[86px_1fr] gap-3 rounded-xl border border-zinc-200 bg-white p-3">
              <div class={`grid h-[72px] w-[72px] place-items-center rounded-full border-4 text-xl font-bold ${report.score >= 85 ? "border-emerald-400 text-emerald-600" : report.score >= 60 ? "border-amber-400 text-amber-600" : "border-red-400 text-red-600"}`}>{report.score}</div>
              <div class="flex flex-col justify-center">
                <strong class="text-[11px] text-zinc-800">{report.checkedObjects} oggetti controllati</strong>
                <span class="mt-1 text-[9px] text-red-500">{report.errors} errori</span>
                <span class="text-[9px] text-amber-600">{report.warnings} avvisi</span>
                <span class="text-[9px] text-zinc-400">{report.infos} suggerimenti</span>
              </div>
            </div>

            <div class="mt-3">
              {report.issues.length === 0 && <div class="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-center text-[10px] text-emerald-700">Nessun problema rilevato.</div>}
              {report.issues.map((item) => (
                <button key={item.id} onClick={() => selectObject(item.objectId)} class={`mb-2 w-full rounded-xl border p-3 text-left cursor-pointer ${item.severity === "error" ? "border-red-100 bg-red-50" : item.severity === "warning" ? "border-amber-100 bg-amber-50" : "border-zinc-200 bg-zinc-50"}`}>
                  <div class="mb-1 flex items-center gap-2">
                    <ShieldAlert size={13} class={item.severity === "error" ? "text-red-500" : item.severity === "warning" ? "text-amber-500" : "text-zinc-400"} />
                    <strong class="text-[10px] text-zinc-700">{item.title}</strong>
                  </div>
                  <p class="m-0 text-[9px] leading-relaxed text-zinc-500">{item.detail}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
