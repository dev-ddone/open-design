import { useEffect, useMemo, useState } from "preact/hooks";
import { Database, FileSpreadsheet, Tag, Trash2, WandSparkles } from "lucide-preact";
import { api } from "../api";
import type { DDoneFabricObject, DDoneTemplateFieldType } from "../canvas-model";
import {
  applyTemplateRecordToCanvas,
  applyTemplateRecordToCanvasJson,
  clearTemplateField,
  listTemplateFields,
  normalizeTemplateFieldKey,
  parseCsv,
  setTemplateField,
  validateTemplateFields,
} from "../canvas/template-fields";
import { useEditor } from "../context";
import type { Page } from "../types";

const FIELD_TYPES: Array<{ value: DDoneTemplateFieldType; label: string }> = [
  { value: "text", label: "Testo" },
  { value: "price", label: "Prezzo" },
  { value: "cta", label: "Call to action" },
  { value: "image", label: "Immagine" },
  { value: "logo", label: "Logo" },
];

export function TemplateDataPanel() {
  const {
    canvas,
    selectedObject,
    activeDesign,
    activePage,
    activePageId,
    getCanvasJSON,
    loadDesign,
    createVersion,
    saveDesign,
  } = useEditor();
  const [section, setSection] = useState<"fields" | "data">("fields");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<DDoneTemplateFieldType>("text");
  const [required, setRequired] = useState(false);
  const [defaultValue, setDefaultValue] = useState("");
  const [revision, setRevision] = useState(0);
  const [csv, setCsv] = useState("");
  const [rowIndex, setRowIndex] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const metadata = selectedObject as DDoneFabricObject | null;
    setKey(metadata?.ddoneFieldKey ?? "");
    setLabel(metadata?.ddoneFieldLabel ?? "");
    setType(metadata?.ddoneFieldType ?? "text");
    setRequired(Boolean(metadata?.ddoneFieldRequired));
    setDefaultValue(metadata?.ddoneFieldDefault ?? "");
  }, [selectedObject]);

  const fields = useMemo(() => canvas ? listTemplateFields(canvas) : [], [canvas, revision]);
  const validation = useMemo(() => canvas ? validateTemplateFields(canvas) : [], [canvas, revision]);
  const parsed = useMemo(() => parseCsv(csv), [csv]);
  const currentRecord = parsed.records[rowIndex] ?? null;
  const missingHeaders = useMemo(
    () => fields.filter((field) => !parsed.headers.includes(field.key)).map((field) => field.key),
    [fields, parsed.headers],
  );

  const selectField = (objectId: string) => {
    if (!canvas) return;
    const target = canvas.getObjects().find((object) => (object as DDoneFabricObject).ddoneId === objectId);
    if (!target || !target.selectable) return;
    canvas.setActiveObject(target);
    canvas.requestRenderAll();
  };

  const saveField = () => {
    if (!canvas || !selectedObject) {
      setMessage("Seleziona un oggetto prima di definire il campo.");
      return;
    }
    try {
      const field = setTemplateField(selectedObject, {
        key,
        label,
        type,
        required,
        defaultValue,
      });
      canvas.fire("object:modified", { target: selectedObject } as any);
      canvas.requestRenderAll();
      setKey(field.key);
      setRevision((value) => value + 1);
      setMessage(`Campo ${field.label} salvato.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Campo non salvato");
    }
  };

  const removeField = () => {
    if (!canvas || !selectedObject) return;
    clearTemplateField(selectedObject);
    canvas.fire("object:modified", { target: selectedObject } as any);
    canvas.requestRenderAll();
    setKey("");
    setLabel("");
    setRequired(false);
    setDefaultValue("");
    setRevision((value) => value + 1);
    setMessage("Campo rimosso dall’oggetto.");
  };

  const readCsvFile = async (file: File | undefined) => {
    if (!file) return;
    setCsv(await file.text());
    setRowIndex(0);
  };

  const applyCurrentRecord = async () => {
    if (!canvas || !currentRecord) return;
    setWorking(true);
    try {
      const result = await applyTemplateRecordToCanvas(canvas, currentRecord);
      await saveDesign();
      setRevision((value) => value + 1);
      setMessage(result.missing.length
        ? `${result.applied} campi applicati. Mancano: ${result.missing.join(", ")}.`
        : `${result.applied} campi applicati alla pagina corrente.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Dati non applicati");
    } finally {
      setWorking(false);
    }
  };

  const generatePages = async () => {
    if (!activeDesign || !activePage || !activePageId || parsed.records.length === 0) return;
    if (parsed.records.length > 100) {
      setMessage("La generazione è limitata a 100 righe per operazione.");
      return;
    }
    if (validation.length > 0) {
      setMessage("Correggi prima i campi template non validi.");
      return;
    }
    setWorking(true);
    try {
      await createVersion("Before CSV bulk generation", "manual");
      const baseCanvasJson = getCanvasJSON();
      await api<Page>("PUT", `/api/pages/${activePageId}`, { canvas_json: baseCanvasJson });

      for (let index = 0; index < parsed.records.length; index += 1) {
        const record = parsed.records[index];
        const transformed = applyTemplateRecordToCanvasJson(baseCanvasJson, record);
        const page = index === 0
          ? activePage
          : await api<Page>("POST", `/api/pages/${activePageId}/duplicate`, {});
        const suggestedTitle = record.name || record.title || record.nome || record.titolo || `Riga ${index + 1}`;
        await api<Page>("PUT", `/api/pages/${page.id}`, {
          canvas_json: transformed.canvasJson,
          title: String(suggestedTitle).slice(0, 120),
        });
      }
      await loadDesign(activeDesign.id);
      setMessage(`${parsed.records.length} pagine generate dai dati CSV.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Generazione pagine non riuscita");
    } finally {
      setWorking(false);
    }
  };

  return (
    <aside class="flex h-full w-[320px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 p-4 pt-12">
        <div class="flex items-center gap-2">
          <Database size={16} class="text-violet-600" />
          <h2 class="m-0 text-xs font-semibold text-zinc-800">Template e dati</h2>
        </div>
        <p class="mt-1 text-[9px] leading-relaxed text-zinc-400">Definisci campi semantici e genera varianti statiche da CSV.</p>
        <div class="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1">
          <button onClick={() => setSection("fields")} class={`rounded-md border-0 px-2 py-1.5 text-[9px] font-semibold cursor-pointer ${section === "fields" ? "bg-white text-violet-700 shadow-sm" : "bg-transparent text-zinc-500"}`}>Campi</button>
          <button onClick={() => setSection("data")} class={`rounded-md border-0 px-2 py-1.5 text-[9px] font-semibold cursor-pointer ${section === "data" ? "bg-white text-violet-700 shadow-sm" : "bg-transparent text-zinc-500"}`}>Dati CSV</button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        {section === "fields" ? (
          <>
            <section class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div class="mb-2 flex items-center gap-2"><Tag size={13} class="text-violet-600" /><strong class="text-[10px] text-zinc-700">Oggetto selezionato</strong></div>
              {!selectedObject && <p class="m-0 text-[9px] text-zinc-400">Seleziona testo o immagine nel canvas.</p>}
              {selectedObject && (
                <div class="flex flex-col gap-2">
                  <label class="text-[8px] font-semibold text-zinc-500">Chiave dati<input value={key} onInput={(event) => setKey(normalizeTemplateFieldKey((event.target as HTMLInputElement).value))} placeholder="es. nome_prodotto" class="mt-1 h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] outline-none focus:border-violet-400" /></label>
                  <label class="text-[8px] font-semibold text-zinc-500">Etichetta<input value={label} onInput={(event) => setLabel((event.target as HTMLInputElement).value)} placeholder="Nome prodotto" class="mt-1 h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] outline-none focus:border-violet-400" /></label>
                  <label class="text-[8px] font-semibold text-zinc-500">Tipo<select value={type} onChange={(event) => setType((event.target as HTMLSelectElement).value as DDoneTemplateFieldType)} class="mt-1 h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] outline-none focus:border-violet-400">{FIELD_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label class="text-[8px] font-semibold text-zinc-500">Valore predefinito<input value={defaultValue} onInput={(event) => setDefaultValue((event.target as HTMLInputElement).value)} class="mt-1 h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] outline-none focus:border-violet-400" /></label>
                  <label class="flex items-center gap-2 text-[9px] text-zinc-500"><input type="checkbox" checked={required} onChange={(event) => setRequired((event.target as HTMLInputElement).checked)} /> Campo obbligatorio</label>
                  <div class="grid grid-cols-[1fr_40px] gap-2">
                    <button onClick={saveField} class="h-8 rounded-lg border-0 bg-violet-600 text-[9px] font-semibold text-white cursor-pointer">Salva campo</button>
                    <button title="Rimuovi campo" onClick={removeField} class="grid h-8 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 cursor-pointer"><Trash2 size={13} /></button>
                  </div>
                </div>
              )}
            </section>

            <section class="mt-4">
              <div class="mb-2 flex items-center justify-between"><strong class="text-[10px] text-zinc-700">Campi del template</strong><span class="text-[8px] text-zinc-400">{fields.length}</span></div>
              {fields.map((field) => (
                <button key={field.objectId} onClick={() => selectField(field.objectId)} class="mb-2 w-full rounded-xl border border-zinc-200 bg-white p-3 text-left cursor-pointer hover:border-violet-300">
                  <div class="flex items-center justify-between gap-2"><strong class="truncate text-[9px] text-zinc-700">{field.label}</strong><span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[7px] text-zinc-500">{field.type}</span></div>
                  <code class="mt-1 block truncate text-[8px] text-violet-600">{field.key}</code>
                  {field.required && <span class="mt-1 block text-[7px] text-red-500">obbligatorio</span>}
                </button>
              ))}
              {fields.length === 0 && <p class="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-[9px] text-zinc-400">Nessun campo definito.</p>}
            </section>

            {validation.length > 0 && (
              <section class="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3">
                <strong class="text-[9px] text-amber-700">Problemi da correggere</strong>
                {validation.map((issue, index) => <button key={`${issue.objectId}-${index}`} onClick={() => selectField(issue.objectId)} class="mt-2 block w-full border-0 bg-transparent p-0 text-left text-[8px] text-amber-700 cursor-pointer">• {issue.label}: {issue.message}</button>)}
              </section>
            )}
          </>
        ) : (
          <>
            <label class="block rounded-xl border-2 border-dashed border-zinc-200 p-4 text-center cursor-pointer hover:border-violet-300">
              <FileSpreadsheet size={22} class="mx-auto mb-2 text-zinc-400" />
              <span class="block text-[9px] font-semibold text-zinc-600">Carica CSV</span>
              <span class="text-[8px] text-zinc-400">virgola o punto e virgola</span>
              <input type="file" accept=".csv,text/csv" class="hidden" onChange={(event) => void readCsvFile((event.target as HTMLInputElement).files?.[0])} />
            </label>
            <textarea value={csv} onInput={(event) => { setCsv((event.target as HTMLTextAreaElement).value); setRowIndex(0); }} rows={7} placeholder={'nome_prodotto,prezzo,immagine\nPizza Margherita,8.00,/uploads/pizza.jpg'} class="mt-3 w-full resize-y rounded-xl border border-zinc-200 p-3 font-mono text-[9px] outline-none focus:border-violet-400" />

            <div class="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div class="flex items-center justify-between"><strong class="text-[9px] text-zinc-700">{parsed.records.length} righe</strong><span class="text-[8px] text-zinc-400">{parsed.headers.length} colonne</span></div>
              <div class="mt-2 flex flex-wrap gap-1">{parsed.headers.map((header) => <code key={header} class="rounded bg-white px-1.5 py-1 text-[7px] text-violet-600">{header}</code>)}</div>
              {missingHeaders.length > 0 && <p class="mb-0 mt-2 text-[8px] text-amber-600">Colonne mancanti: {missingHeaders.join(", ")}</p>}
            </div>

            {parsed.records.length > 0 && (
              <>
                <label class="mt-3 block text-[8px] font-semibold text-zinc-500">Riga da applicare<select value={rowIndex} onChange={(event) => setRowIndex(Number((event.target as HTMLSelectElement).value))} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px]">{parsed.records.map((record, index) => <option key={index} value={index}>{index + 1} · {record.name || record.title || record.nome || record.titolo || "record"}</option>)}</select></label>
                <button disabled={working || !currentRecord} onClick={() => void applyCurrentRecord()} class="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-[9px] font-semibold text-violet-700 cursor-pointer disabled:opacity-40"><WandSparkles size={13} /> Applica alla pagina corrente</button>
                <button disabled={working || validation.length > 0} onClick={() => void generatePages()} class="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-[10px] font-semibold text-white cursor-pointer disabled:opacity-40"><Database size={14} /> Genera {parsed.records.length} pagine</button>
                <p class="mt-2 text-[8px] leading-relaxed text-zinc-400">La prima riga aggiorna la pagina corrente. Le successive creano duplicati. Prima dell’operazione viene salvata una versione di sicurezza.</p>
              </>
            )}
          </>
        )}

        {message && <p class="mt-3 rounded-lg bg-zinc-50 p-2 text-[9px] text-zinc-600">{message}</p>}
      </div>
    </aside>
  );
}
