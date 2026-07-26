import { useEffect, useMemo, useState } from "preact/hooks";
import { Grid2X2, ImagePlus, Save, Table2 } from "lucide-preact";
import * as fabric from "fabric";
import { useEditor } from "../context";
import {
  isSmartElement,
  readSmartElementData,
  rebuildSmartElement,
  resizeTableData,
  type SmartElementData,
  type SmartFrameData,
  type SmartGridData,
  type SmartTableData,
} from "../canvas/smart-elements";

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Impossibile leggere il file"));
    reader.readAsDataURL(file);
  });
}

function NumberField({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label class="block text-[9px] font-semibold text-zinc-500">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onInput={(event) => onChange(Number((event.target as HTMLInputElement).value))}
        class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-violet-400"
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label class="block text-[9px] font-semibold text-zinc-500">
      {label}
      <input
        type="color"
        value={value}
        onInput={(event) => onChange((event.target as HTMLInputElement).value)}
        class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-transparent p-1"
      />
    </label>
  );
}

function TableEditor({ data, onChange }: { data: SmartTableData; onChange: (data: SmartTableData) => void }) {
  const updateCell = (index: number, value: string) => {
    const cells = [...data.cells];
    cells[index] = value;
    onChange({ ...data, cells });
  };

  return (
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-2">
        <NumberField label="Righe" value={data.rows} min={1} max={20} onChange={(rows) => onChange(resizeTableData(data, rows, data.columns))} />
        <NumberField label="Colonne" value={data.columns} min={1} max={10} onChange={(columns) => onChange(resizeTableData(data, data.rows, columns))} />
        <NumberField label="Dimensione testo" value={data.fontSize} min={8} max={48} onChange={(fontSize) => onChange({ ...data, fontSize })} />
        <NumberField label="Spessore bordi" value={data.borderWidth} min={1} max={12} onChange={(borderWidth) => onChange({ ...data, borderWidth })} />
      </div>
      <label class="flex items-center gap-2 text-[10px] text-zinc-600">
        <input type="checkbox" checked={data.header} onChange={(event) => onChange({ ...data, header: (event.target as HTMLInputElement).checked })} />
        Prima riga come intestazione
      </label>
      <div class="grid grid-cols-2 gap-2">
        <ColorField label="Bordi" value={data.borderColor} onChange={(borderColor) => onChange({ ...data, borderColor })} />
        <ColorField label="Intestazione" value={data.headerColor} onChange={(headerColor) => onChange({ ...data, headerColor })} />
        <ColorField label="Testo" value={data.textColor} onChange={(textColor) => onChange({ ...data, textColor })} />
        <ColorField label="Sfondo" value={data.backgroundColor} onChange={(backgroundColor) => onChange({ ...data, backgroundColor })} />
      </div>
      <div>
        <strong class="mb-2 block text-[10px] text-zinc-700">Contenuto celle</strong>
        <div class="max-h-72 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2">
          <div class="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${data.columns}, minmax(92px, 1fr))` }}>
            {data.cells.map((cell, index) => (
              <input
                key={index}
                value={cell}
                onInput={(event) => updateCell(index, (event.target as HTMLInputElement).value)}
                class="h-8 rounded-md border border-zinc-200 bg-white px-2 text-[9px] outline-none focus:border-violet-400"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageSlotsEditor({ data, onChange }: {
  data: SmartGridData | SmartFrameData;
  onChange: (data: SmartGridData | SmartFrameData) => void;
}) {
  const slots = data.type === "grid"
    ? data.slots
    : [{ x: 0, y: 0, width: data.width, height: data.height, label: "Foto", imageUrl: data.imageUrl }];

  const setImage = async (index: number, file: File | undefined) => {
    if (!file) return;
    const imageUrl = await fileAsDataUrl(file);
    if (data.type === "grid") {
      const nextSlots = data.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, imageUrl } : slot);
      onChange({ ...data, slots: nextSlots });
    } else {
      onChange({ ...data, imageUrl });
    }
  };

  const removeImage = (index: number) => {
    if (data.type === "grid") {
      const nextSlots = data.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, imageUrl: undefined } : slot);
      onChange({ ...data, slots: nextSlots });
    } else {
      onChange({ ...data, imageUrl: undefined });
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-2">
        <ColorField label="Bordo" value={data.borderColor} onChange={(borderColor) => onChange({ ...data, borderColor })} />
        <ColorField label="Sfondo vuoto" value={data.backgroundColor} onChange={(backgroundColor) => onChange({ ...data, backgroundColor })} />
        <NumberField label="Angoli" value={data.radius} min={0} max={120} onChange={(radius) => onChange({ ...data, radius })} />
        {data.type === "frame" && <NumberField label="Spessore" value={data.borderWidth} min={1} max={40} onChange={(borderWidth) => onChange({ ...data, borderWidth })} />}
      </div>
      <div class="grid grid-cols-2 gap-2">
        {slots.map((slot, index) => (
          <label key={index} class="group relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-center hover:border-violet-400">
            {slot.imageUrl
              ? <img src={slot.imageUrl} alt="" class="absolute inset-0 h-full w-full object-cover" />
              : <><ImagePlus size={22} class="mb-1 text-zinc-400" /><span class="text-[9px] text-zinc-500">{slot.label}</span></>}
            <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onChange={(event) => void setImage(index, (event.target as HTMLInputElement).files?.[0])} />
            {slot.imageUrl && (
              <button type="button" onClick={(event) => { event.preventDefault(); removeImage(index); }} class="absolute right-1 top-1 rounded-md border border-white/70 bg-white/90 px-1.5 py-1 text-[8px] text-red-500 opacity-0 shadow group-hover:opacity-100">Rimuovi</button>
            )}
          </label>
        ))}
      </div>
      <p class="m-0 text-[9px] leading-relaxed text-zinc-400">Le immagini vengono incorporate nel progetto e ritagliate automaticamente dentro ogni area.</p>
    </div>
  );
}

export function SmartElementPanel() {
  const { canvas, selectedObject } = useEditor();
  const target = canvas?.getActiveObject() ?? selectedObject;
  const initial = useMemo(() => readSmartElementData(target), [target]);
  const [draft, setDraft] = useState<SmartElementData | null>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setDraft(readSmartElementData(target)), [target]);

  const save = async () => {
    if (!canvas || !target || !draft || !isSmartElement(target)) return;
    setSaving(true);
    setMessage(null);
    try {
      await rebuildSmartElement(canvas, target, draft);
      setMessage("Elemento aggiornato");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aggiornamento non riuscito");
    } finally {
      setSaving(false);
    }
  };

  if (!draft || !target || !isSmartElement(target)) {
    return (
      <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-700">
        Seleziona una tabella, una griglia o una cornice intelligente dal canvas.
      </div>
    );
  }

  return (
    <div>
      <div class="mb-4 rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-3">
        <div class="mb-1 flex items-center gap-2">
          {draft.type === "table" ? <Table2 size={16} class="text-violet-600" /> : <Grid2X2 size={16} class="text-violet-600" />}
          <strong class="text-[11px] text-zinc-800">{draft.type === "table" ? "Editor tabella" : draft.type === "grid" ? "Editor griglia" : "Editor cornice"}</strong>
        </div>
        <p class="m-0 text-[9px] leading-relaxed text-zinc-500">Le modifiche restano strutturate, salvabili, versionate e sincronizzate.</p>
      </div>

      {draft.type === "table"
        ? <TableEditor data={draft} onChange={setDraft} />
        : <ImageSlotsEditor data={draft} onChange={(value) => setDraft(value as SmartElementData)} />}

      <button disabled={saving} onClick={() => void save()} class="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-xs font-semibold text-white cursor-pointer disabled:opacity-50">
        <Save size={15} /> {saving ? "Aggiornamento…" : "Applica modifiche"}
      </button>
      {message && <p class="mt-2 text-center text-[9px] text-zinc-500">{message}</p>}
    </div>
  );
}
