import { useEffect, useMemo, useState } from "preact/hooks";
import { Database, FileSpreadsheet, RefreshCw, TableProperties, WandSparkles } from "lucide-preact";
import { api } from "../api";
import {
  applyTemplateRecordToCanvas,
  applyTemplateRecordToCanvasJson,
  listTemplateFields,
  validateTemplateFields,
} from "../canvas/template-fields";
import {
  applyColumnMapping,
  mappedRecordCompleteness,
  parseSpreadsheetFile,
  suggestColumnMapping,
  type SpreadsheetWorkbook,
} from "../data/spreadsheet-import";
import { useEditor } from "../context";
import type { Page } from "../types";

export function SpreadsheetImportPanel() {
  const {
    canvas,
    activeDesign,
    activePage,
    activePageId,
    getCanvasJSON,
    loadDesign,
    createVersion,
    saveDesign,
  } = useEditor();
  const [workbook, setWorkbook] = useState<SpreadsheetWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [rowIndex, setRowIndex] = useState(0);
  const [skipIncomplete, setSkipIncomplete] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fields = useMemo(() => canvas ? listTemplateFields(canvas) : [], [canvas]);
  const validation = useMemo(() => canvas ? validateTemplateFields(canvas) : [], [canvas]);
  const sheet = workbook?.sheets[sheetIndex] ?? null;
  const mappedRecords = useMemo(
    () => sheet ? applyColumnMapping(sheet.records, mapping) : [],
    [sheet, mapping],
  );
  const requiredKeys = useMemo(() => fields.filter((field) => field.required).map((field) => field.key), [fields]);
  const eligibleRecords = useMemo(
    () => mappedRecords.filter((record) => !skipIncomplete || mappedRecordCompleteness(record, requiredKeys).complete),
    [mappedRecords, skipIncomplete, requiredKeys],
  );
  const currentRecord = mappedRecords[rowIndex] ?? null;

  useEffect(() => {
    if (!sheet) return;
    setMapping(suggestColumnMapping(sheet.headers, fields));
    setRowIndex(0);
  }, [sheetIndex, workbook?.fileName, fields.map((field) => `${field.key}:${field.label}`).join("|")]);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setWorking(true);
    setMessage(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      setWorkbook(parsed);
      setSheetIndex(0);
      const first = parsed.sheets[0];
      setMapping(suggestColumnMapping(first.headers, fields));
      setMessage(`${first.records.length} righe lette dal foglio ${first.name}.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "File non leggibile");
    } finally {
      setWorking(false);
    }
  };

  const applyCurrent = async () => {
    if (!canvas || !currentRecord) return;
    const completeness = mappedRecordCompleteness(currentRecord, requiredKeys);
    if (!completeness.complete) {
      setMessage(`Campi obbligatori mancanti: ${completeness.missing.join(", ")}`);
      return;
    }
    setWorking(true);
    try {
      const result = await applyTemplateRecordToCanvas(canvas, currentRecord);
      await saveDesign();
      setMessage(`${result.applied} campi applicati alla pagina corrente.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Record non applicato");
    } finally {
      setWorking(false);
    }
  };

  const generatePages = async () => {
    if (!activeDesign || !activePage || !activePageId || eligibleRecords.length === 0) return;
    if (validation.length > 0) {
      setMessage("Correggi i campi template non validi prima della generazione.");
      return;
    }
    if (eligibleRecords.length > 250) {
      setMessage("La generazione è limitata a 250 record per operazione.");
      return;
    }
    setWorking(true);
    try {
      await createVersion(`Before ${workbook?.fileName ?? "spreadsheet"} generation`, "manual");
      const baseCanvasJson = getCanvasJSON();
      await api<Page>("PUT", `/api/pages/${activePageId}`, { canvas_json: baseCanvasJson });
      for (let index = 0; index < eligibleRecords.length; index += 1) {
        const record = eligibleRecords[index];
        const transformed = applyTemplateRecordToCanvasJson(baseCanvasJson, record);
        const page = index === 0 ? activePage : await api<Page>("POST", `/api/pages/${activePageId}/duplicate`, {});
        const suggestedTitle = record.name || record.title || record.nome || record.titolo || `Record ${index + 1}`;
        await api<Page>("PUT", `/api/pages/${page.id}`, {
          canvas_json: transformed.canvasJson,
          title: String(suggestedTitle).slice(0, 120),
        });
      }
      await loadDesign(activeDesign.id);
      setMessage(`${eligibleRecords.length} pagine generate da ${workbook?.fileName ?? "foglio di calcolo"}.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Generazione non riuscita");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <label class="block rounded-xl border-2 border-dashed border-zinc-200 p-4 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50/30">
        <FileSpreadsheet size={24} class="mx-auto mb-2 text-zinc-400" />
        <span class="block text-[9px] font-semibold text-zinc-700">Carica Excel o CSV</span>
        <span class="text-[8px] text-zinc-400">XLSX, XLS, XLSM, ODS e CSV</span>
        <input type="file" accept=".xlsx,.xls,.xlsm,.ods,.csv" class="hidden" onChange={(event) => void readFile((event.target as HTMLInputElement).files?.[0])} />
      </label>

      {working && !workbook && <div class="mt-3 flex items-center justify-center gap-2 text-[9px] text-zinc-500"><RefreshCw size={12} class="animate-spin" /> Analisi del file…</div>}

      {workbook && sheet && (
        <>
          <div class="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div class="flex items-center gap-2"><TableProperties size={13} class="text-violet-600" /><strong class="truncate text-[9px] text-zinc-700">{workbook.fileName}</strong></div>
            <label class="mt-2 block text-[8px] font-semibold text-zinc-500">Foglio
              <select value={sheetIndex} onChange={(event) => setSheetIndex(Number((event.target as HTMLSelectElement).value))} class="mt-1 h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[9px]">
                {workbook.sheets.map((item, index) => <option value={index} key={item.name}>{item.name} · {item.records.length} righe</option>)}
              </select>
            </label>
          </div>

          <section class="mt-3 rounded-xl border border-zinc-200 p-3">
            <div class="flex items-center justify-between"><strong class="text-[9px] text-zinc-700">Mappatura colonne</strong><button onClick={() => setMapping(suggestColumnMapping(sheet.headers, fields))} class="border-0 bg-transparent text-[8px] text-violet-600 cursor-pointer">Ricalcola</button></div>
            {fields.length === 0 && <p class="mb-0 mt-2 text-[8px] text-amber-600">Definisci prima almeno un campo semantico nel template.</p>}
            <div class="mt-2 flex flex-col gap-2">
              {fields.map((field) => (
                <label key={field.key} class="grid grid-cols-[1fr_1.25fr] items-center gap-2 text-[8px] text-zinc-500">
                  <span class="truncate"><strong class="text-zinc-700">{field.label}</strong>{field.required ? " *" : ""}<code class="block truncate text-[7px] text-violet-500">{field.key}</code></span>
                  <select value={mapping[field.key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: (event.target as HTMLSelectElement).value }))} class="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[8px]">
                    <option value="">Non mappato</option>
                    {sheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section class="mt-3 overflow-hidden rounded-xl border border-zinc-200">
            <div class="flex items-center justify-between bg-zinc-50 px-3 py-2"><strong class="text-[9px] text-zinc-700">Anteprima</strong><span class="text-[8px] text-zinc-400">{sheet.records.length} × {sheet.headers.length}</span></div>
            <div class="max-h-44 overflow-auto">
              <table class="min-w-full border-collapse text-[8px]">
                <thead class="sticky top-0 bg-white"><tr>{sheet.headers.slice(0, 8).map((header) => <th key={header} class="border-b border-r border-zinc-100 px-2 py-1.5 text-left font-semibold text-zinc-600">{header}</th>)}</tr></thead>
                <tbody>{sheet.records.slice(0, 8).map((record, index) => <tr key={index}>{sheet.headers.slice(0, 8).map((header) => <td key={header} class="max-w-36 truncate border-b border-r border-zinc-100 px-2 py-1.5 text-zinc-500">{record[header]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>

          {mappedRecords.length > 0 && (
            <>
              <label class="mt-3 block text-[8px] font-semibold text-zinc-500">Record da applicare
                <select value={rowIndex} onChange={(event) => setRowIndex(Number((event.target as HTMLSelectElement).value))} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[9px]">
                  {mappedRecords.map((record, index) => <option key={index} value={index}>{index + 1} · {record.name || record.title || record.nome || record.titolo || "record"}</option>)}
                </select>
              </label>
              <label class="mt-2 flex items-center gap-2 text-[8px] text-zinc-500"><input type="checkbox" checked={skipIncomplete} onChange={(event) => setSkipIncomplete((event.target as HTMLInputElement).checked)} /> Salta i record senza campi obbligatori</label>
              <button disabled={working || !currentRecord} onClick={() => void applyCurrent()} class="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-[9px] font-semibold text-violet-700 cursor-pointer disabled:opacity-40"><WandSparkles size={13} /> Applica record corrente</button>
              <button disabled={working || validation.length > 0 || eligibleRecords.length === 0} onClick={() => void generatePages()} class="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-[10px] font-semibold text-white cursor-pointer disabled:opacity-40"><Database size={14} /> Genera {eligibleRecords.length} pagine</button>
            </>
          )}
        </>
      )}

      {message && <p class="mt-3 rounded-lg bg-zinc-50 p-2 text-[9px] leading-relaxed text-zinc-600">{message}</p>}
    </div>
  );
}