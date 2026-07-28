import { useEffect, useMemo, useState } from "preact/hooks";
import { BarChart3, Grid2X2, ImagePlus, LayoutPanelTop, Plus, Save, Table2, Trash2 } from "lucide-preact";
import { useEditor } from "../context";
import type { AssetSelection } from "./asset-picker-host";
import {
  chartSeriesFor,
  isSmartElement,
  readSmartElementData,
  rebuildSmartElement,
  resizeTableData,
  type SmartChartData,
  type SmartChartSeries,
  type SmartChartType,
  type SmartChartValueFormat,
  type SmartElementData,
  type SmartFrameData,
  type SmartGridData,
  type SmartModuleData,
  type SmartTableData,
} from "../canvas/smart-elements";

function NumberField({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void;
}) {
  return <label class="block text-[9px] font-semibold text-zinc-500">{label}<input type="number" min={min} max={max} step={step} value={value} onInput={(event) => onChange(Number((event.target as HTMLInputElement).value))} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-violet-400" /></label>;
}
function TextField({ label, value, multiline = false, onChange }: { label: string; value: string; multiline?: boolean; onChange: (value: string) => void }) {
  return <label class="block text-[9px] font-semibold text-zinc-500">{label}{multiline ? <textarea value={value} rows={3} onInput={(event) => onChange((event.target as HTMLTextAreaElement).value)} class="mt-1 w-full resize-y rounded-lg border border-zinc-200 bg-white p-2 text-[10px] outline-none focus:border-violet-400" /> : <input value={value} onInput={(event) => onChange((event.target as HTMLInputElement).value)} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px] outline-none focus:border-violet-400" />}</label>;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label class="block text-[9px] font-semibold text-zinc-500">{label}<div class="mt-1 flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white p-1"><input type="color" value={value} onInput={(event) => onChange((event.target as HTMLInputElement).value)} class="h-7 w-9 rounded border-0 bg-transparent p-0" /><input value={value} onInput={(event) => onChange((event.target as HTMLInputElement).value)} class="min-w-0 flex-1 border-0 bg-transparent font-mono text-[8px] outline-none" /></div></label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label class="flex items-center gap-2 text-[9px] text-zinc-600"><input type="checkbox" checked={checked} onChange={(event) => onChange((event.target as HTMLInputElement).checked)} /> {label}</label>;
}

function TableEditor({ data, onChange }: { data: SmartTableData; onChange: (data: SmartTableData) => void }) {
  const updateCell = (index: number, value: string) => { const cells = [...data.cells]; cells[index] = value; onChange({ ...data, cells }); };
  const importDelimited = (text: string) => {
    const rows = text.trim().split(/\r?\n/).map((row) => row.split(/\t|;/));
    if (!rows.length) return;
    const resized = resizeTableData(data, rows.length, Math.max(...rows.map((row) => row.length)));
    const cells = resized.cells.map((fallback, index) => rows[Math.floor(index / resized.columns)]?.[index % resized.columns]?.trim() ?? fallback);
    onChange({ ...resized, cells });
  };
  return <div class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-2"><NumberField label="Righe" value={data.rows} min={1} max={50} onChange={(rows) => onChange(resizeTableData(data, rows, data.columns))} /><NumberField label="Colonne" value={data.columns} min={1} max={16} onChange={(columns) => onChange(resizeTableData(data, data.rows, columns))} /><NumberField label="Dimensione testo" value={data.fontSize} min={8} max={72} onChange={(fontSize) => onChange({ ...data, fontSize })} /><NumberField label="Spessore bordi" value={data.borderWidth} min={0} max={16} onChange={(borderWidth) => onChange({ ...data, borderWidth })} /><NumberField label="Larghezza" value={data.width} min={180} max={2000} onChange={(width) => onChange({ ...data, width })} /><NumberField label="Altezza" value={data.height} min={120} max={2000} onChange={(height) => onChange({ ...data, height })} /></div>
    <Toggle label="Prima riga come intestazione" checked={data.header} onChange={(header) => onChange({ ...data, header })} />
    <div class="grid grid-cols-2 gap-2"><ColorField label="Bordi" value={data.borderColor} onChange={(borderColor) => onChange({ ...data, borderColor })} /><ColorField label="Intestazione" value={data.headerColor} onChange={(headerColor) => onChange({ ...data, headerColor })} /><ColorField label="Testo" value={data.textColor} onChange={(textColor) => onChange({ ...data, textColor })} /><ColorField label="Sfondo" value={data.backgroundColor} onChange={(backgroundColor) => onChange({ ...data, backgroundColor })} /></div>
    <label class="block text-[9px] font-semibold text-zinc-500">Incolla dati da Excel<textarea placeholder={'Prodotto\tPrezzo\nPizza\t€ 8,00'} onBlur={(event) => { if ((event.target as HTMLTextAreaElement).value.trim()) importDelimited((event.target as HTMLTextAreaElement).value); }} rows={3} class="mt-1 w-full resize-y rounded-lg border border-zinc-200 bg-white p-2 font-mono text-[9px] outline-none focus:border-violet-400" /></label>
    <div><strong class="mb-2 block text-[10px] text-zinc-700">Contenuto celle</strong><div class="max-h-72 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2"><div class="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${data.columns}, minmax(92px, 1fr))` }}>{data.cells.map((cell, index) => <input key={index} value={cell} onInput={(event) => updateCell(index, (event.target as HTMLInputElement).value)} class="h-8 rounded-md border border-zinc-200 bg-white px-2 text-[9px] outline-none focus:border-violet-400" />)}</div></div></div>
  </div>;
}

function openAssetPicker(onSelect: (url: string) => void) {
  window.dispatchEvent(new CustomEvent("ddone:open-asset-picker", { detail: { purpose: "callback", onSelect: (selection: AssetSelection) => onSelect(selection.url) } }));
}
function ImageSlotsEditor({ data, onChange }: { data: SmartGridData | SmartFrameData; onChange: (data: SmartGridData | SmartFrameData) => void }) {
  const slots = data.type === "grid" ? data.slots : [{ x: 0, y: 0, width: data.width, height: data.height, label: "Foto", imageUrl: data.imageUrl }];
  const setImage = (index: number, imageUrl: string) => {
    if (data.type === "grid") onChange({ ...data, slots: data.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, imageUrl } : slot) });
    else onChange({ ...data, imageUrl });
  };
  const removeImage = (index: number) => {
    if (data.type === "grid") onChange({ ...data, slots: data.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, imageUrl: undefined } : slot) });
    else onChange({ ...data, imageUrl: undefined });
  };
  return <div class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-2"><ColorField label="Bordo" value={data.borderColor} onChange={(borderColor) => onChange({ ...data, borderColor })} /><ColorField label="Sfondo vuoto" value={data.backgroundColor} onChange={(backgroundColor) => onChange({ ...data, backgroundColor })} /><NumberField label="Angoli" value={data.radius} min={0} max={160} onChange={(radius) => onChange({ ...data, radius })} />{data.type === "frame" ? <NumberField label="Spessore" value={data.borderWidth} min={0} max={50} onChange={(borderWidth) => onChange({ ...data, borderWidth })} /> : <NumberField label="Spazio" value={data.gap} min={0} max={80} onChange={(gap) => onChange({ ...data, gap })} />}<NumberField label="Larghezza" value={data.width} min={160} max={2000} onChange={(width) => onChange({ ...data, width })} /><NumberField label="Altezza" value={data.height} min={120} max={2000} onChange={(height) => onChange({ ...data, height })} /></div>
    <div class="grid grid-cols-2 gap-2">{slots.map((slot, index) => <div key={index} class="group relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-center"><button type="button" onClick={() => openAssetPicker((url) => setImage(index, url))} class="absolute inset-0 z-10 border-0 bg-transparent cursor-pointer" aria-label={`Scegli ${slot.label}`} />{slot.imageUrl ? <img src={slot.imageUrl} alt="" class="absolute inset-0 h-full w-full object-cover" /> : <><ImagePlus size={22} class="mb-1 text-zinc-400" /><span class="text-[9px] text-zinc-500">{slot.label}</span></>}{slot.imageUrl && <button type="button" onClick={(event) => { event.stopPropagation(); removeImage(index); }} class="absolute right-1 top-1 z-20 rounded-md border border-white/70 bg-white/90 px-1.5 py-1 text-[8px] text-red-500 opacity-0 shadow cursor-pointer group-hover:opacity-100">Rimuovi</button>}</div>)}</div>
    <p class="m-0 text-[9px] leading-relaxed text-zinc-400">Le immagini restano collegate all’elemento e vengono ritagliate automaticamente.</p>
  </div>;
}

function parseValues(value: string): number[] {
  return value.split(/[,;\n\t]/).map((entry) => Number(entry.trim().replace(",", "."))).filter(Number.isFinite).slice(0, 50);
}
function normalizeSeries(labels: string[], series: SmartChartSeries[]): SmartChartSeries[] {
  return series.map((entry) => ({ ...entry, values: Array.from({ length: Math.max(1, labels.length) }, (_, index) => Number(entry.values[index]) || 0) }));
}
function importChartTable(text: string, fallbackColor: string): { labels: string[]; series: SmartChartSeries[] } | null {
  const rows = text.trim().split(/\r?\n/).map((row) => row.split(/\t|;/).map((cell) => cell.trim())).filter((row) => row.some(Boolean));
  if (rows.length < 2 || rows[0].length < 2) return null;
  const labels = rows[0].slice(1).filter(Boolean).slice(0, 50);
  const palette = [fallbackColor, "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#2563eb", "#ef4444", "#84cc16"];
  const series = rows.slice(1, 9).map((row, index) => ({ name: row[0] || `Serie ${index + 1}`, values: row.slice(1).map((cell) => Number(cell.replace(",", ".")) || 0).slice(0, labels.length), color: palette[index % palette.length] }));
  return { labels, series: normalizeSeries(labels, series) };
}

function ChartEditor({ data, onChange }: { data: SmartChartData; onChange: (data: SmartChartData) => void }) {
  const series = chartSeriesFor(data);
  const update = (changes: Partial<SmartChartData>) => onChange({ ...data, ...changes });
  const applySeries = (nextLabels: string[], nextSeries: SmartChartSeries[]) => {
    const normalized = normalizeSeries(nextLabels, nextSeries);
    onChange({ ...data, labels: nextLabels, series: normalized, values: normalized[0]?.values ?? [], colors: normalized.map((entry) => entry.color) });
  };
  const updateSeries = (index: number, changes: Partial<SmartChartSeries>) => applySeries(data.labels, series.map((entry, currentIndex) => currentIndex === index ? { ...entry, ...changes } : entry));
  const addSeries = () => {
    if (series.length >= 8) return;
    const palette = ["#7c3aed", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#2563eb", "#ef4444", "#84cc16"];
    applySeries(data.labels, [...series, { name: `Serie ${series.length + 1}`, values: data.labels.map(() => 0), color: palette[series.length % palette.length] }]);
  };
  const removeSeries = (index: number) => { if (series.length > 1) applySeries(data.labels, series.filter((_, currentIndex) => currentIndex !== index)); };
  const chartTypes: Array<{ value: SmartChartType; label: string }> = [
    { value: "bar", label: "Barre" }, { value: "grouped-bar", label: "Barre raggruppate" }, { value: "stacked-bar", label: "Barre impilate" },
    { value: "line", label: "Linee" }, { value: "area", label: "Area" }, { value: "donut", label: "Anello" }, { value: "pie", label: "Torta" },
    { value: "radar", label: "Radar" }, { value: "progress", label: "Progress ring" },
  ];
  return <div class="flex flex-col gap-4">
    <label class="block text-[9px] font-semibold text-zinc-500">Tipo grafico<select value={data.chartType} onChange={(event) => update({ chartType: (event.target as HTMLSelectElement).value as SmartChartType })} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px]">{chartTypes.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select></label>
    <TextField label="Titolo" value={data.title} onChange={(title) => update({ title })} />
    <div class="grid grid-cols-2 gap-2"><NumberField label="Larghezza" value={data.width} min={260} max={2200} onChange={(width) => update({ width })} /><NumberField label="Altezza" value={data.height} min={220} max={1600} onChange={(height) => update({ height })} /><ColorField label="Sfondo" value={data.backgroundColor} onChange={(backgroundColor) => update({ backgroundColor })} /><ColorField label="Testo" value={data.textColor} onChange={(textColor) => update({ textColor })} /><ColorField label="Griglia" value={data.gridColor} onChange={(gridColor) => update({ gridColor })} /></div>
    <div class="grid grid-cols-2 gap-2"><label class="block text-[9px] font-semibold text-zinc-500">Formato valori<select value={data.valueFormat ?? "number"} onChange={(event) => update({ valueFormat: (event.target as HTMLSelectElement).value as SmartChartValueFormat })} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[9px]"><option value="number">Numero</option><option value="percent">Percentuale</option><option value="currency">Valuta</option></select></label>{data.valueFormat === "currency" ? <TextField label="Simbolo valuta" value={data.currencySymbol ?? "€"} onChange={(currencySymbol) => update({ currencySymbol })} /> : <NumberField label="Valore massimo" value={data.maxValue ?? 100} min={1} max={1000000000} onChange={(maxValue) => update({ maxValue })} />}</div>
    <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3"><TextField label="Etichette separate da virgola" value={data.labels.join(", ")} onChange={(value) => { const labels = value.split(/[,;\n]/).map((entry) => entry.trim()).filter(Boolean).slice(0, 50); applySeries(labels.length ? labels : ["Voce 1"], series); }} /></div>
    <div>
      <div class="mb-2 flex items-center justify-between"><strong class="text-[9px] text-zinc-600">Serie dati</strong><button disabled={series.length >= 8} onClick={addSeries} class="inline-flex h-7 items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 text-[8px] font-semibold text-violet-700 cursor-pointer disabled:opacity-40"><Plus size={11} /> Serie</button></div>
      <div class="flex flex-col gap-2">{series.map((entry, index) => <div key={index} class="rounded-xl border border-zinc-200 bg-white p-2.5"><div class="mb-2 flex items-center gap-2"><input type="color" value={entry.color} onInput={(event) => updateSeries(index, { color: (event.target as HTMLInputElement).value })} class="h-8 w-10 rounded-lg border border-zinc-200 bg-white p-1" /><input value={entry.name} onInput={(event) => updateSeries(index, { name: (event.target as HTMLInputElement).value })} class="h-8 min-w-0 flex-1 rounded-lg border border-zinc-200 px-2 text-[9px] outline-none focus:border-violet-400" /><button disabled={series.length <= 1} onClick={() => removeSeries(index)} class="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-400 cursor-pointer hover:text-red-500 disabled:opacity-30"><Trash2 size={12} /></button></div><textarea value={entry.values.join(", ")} rows={2} onInput={(event) => updateSeries(index, { values: parseValues((event.target as HTMLTextAreaElement).value) })} class="w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-mono text-[9px] outline-none focus:border-violet-400" placeholder="10, 25, 42" /></div>)}</div>
    </div>
    <label class="block text-[9px] font-semibold text-zinc-500">Incolla tabella da Excel / CSV<textarea rows={4} placeholder={'Serie\tGen\tFeb\tMar\nVendite\t20\t36\t48\nOrdini\t14\t25\t31'} onBlur={(event) => { const imported = importChartTable((event.target as HTMLTextAreaElement).value, series[0]?.color ?? "#7c3aed"); if (imported) applySeries(imported.labels, imported.series); }} class="mt-1 w-full resize-y rounded-xl border border-zinc-200 bg-white p-2 font-mono text-[9px] outline-none focus:border-violet-400" /></label>
    <div class="grid grid-cols-2 gap-2"><Toggle label="Mostra valori" checked={data.showValues} onChange={(showValues) => update({ showValues })} /><Toggle label="Mostra legenda" checked={data.showLegend} onChange={(showLegend) => update({ showLegend })} /><Toggle label="Mostra griglia" checked={data.showGrid !== false} onChange={(showGrid) => update({ showGrid })} /><Toggle label="Angoli arrotondati" checked={data.rounded} onChange={(rounded) => update({ rounded })} /></div>
  </div>;
}

function ModuleEditor({ data, onChange }: { data: SmartModuleData; onChange: (data: SmartModuleData) => void }) {
  const presets: Array<{ label: string; patch: Partial<SmartModuleData> }> = [
    { label: "KPI", patch: { layout: "card", title: "€ 24.580", subtitle: "+18,4%", body: "Ricavi complessivi", ctaLabel: "Vedi report", showMedia: false } },
    { label: "Recensione", patch: { layout: "horizontal", title: "Esperienza eccellente", subtitle: "★★★★★", body: "Servizio rapido, curato e professionale.", ctaLabel: "Leggi recensione", showMedia: true } },
    { label: "Contatto", patch: { layout: "horizontal", title: "Mario Rossi", subtitle: "Creative Director", body: "mario@example.com\n+39 333 000 0000", ctaLabel: "Contatta", showMedia: true } },
    { label: "Feature", patch: { layout: "feature", title: "Una funzione migliore", subtitle: "Nuovo", body: "Descrivi il vantaggio principale con un testo breve e chiaro.", ctaLabel: "Scopri di più", showMedia: true } },
  ];
  return <div class="flex flex-col gap-4">
    <div><strong class="mb-2 block text-[9px] text-zinc-600">Preset contenuto</strong><div class="grid grid-cols-2 gap-2">{presets.map((preset) => <button key={preset.label} onClick={() => onChange({ ...data, ...preset.patch })} class="rounded-lg border border-zinc-200 bg-white px-2 py-2 text-[8px] font-semibold text-zinc-600 cursor-pointer hover:border-violet-300 hover:text-violet-700">{preset.label}</button>)}</div></div>
    <label class="block text-[9px] font-semibold text-zinc-500">Layout<select value={data.layout} onChange={(event) => onChange({ ...data, layout: (event.target as HTMLSelectElement).value as SmartModuleData["layout"] })} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[10px]"><option value="card">Card verticale</option><option value="horizontal">Orizzontale</option><option value="feature">Feature</option></select></label>
    <TextField label="Titolo" value={data.title} onChange={(title) => onChange({ ...data, title })} /><TextField label="Sottotitolo" value={data.subtitle} onChange={(subtitle) => onChange({ ...data, subtitle })} /><TextField label="Contenuto" value={data.body} multiline onChange={(body) => onChange({ ...data, body })} /><TextField label="Pulsante / CTA" value={data.ctaLabel} onChange={(ctaLabel) => onChange({ ...data, ctaLabel })} />
    <div class="grid grid-cols-2 gap-2"><NumberField label="Larghezza" value={data.width} min={240} max={2000} onChange={(width) => onChange({ ...data, width })} /><NumberField label="Altezza" value={data.height} min={180} max={1400} onChange={(height) => onChange({ ...data, height })} /><NumberField label="Angoli" value={data.radius} min={0} max={120} onChange={(radius) => onChange({ ...data, radius })} /><NumberField label="Spaziatura" value={data.padding} min={8} max={100} onChange={(padding) => onChange({ ...data, padding })} /><ColorField label="Sfondo" value={data.backgroundColor} onChange={(backgroundColor) => onChange({ ...data, backgroundColor })} /><ColorField label="Accento" value={data.accentColor} onChange={(accentColor) => onChange({ ...data, accentColor })} /><ColorField label="Testo" value={data.textColor} onChange={(textColor) => onChange({ ...data, textColor })} /></div>
    <Toggle label="Mostra area immagine" checked={data.showMedia} onChange={(showMedia) => onChange({ ...data, showMedia })} />
    {data.showMedia && <div class="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50"><button class="absolute inset-0 z-10 border-0 bg-transparent cursor-pointer" onClick={() => openAssetPicker((imageUrl) => onChange({ ...data, imageUrl }))} aria-label="Scegli immagine modulo" />{data.imageUrl ? <img src={data.imageUrl} class="h-full w-full object-cover" alt="" /> : <><ImagePlus size={22} class="text-zinc-400" /><span class="ml-2 text-[9px] text-zinc-500">Scegli immagine</span></>}{data.imageUrl && <button class="absolute right-2 top-2 z-20 rounded-lg bg-white/90 px-2 py-1 text-[8px] text-red-500 shadow cursor-pointer" onClick={() => onChange({ ...data, imageUrl: undefined })}>Rimuovi</button>}</div>}
  </div>;
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
    setSaving(true); setMessage(null);
    try { await rebuildSmartElement(canvas, target, draft); setMessage("Elemento aggiornato e sincronizzato."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Aggiornamento non riuscito"); }
    finally { setSaving(false); }
  };

  if (!draft || !target || !isSmartElement(target)) return <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-700">Seleziona una tabella, una griglia, una cornice, un grafico o un modulo intelligente.</div>;
  const header = draft.type === "table" ? { icon: Table2, title: "Editor tabella" } : draft.type === "grid" ? { icon: Grid2X2, title: "Editor griglia" } : draft.type === "frame" ? { icon: ImagePlus, title: "Editor cornice" } : draft.type === "chart" ? { icon: BarChart3, title: "Editor grafico" } : { icon: LayoutPanelTop, title: "Editor modulo" };
  return <div>
    <div class="mb-4 rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-3"><div class="mb-1 flex items-center gap-2"><header.icon size={16} class="text-violet-600" /><strong class="text-[11px] text-zinc-800">{header.title}</strong></div><p class="m-0 text-[9px] leading-relaxed text-zinc-500">Dati, stile, media e layout restano strutturati, versionati e collaborativi.</p></div>
    {draft.type === "table" ? <TableEditor data={draft} onChange={setDraft} /> : draft.type === "grid" || draft.type === "frame" ? <ImageSlotsEditor data={draft} onChange={(value) => setDraft(value as SmartElementData)} /> : draft.type === "chart" ? <ChartEditor data={draft} onChange={setDraft} /> : <ModuleEditor data={draft} onChange={setDraft} />}
    <button disabled={saving} onClick={() => void save()} class="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"><Save size={15} /> {saving ? "Aggiornamento…" : "Applica modifiche"}</button>
    {message && <p class="mt-2 text-center text-[9px] text-zinc-500">{message}</p>}
  </div>;
}
