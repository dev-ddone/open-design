import { AlertTriangle, BadgeCheck, MessageSquareCheck, ShieldCheck, X } from "lucide-preact";
import type { ExportPreflightResult } from "../export-governance";

interface ExportPreflightDialogProps {
  result: ExportPreflightResult;
  format: string;
  working: boolean;
  onCancel: () => void;
  onExport: () => void;
  onOpenAudit: () => void;
  onOpenReview: () => void;
}

export function ExportPreflightDialog({
  result,
  format,
  working,
  onCancel,
  onExport,
  onOpenAudit,
  onOpenReview,
}: ExportPreflightDialogProps) {
  const blocked = result.blockers.length > 0;

  return (
    <div class="fixed inset-0 z-[120] grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="export-preflight-title">
      <div class="w-full max-w-[520px] rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div class="flex items-start justify-between border-b border-zinc-200 p-5">
          <div class="flex gap-3">
            <span class={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${blocked ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
              {blocked ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
            </span>
            <div>
              <h2 id="export-preflight-title" class="m-0 text-sm font-semibold text-zinc-900">Controllo prima dell’export {format.toUpperCase()}</h2>
              <p class="mb-0 mt-1 text-[10px] leading-relaxed text-zinc-500">Il file non è ancora stato generato. Verifica gli elementi aperti oppure conferma consapevolmente l’export.</p>
            </div>
          </div>
          <button onClick={onCancel} aria-label="Chiudi" class="grid h-8 w-8 place-items-center rounded-lg border-0 bg-transparent text-zinc-400 cursor-pointer hover:bg-zinc-100"><X size={15} /></button>
        </div>

        <div class="max-h-[55vh] overflow-y-auto p-5">
          {result.blockers.length > 0 && (
            <section>
              <strong class="mb-2 block text-[10px] uppercase tracking-wide text-red-600">Blocchi</strong>
              {result.blockers.map((item) => <div key={item} class="mb-2 flex gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-[10px] leading-relaxed text-red-700"><AlertTriangle size={14} class="mt-0.5 shrink-0" />{item}</div>)}
            </section>
          )}

          {result.notices.length > 0 && (
            <section class={result.blockers.length > 0 ? "mt-4" : ""}>
              <strong class="mb-2 block text-[10px] uppercase tracking-wide text-amber-600">Avvisi</strong>
              {result.notices.map((item) => <div key={item} class="mb-2 flex gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-700"><ShieldCheck size={14} class="mt-0.5 shrink-0" />{item}</div>)}
            </section>
          )}

          <div class="mt-4 grid grid-cols-2 gap-2">
            <button onClick={onOpenAudit} class="flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-[9px] font-semibold text-emerald-700 cursor-pointer"><BadgeCheck size={14} /> Apri controllo design</button>
            <button onClick={onOpenReview} class="flex h-10 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-[9px] font-semibold text-violet-700 cursor-pointer"><MessageSquareCheck size={14} /> Apri revisione</button>
          </div>

          {blocked && result.readOnly && <p class="mb-0 mt-4 rounded-xl bg-zinc-100 p-3 text-[9px] leading-relaxed text-zinc-600">Questo account può visualizzare ed esportare soltanto quando non restano blocchi. Un Editor o Admin deve correggere il design o aggiornare la revisione.</p>}
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-zinc-200 p-4">
          <button disabled={working} onClick={onCancel} class="h-9 rounded-xl border border-zinc-200 bg-white px-4 text-[10px] font-semibold text-zinc-600 cursor-pointer disabled:opacity-40">Annulla</button>
          <button disabled={working || !result.canOverride} onClick={onExport} class={`h-9 rounded-xl border-0 px-4 text-[10px] font-semibold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-35 ${blocked ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"}`}>{working ? "Esportazione…" : blocked ? "Esporta comunque" : "Conferma export"}</button>
        </div>
      </div>
    </div>
  );
}
