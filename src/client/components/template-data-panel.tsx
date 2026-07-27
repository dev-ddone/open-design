import { useEffect, useMemo, useState } from "preact/hooks";
import { Database, ImagePlus, Tag, Trash2 } from "lucide-preact";
import type { DDoneFabricObject, DDoneTemplateFieldType } from "../canvas-model";
import {
  clearTemplateField,
  listTemplateFields,
  normalizeTemplateFieldKey,
  setTemplateField,
  validateTemplateFields,
} from "../canvas/template-fields";
import { useEditor } from "../context";
import { SpreadsheetImportPanel } from "./spreadsheet-import-panel";

const FIELD_TYPES: Array<{ value: DDoneTemplateFieldType; label: string }> = [
  { value: "text", label: "Testo" },
  { value: "price", label: "Prezzo" },
  { value: "cta", label: "Call to action" },
  { value: "image", label: "Immagine" },
  { value: "logo", label: "Logo" },
];

export function TemplateDataPanel() {
  const { canvas, selectedObject } = useEditor();
  const [section, setSection] = useState<"fields" | "data">("fields");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<DDoneTemplateFieldType>("text");
  const [required, setRequired] = useState(false);
  const [defaultValue, setDefaultValue] = useState("");
  const [revision, setRevision] = useState(0);
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
      const field = setTemplateField(selectedObject, { key, label, type, required, defaultValue });
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

  const openAssetPicker = () => {
    if (!selectedObject || (type !== "image" && type !== "logo")) return;
    window.dispatchEvent(new CustomEvent("ddone:open-asset-picker", {
      detail: { purpose: "replace-selected", fieldType: type },
    }));
  };

  return (
    <aside class="flex h-full w-[320px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 p-4 pt-12">
        <div class="flex items-center gap-2">
          <Database size={16} class="text-violet-600" />
          <h2 class="m-0 text-xs font-semibold text-zinc-800">Template e dati</h2>
        </div>
        <p class="mt-1 text-[9px] leading-relaxed text-zinc-400">Campi semantici, anteprima e produzione da CSV o Excel.</p>
        <div class="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1">
          <button onClick={() => setSection("fields")} class={`rounded-md border-0 px-2 py-1.5 text-[9px] font-semibold cursor-pointer ${section === "fields" ? "bg-white text-violet-700 shadow-sm" : "bg-transparent text-zinc-500"}`}>Campi</button>
          <button onClick={() => setSection("data")} class={`rounded-md border-0 px-2 py-1.5 text-[9px] font-semibold cursor-pointer ${section === "data" ? "bg-white text-violet-700 shadow-sm" : "bg-transparent text-zinc-500"}`}>Dati</button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        {section === "data" ? <SpreadsheetImportPanel /> : (
          <>
            <section class="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div class="mb-2 flex items-center gap-2"><Tag size={13} class="text-violet-600" /><strong class="text-[10px] text-zinc-700">Oggetto selezionato</strong></div>
              {!selectedObject && <p class="m-0 text-[9px] text-zinc-400">Seleziona testo, immagine o logo nel canvas.</p>}
              {selectedObject && (
                <div class="flex flex-col gap-2">
                  <label class="text-[8px] font-semibold text-zinc-500">Chiave dati<input value={key} onInput={(event) => setKey(normalizeTemplateFieldKey((event.target as HTMLInputElement).value))} placeholder="es. nome_prodotto" class="mt-1 h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] outline-none focus:border-violet-400" /></label>
                  <label class="text-[8px] font-semibold text-zinc-500">Etichetta<input value={label} onInput={(event) => setLabel((event.target as HTMLInputElement).value)} placeholder="Nome prodotto" class="mt-1 h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] outline-none focus:border-violet-400" /></label>
                  <label class="text-[8px] font-semibold text-zinc-500">Tipo<select value={type} onChange={(event) => setType((event.target as HTMLSelectElement).value as DDoneTemplateFieldType)} class="mt-1 h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] outline-none focus:border-violet-400">{FIELD_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label class="text-[8px] font-semibold text-zinc-500">Valore predefinito<input value={defaultValue} onInput={(event) => setDefaultValue((event.target as HTMLInputElement).value)} class="mt-1 h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] outline-none focus:border-violet-400" /></label>
                  <label class="flex items-center gap-2 text-[9px] text-zinc-500"><input type="checkbox" checked={required} onChange={(event) => setRequired((event.target as HTMLInputElement).checked)} /> Campo obbligatorio</label>
                  {(type === "image" || type === "logo") && <button onClick={openAssetPicker} class="flex h-8 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 text-[9px] font-semibold text-violet-700 cursor-pointer"><ImagePlus size={12} /> Scegli dalla libreria</button>}
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
        )}
        {message && <p class="mt-3 rounded-lg bg-zinc-50 p-2 text-[9px] text-zinc-600">{message}</p>}
      </div>
    </aside>
  );
}