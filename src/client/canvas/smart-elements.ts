import * as fabric from "fabric";
import { ensureObjectId, markSvgObject, type DDoneFabricObject } from "../canvas-model";

export type SmartElementType = "table" | "grid" | "frame" | "chart" | "module";
export type SmartChartType = "bar" | "grouped-bar" | "stacked-bar" | "line" | "area" | "donut" | "pie" | "radar" | "progress";
export type SmartChartValueFormat = "number" | "percent" | "currency";

export interface SmartTableData {
  type: "table"; variant: string; rows: number; columns: number; cells: string[]; header: boolean;
  width: number; height: number; borderColor: string; headerColor: string; textColor: string;
  backgroundColor: string; borderWidth: number; fontSize: number;
}
export interface SmartSlot { x: number; y: number; width: number; height: number; label: string; imageUrl?: string; }
export interface SmartGridData {
  type: "grid"; variant: string; width: number; height: number; gap: number; radius: number;
  borderColor: string; backgroundColor: string; slots: SmartSlot[];
}
export interface SmartFrameData {
  type: "frame"; variant: string; width: number; height: number; radius: number;
  borderColor: string; borderWidth: number; backgroundColor: string; imageUrl?: string;
}
export interface SmartChartSeries {
  name: string;
  values: number[];
  color: string;
}
export interface SmartChartData {
  type: "chart";
  variant: string;
  chartType: SmartChartType;
  width: number;
  height: number;
  title: string;
  labels: string[];
  values: number[];
  colors: string[];
  series?: SmartChartSeries[];
  backgroundColor: string;
  textColor: string;
  gridColor: string;
  showLegend: boolean;
  showValues: boolean;
  showGrid?: boolean;
  rounded: boolean;
  valueFormat?: SmartChartValueFormat;
  currencySymbol?: string;
  maxValue?: number;
}
export interface SmartModuleData {
  type: "module";
  variant: string;
  layout: "card" | "horizontal" | "feature";
  width: number;
  height: number;
  radius: number;
  padding: number;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
  title: string;
  subtitle: string;
  body: string;
  ctaLabel: string;
  imageUrl?: string;
  showMedia: boolean;
}

export type SmartElementData = SmartTableData | SmartGridData | SmartFrameData | SmartChartData | SmartModuleData;
export type SmartFabricObject = fabric.Group & DDoneFabricObject & { ddoneSmartType?: SmartElementType; ddoneSmartVariant?: string; ddoneSmartData?: string; };

const TABLE_PRESETS: Record<string, Pick<SmartTableData, "rows" | "columns" | "header">> = {
  "table-menu": { rows: 4, columns: 2, header: true }, "table-price-list": { rows: 6, columns: 2, header: false },
  "table-comparison": { rows: 5, columns: 4, header: true }, "table-week": { rows: 6, columns: 7, header: true },
  "table-wine": { rows: 5, columns: 3, header: true }, "table-menu-wide": { rows: 5, columns: 3, header: false },
};
const GRID_PRESETS: Record<string, Array<[number, number, number, number]>> = {
  "grid-2x2": [[0, 0, .48, .46], [.52, 0, .48, .46], [0, .54, .48, .46], [.52, .54, .48, .46]],
  "grid-3-columns": [[0, 0, .31, 1], [.345, 0, .31, 1], [.69, 0, .31, 1]],
  "grid-hero": [[0, 0, 1, .61], [0, .66, .31, .34], [.345, .66, .31, .34], [.69, .66, .31, .34]],
  "grid-three": [[0, 0, .61, 1], [.66, 0, .34, .47], [.66, .53, .34, .47]],
  "grid-masonry": [[0, 0, .31, .58], [.345, 0, .31, .37], [.69, 0, .31, .58], [0, .64, .31, .36], [.345, .43, .31, .57], [.69, .64, .31, .36]],
};

function structuralName(sourceId: string): string | null { return /^local-pack:structures:([^:]+):svg$/.exec(sourceId)?.[1] ?? null; }
function defaultCellText(row: number, column: number, header: boolean): string {
  if (header && row === 0) return column === 0 ? "Voce" : column === 1 ? "Prezzo" : `Colonna ${column + 1}`;
  if (column === 0) return `Elemento ${row + (header ? 0 : 1)}`;
  if (column === 1) return "€ 0,00";
  return "Testo";
}

function createTableData(variant: string, color: string): SmartTableData {
  const preset = TABLE_PRESETS[variant] ?? TABLE_PRESETS["table-menu"];
  return { type: "table", variant, rows: preset.rows, columns: preset.columns, cells: Array.from({ length: preset.rows * preset.columns }, (_, index) => defaultCellText(Math.floor(index / preset.columns), index % preset.columns, preset.header)), header: preset.header, width: 560, height: Math.max(250, preset.rows * 64), borderColor: color, headerColor: color, textColor: color, backgroundColor: "#ffffff", borderWidth: 3, fontSize: preset.columns >= 5 ? 15 : 20 };
}
function createGridData(variant: string, color: string): SmartGridData {
  const width = 560; const height = 400; const normalized = GRID_PRESETS[variant] ?? GRID_PRESETS["grid-2x2"];
  return { type: "grid", variant, width, height, gap: 12, radius: 18, borderColor: color, backgroundColor: "#f4f4f5", slots: normalized.map(([x, y, slotWidth, slotHeight], index) => ({ x: x * width, y: y * height, width: slotWidth * width, height: slotHeight * height, label: `Foto ${index + 1}` })) };
}
function createFrameData(variant: string, color: string): SmartFrameData {
  return { type: "frame", variant, width: 520, height: 380, radius: variant === "frame-rounded" ? 48 : variant === "frame-photo" ? 6 : 22, borderColor: color, borderWidth: variant === "frame-double" ? 8 : 14, backgroundColor: "#f4f4f5" };
}
function chartTypeForVariant(variant: string): SmartChartType {
  if (variant.includes("progress")) return "progress";
  if (variant.includes("radar")) return "radar";
  if (variant.includes("stacked")) return "stacked-bar";
  if (variant.includes("grouped")) return "grouped-bar";
  if (variant.includes("area")) return "area";
  if (variant.includes("line")) return "line";
  if (variant.includes("pie")) return "pie";
  if (variant.includes("donut")) return "donut";
  return "bar";
}
function createChartData(variant: string, color: string): SmartChartData {
  const chartType = chartTypeForVariant(variant);
  const labels = ["Gen", "Feb", "Mar", "Apr", "Mag"];
  const values = [32, 58, 46, 82, 68];
  const colors = [color, "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b"];
  const series = chartType === "grouped-bar" || chartType === "stacked-bar" || chartType === "line" || chartType === "area"
    ? [{ name: "Serie A", values, color }, { name: "Serie B", values: [24, 44, 62, 56, 78], color: colors[1] }]
    : [{ name: "Serie A", values, color }];
  return { type: "chart", variant, chartType, width: 620, height: 420, title: chartType === "progress" ? "Avanzamento progetto" : "Risultati", labels, values, colors, series, backgroundColor: "#ffffff", textColor: "#18181b", gridColor: "#e4e4e7", showLegend: ["donut", "pie", "grouped-bar", "stacked-bar", "line", "area"].includes(chartType), showValues: true, showGrid: !["donut", "pie", "progress"].includes(chartType), rounded: true, valueFormat: chartType === "progress" ? "percent" : "number", currencySymbol: "€", maxValue: 100 };
}
function createModuleData(variant: string, color: string): SmartModuleData {
  const presets: Record<string, Partial<SmartModuleData>> = {
    "module-kpi": { title: "€ 24.580", subtitle: "+18,4% questo mese", body: "Ricavi complessivi", ctaLabel: "Vedi report", layout: "card" },
    "module-testimonial": { title: "Esperienza eccellente", subtitle: "★★★★★", body: "Un servizio rapido, curato e davvero professionale.", ctaLabel: "Leggi recensione", layout: "horizontal" },
    "module-contact": { title: "Mario Rossi", subtitle: "Creative Director", body: "mario@example.com\n+39 333 000 0000", ctaLabel: "Contatta", layout: "horizontal", showMedia: true },
    "module-checklist": { title: "Checklist", subtitle: "3 attività", body: "✓ Brief approvato\n○ Esportazione finale\n○ Consegna cliente", ctaLabel: "Apri attività", layout: "card" },
  };
  const preset = presets[variant] ?? {};
  return { type: "module", variant, layout: preset.layout ?? "feature", width: 580, height: 340, radius: 28, padding: 30, backgroundColor: "#ffffff", accentColor: color, textColor: "#18181b", title: preset.title ?? "Titolo modulo", subtitle: preset.subtitle ?? "Sottotitolo", body: preset.body ?? "Descrizione configurabile del contenuto.", ctaLabel: preset.ctaLabel ?? "Scopri di più", imageUrl: undefined, showMedia: preset.showMedia ?? false };
}

function applyMetadata(group: fabric.Group, data: SmartElementData): SmartFabricObject {
  const target = group as SmartFabricObject;
  ensureObjectId(group); markSvgObject(group, "smart"); target.ddoneSmartType = data.type; target.ddoneSmartVariant = data.variant; target.ddoneSmartData = JSON.stringify(data); target.ddoneMediaKind = "vector"; target.ddoneFormat = "smart";
  group.set({ subTargetCheck: true, interactive: true, objectCaching: false }); return target;
}

function tableObjects(data: SmartTableData): fabric.FabricObject[] {
  const objects: fabric.FabricObject[] = []; const cellWidth = data.width / data.columns; const cellHeight = data.height / data.rows;
  objects.push(new fabric.Rect({ left: 0, top: 0, width: data.width, height: data.height, rx: 18, ry: 18, fill: data.backgroundColor, stroke: data.borderColor, strokeWidth: data.borderWidth, originX: "left", originY: "top" }));
  if (data.header) objects.push(new fabric.Rect({ left: data.borderWidth / 2, top: data.borderWidth / 2, width: data.width - data.borderWidth, height: cellHeight - data.borderWidth / 2, rx: 16, ry: 16, fill: data.headerColor, opacity: .14, originX: "left", originY: "top", selectable: false, evented: false }));
  for (let row = 1; row < data.rows; row += 1) objects.push(new fabric.Line([0, row * cellHeight, data.width, row * cellHeight], { stroke: data.borderColor, strokeWidth: data.borderWidth, selectable: false, evented: false }));
  for (let column = 1; column < data.columns; column += 1) objects.push(new fabric.Line([column * cellWidth, 0, column * cellWidth, data.height], { stroke: data.borderColor, strokeWidth: data.borderWidth, selectable: false, evented: false }));
  data.cells.forEach((text, index) => { const row = Math.floor(index / data.columns); const column = index % data.columns; const cell = new fabric.Textbox(text, { left: column * cellWidth + 10, top: row * cellHeight + Math.max(8, (cellHeight - data.fontSize * 1.25) / 2), width: Math.max(20, cellWidth - 20), fontFamily: "Inter", fontSize: data.fontSize, fontWeight: data.header && row === 0 ? "700" : "400", fill: data.textColor, textAlign: column === data.columns - 1 && data.columns <= 3 ? "right" : "left", editable: true, originX: "left", originY: "top" }); (cell as fabric.Textbox & { ddoneSmartCellIndex?: number }).ddoneSmartCellIndex = index; objects.push(cell); });
  return objects;
}

async function imageForSlot(url: string, slot: SmartSlot, radius = 16): Promise<fabric.FabricObject | null> {
  try { const image = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" }); const scale = Math.max(slot.width / (image.width || 1), slot.height / (image.height || 1)); image.set({ left: slot.x + (slot.width - (image.width || 1) * scale) / 2, top: slot.y + (slot.height - (image.height || 1) * scale) / 2, scaleX: scale, scaleY: scale, selectable: false, evented: false, clipPath: new fabric.Rect({ left: slot.x, top: slot.y, width: slot.width, height: slot.height, rx: radius, ry: radius, absolutePositioned: true, originX: "left", originY: "top" }) }); return image; }
  catch { return null; }
}
async function gridObjects(data: SmartGridData): Promise<fabric.FabricObject[]> {
  const objects: fabric.FabricObject[] = [];
  for (const [index, slot] of data.slots.entries()) { if (slot.imageUrl) { const image = await imageForSlot(slot.imageUrl, slot, data.radius); if (image) objects.push(image); } objects.push(new fabric.Rect({ left: slot.x, top: slot.y, width: slot.width, height: slot.height, rx: data.radius, ry: data.radius, fill: slot.imageUrl ? "rgba(0,0,0,0)" : data.backgroundColor, stroke: data.borderColor, strokeWidth: 3, strokeDashArray: slot.imageUrl ? undefined : [10, 8], originX: "left", originY: "top", selectable: false, evented: false })); if (!slot.imageUrl) objects.push(new fabric.Textbox(slot.label || `Foto ${index + 1}`, { left: slot.x + 12, top: slot.y + slot.height / 2 - 10, width: Math.max(20, slot.width - 24), fontSize: 18, fontFamily: "Inter", fill: data.borderColor, opacity: .62, textAlign: "center", selectable: false, evented: false })); }
  return objects;
}
async function frameObjects(data: SmartFrameData): Promise<fabric.FabricObject[]> {
  const objects: fabric.FabricObject[] = []; if (data.imageUrl) { const image = await imageForSlot(data.imageUrl, { x: 0, y: 0, width: data.width, height: data.height, label: "Foto" }, data.radius); if (image) objects.push(image); }
  objects.push(new fabric.Rect({ left: 0, top: 0, width: data.width, height: data.height, rx: data.radius, ry: data.radius, fill: data.imageUrl ? "rgba(0,0,0,0)" : data.backgroundColor, stroke: data.borderColor, strokeWidth: data.borderWidth, originX: "left", originY: "top" }));
  if (!data.imageUrl) objects.push(new fabric.Textbox("Scegli una foto dalla libreria", { left: 40, top: data.height / 2 - 14, width: data.width - 80, textAlign: "center", fontFamily: "Inter", fontSize: 20, fill: data.borderColor, opacity: .62, selectable: false, evented: false }));
  if (data.variant === "frame-double") objects.push(new fabric.Rect({ left: data.borderWidth * 1.5, top: data.borderWidth * 1.5, width: data.width - data.borderWidth * 3, height: data.height - data.borderWidth * 3, rx: Math.max(0, data.radius - 8), ry: Math.max(0, data.radius - 8), fill: "rgba(0,0,0,0)", stroke: data.borderColor, strokeWidth: Math.max(2, data.borderWidth / 3), selectable: false, evented: false }));
  return objects;
}

function polar(cx: number, cy: number, radius: number, angle: number) { const radians = (angle - 90) * Math.PI / 180; return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) }; }
function donutPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
  const a = polar(cx, cy, outer, end); const b = polar(cx, cy, outer, start); const large = end - start <= 180 ? 0 : 1;
  if (inner <= 0) return `M ${cx} ${cy} L ${a.x} ${a.y} A ${outer} ${outer} 0 ${large} 0 ${b.x} ${b.y} Z`;
  const c = polar(cx, cy, inner, start); const d = polar(cx, cy, inner, end);
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 ${large} 0 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 ${large} 1 ${d.x} ${d.y} Z`;
}
function arcStrokePath(cx: number, cy: number, radius: number, start: number, end: number): string {
  const a = polar(cx, cy, radius, start); const b = polar(cx, cy, radius, end); const sweep = end - start; return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export function chartSeriesFor(data: SmartChartData): SmartChartSeries[] {
  const fallback = [{ name: "Serie A", values: data.values ?? [], color: data.colors?.[0] ?? "#7c3aed" }];
  const source = Array.isArray(data.series) && data.series.length ? data.series : fallback;
  return source.slice(0, 8).map((series, index) => ({ name: series.name || `Serie ${index + 1}`, values: Array.isArray(series.values) ? series.values.map((value) => Number(value) || 0) : [], color: series.color || data.colors?.[index] || "#7c3aed" }));
}
function formatChartValue(data: SmartChartData, value: number): string {
  if (data.valueFormat === "percent") return `${Math.round(value * 10) / 10}%`;
  if (data.valueFormat === "currency") return `${data.currencySymbol ?? "€"}${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value)}`;
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(value);
}
function legendObjects(data: SmartChartData, series: SmartChartSeries[], startY = 90): fabric.FabricObject[] {
  if (!data.showLegend) return [];
  return series.flatMap((entry, index) => {
    const y = startY + index * 30;
    return [new fabric.Circle({ left: data.width - 170, top: y, radius: 6, fill: entry.color, selectable: false, evented: false }), new fabric.Textbox(entry.name, { left: data.width - 150, top: y - 2, width: 125, fontFamily: "Inter", fontSize: 12, fill: data.textColor, selectable: false, evented: false })];
  });
}
function chartObjects(data: SmartChartData): fabric.FabricObject[] {
  const objects: fabric.FabricObject[] = [new fabric.Rect({ left: 0, top: 0, width: data.width, height: data.height, rx: data.rounded ? 24 : 0, ry: data.rounded ? 24 : 0, fill: data.backgroundColor, stroke: data.gridColor, strokeWidth: 2, originX: "left", originY: "top" })];
  objects.push(new fabric.Textbox(data.title, { left: 28, top: 22, width: data.width - 56, fontFamily: "Inter", fontSize: 24, fontWeight: "700", fill: data.textColor, editable: true }));
  const series = chartSeriesFor(data);
  const type = data.chartType ?? "bar";
  const legendSpace = data.showLegend && !["donut", "pie", "progress"].includes(type) ? 155 : 0;
  const chartLeft = 54, chartTop = 82, chartWidth = data.width - 92 - legendSpace, chartHeight = data.height - 140;
  const allValues = series.flatMap((entry) => entry.values);
  const max = Math.max(1, data.maxValue ?? 0, ...allValues.map((value) => Math.abs(value)));
  const showGrid = data.showGrid !== false;
  if (showGrid && !["donut", "pie", "progress", "radar"].includes(type)) {
    for (let line = 0; line <= 4; line += 1) objects.push(new fabric.Line([chartLeft, chartTop + (chartHeight * line) / 4, chartLeft + chartWidth, chartTop + (chartHeight * line) / 4], { stroke: data.gridColor, strokeWidth: 1, selectable: false, evented: false }));
  }
  if (type === "bar") {
    const values = series[0]?.values ?? []; const slot = chartWidth / Math.max(1, values.length); const barWidth = slot * .58;
    values.forEach((value, index) => { const h = (Math.abs(value) / max) * (chartHeight - 30); const x = chartLeft + index * slot + (slot - barWidth) / 2; const y = chartTop + chartHeight - h; objects.push(new fabric.Rect({ left: x, top: y, width: barWidth, height: h, rx: data.rounded ? 8 : 0, ry: data.rounded ? 8 : 0, fill: series[0].color, originX: "left", originY: "top", selectable: false, evented: false })); objects.push(new fabric.Textbox(data.labels[index] ?? `${index + 1}`, { left: chartLeft + index * slot, top: chartTop + chartHeight + 8, width: slot, fontFamily: "Inter", fontSize: 12, textAlign: "center", fill: data.textColor, selectable: false, evented: false })); if (data.showValues) objects.push(new fabric.Textbox(formatChartValue(data, value), { left: x - 8, top: Math.max(chartTop, y - 22), width: barWidth + 16, fontFamily: "Inter", fontSize: 11, fontWeight: "600", textAlign: "center", fill: data.textColor, selectable: false, evented: false })); });
  } else if (type === "grouped-bar") {
    const count = Math.max(1, data.labels.length); const slot = chartWidth / count; const groupWidth = slot * .76; const barWidth = groupWidth / Math.max(1, series.length);
    data.labels.forEach((label, index) => { series.forEach((entry, seriesIndex) => { const value = entry.values[index] ?? 0; const h = (Math.abs(value) / max) * (chartHeight - 30); const x = chartLeft + index * slot + (slot - groupWidth) / 2 + seriesIndex * barWidth; const y = chartTop + chartHeight - h; objects.push(new fabric.Rect({ left: x, top: y, width: Math.max(3, barWidth - 3), height: h, rx: data.rounded ? 5 : 0, ry: data.rounded ? 5 : 0, fill: entry.color, selectable: false, evented: false })); }); objects.push(new fabric.Textbox(label, { left: chartLeft + index * slot, top: chartTop + chartHeight + 8, width: slot, fontFamily: "Inter", fontSize: 11, textAlign: "center", fill: data.textColor, selectable: false, evented: false })); }); objects.push(...legendObjects(data, series));
  } else if (type === "stacked-bar") {
    const totals = data.labels.map((_, index) => series.reduce((sum, entry) => sum + Math.max(0, entry.values[index] ?? 0), 0)); const stackMax = Math.max(1, ...totals); const slot = chartWidth / Math.max(1, data.labels.length); const barWidth = slot * .58;
    data.labels.forEach((label, index) => { let bottom = chartTop + chartHeight; series.forEach((entry) => { const value = Math.max(0, entry.values[index] ?? 0); const h = (value / stackMax) * (chartHeight - 30); bottom -= h; objects.push(new fabric.Rect({ left: chartLeft + index * slot + (slot - barWidth) / 2, top: bottom, width: barWidth, height: h, fill: entry.color, selectable: false, evented: false })); }); objects.push(new fabric.Textbox(label, { left: chartLeft + index * slot, top: chartTop + chartHeight + 8, width: slot, fontFamily: "Inter", fontSize: 11, textAlign: "center", fill: data.textColor, selectable: false, evented: false })); if (data.showValues) objects.push(new fabric.Textbox(formatChartValue(data, totals[index]), { left: chartLeft + index * slot, top: Math.max(chartTop, bottom - 20), width: slot, fontFamily: "Inter", fontSize: 10, textAlign: "center", fill: data.textColor, selectable: false, evented: false })); }); objects.push(...legendObjects(data, series));
  } else if (type === "line" || type === "area") {
    series.forEach((entry) => { const points = entry.values.map((value, index) => new fabric.Point(chartLeft + (chartWidth * index) / Math.max(1, entry.values.length - 1), chartTop + chartHeight - (Math.abs(value) / max) * (chartHeight - 24))); if (type === "area" && points.length > 1) objects.push(new fabric.Polygon([{ x: points[0].x, y: chartTop + chartHeight }, ...points.map((point) => ({ x: point.x, y: point.y })), { x: points[points.length - 1].x, y: chartTop + chartHeight }], { fill: entry.color, opacity: .18, selectable: false, evented: false })); for (let index = 1; index < points.length; index += 1) objects.push(new fabric.Line([points[index - 1].x, points[index - 1].y, points[index].x, points[index].y], { stroke: entry.color, strokeWidth: 5, strokeLineCap: "round", selectable: false, evented: false })); points.forEach((point, index) => { objects.push(new fabric.Circle({ left: point.x - 5, top: point.y - 5, radius: 5, fill: entry.color, stroke: data.backgroundColor, strokeWidth: 2, selectable: false, evented: false })); if (data.showValues && series.length === 1) objects.push(new fabric.Textbox(formatChartValue(data, entry.values[index] ?? 0), { left: point.x - 28, top: point.y - 25, width: 56, fontFamily: "Inter", fontSize: 10, textAlign: "center", fill: data.textColor, selectable: false, evented: false })); }); }); data.labels.forEach((label, index) => { const x = chartLeft + (chartWidth * index) / Math.max(1, data.labels.length - 1); objects.push(new fabric.Textbox(label, { left: x - 30, top: chartTop + chartHeight + 8, width: 60, fontFamily: "Inter", fontSize: 11, textAlign: "center", fill: data.textColor, selectable: false, evented: false })); }); objects.push(...legendObjects(data, series));
  } else if (type === "donut" || type === "pie") {
    const values = series[0]?.values ?? []; const total = Math.max(1, values.reduce((sum, value) => sum + Math.max(0, value), 0)); const cx = data.showLegend ? data.width * .38 : data.width / 2; const cy = chartTop + chartHeight / 2; const outer = Math.min(data.showLegend ? data.width * .5 : data.width, chartHeight) * .38; const inner = type === "donut" ? outer * .58 : 0; let angle = 0;
    values.forEach((value, index) => { const sweep = (Math.max(0, value) / total) * 360; objects.push(new fabric.Path(donutPath(cx, cy, outer, inner, angle, angle + Math.max(.5, sweep - 1)), { fill: data.colors[index % data.colors.length] ?? series[0].color, strokeWidth: 0, selectable: false, evented: false })); angle += sweep; });
    if (type === "donut") objects.push(new fabric.Textbox(formatChartValue(data, total), { left: cx - inner, top: cy - 18, width: inner * 2, fontFamily: "Inter", fontSize: 25, fontWeight: "700", textAlign: "center", fill: data.textColor, selectable: false, evented: false }));
    if (data.showLegend) data.labels.forEach((label, index) => { const x = data.width - 190; const y = 92 + index * 36; objects.push(new fabric.Circle({ left: x, top: y, radius: 6, fill: data.colors[index % data.colors.length] ?? series[0].color, selectable: false, evented: false })); objects.push(new fabric.Textbox(`${label}${data.showValues ? ` · ${formatChartValue(data, values[index] ?? 0)}` : ""}`, { left: x + 20, top: y - 2, width: 150, fontFamily: "Inter", fontSize: 12, fill: data.textColor, selectable: false, evented: false })); });
  } else if (type === "radar") {
    const count = Math.max(3, data.labels.length); const cx = chartLeft + chartWidth / 2; const cy = chartTop + chartHeight / 2; const radius = Math.min(chartWidth, chartHeight) * .39;
    for (let ring = 1; ring <= 4; ring += 1) { const ringPoints = Array.from({ length: count }, (_, index) => polar(cx, cy, radius * ring / 4, index * 360 / count)); objects.push(new fabric.Polygon(ringPoints, { fill: "rgba(0,0,0,0)", stroke: data.gridColor, strokeWidth: 1, selectable: false, evented: false })); }
    data.labels.forEach((label, index) => { const edge = polar(cx, cy, radius, index * 360 / count); const text = polar(cx, cy, radius + 23, index * 360 / count); objects.push(new fabric.Line([cx, cy, edge.x, edge.y], { stroke: data.gridColor, strokeWidth: 1, selectable: false, evented: false })); objects.push(new fabric.Textbox(label, { left: text.x - 35, top: text.y - 7, width: 70, fontFamily: "Inter", fontSize: 10, textAlign: "center", fill: data.textColor, selectable: false, evented: false })); });
    series.slice(0, 4).forEach((entry) => { const points = Array.from({ length: count }, (_, index) => polar(cx, cy, radius * Math.max(0, Math.min(1, (entry.values[index] ?? 0) / max)), index * 360 / count)); objects.push(new fabric.Polygon(points, { fill: entry.color, opacity: .18, stroke: entry.color, strokeWidth: 3, selectable: false, evented: false })); points.forEach((point) => objects.push(new fabric.Circle({ left: point.x - 4, top: point.y - 4, radius: 4, fill: entry.color, selectable: false, evented: false }))); }); objects.push(...legendObjects(data, series));
  } else {
    const value = Math.max(0, series[0]?.values[0] ?? data.values[0] ?? 0); const maximum = Math.max(1, data.maxValue ?? 100); const percent = Math.max(0, Math.min(100, value / maximum * 100)); const cx = data.width / 2; const cy = chartTop + chartHeight / 2; const radius = Math.min(chartWidth, chartHeight) * .36; const strokeWidth = Math.max(16, radius * .18);
    objects.push(new fabric.Circle({ left: cx - radius, top: cy - radius, radius, fill: "rgba(0,0,0,0)", stroke: data.gridColor, strokeWidth, selectable: false, evented: false })); if (percent > .1) objects.push(new fabric.Path(arcStrokePath(cx, cy, radius, 0, Math.min(359.8, percent * 3.6)), { fill: "rgba(0,0,0,0)", stroke: series[0]?.color ?? data.colors[0], strokeWidth, strokeLineCap: "round", selectable: false, evented: false })); objects.push(new fabric.Textbox(`${Math.round(percent)}%`, { left: cx - radius, top: cy - 25, width: radius * 2, fontFamily: "Inter", fontSize: 36, fontWeight: "700", textAlign: "center", fill: data.textColor, selectable: false, evented: false })); if (data.showValues) objects.push(new fabric.Textbox(`${formatChartValue(data, value)} / ${formatChartValue(data, maximum)}`, { left: cx - radius, top: cy + 22, width: radius * 2, fontFamily: "Inter", fontSize: 12, textAlign: "center", fill: data.textColor, opacity: .65, selectable: false, evented: false }));
  }
  return objects;
}

async function moduleObjects(data: SmartModuleData): Promise<fabric.FabricObject[]> {
  const objects: fabric.FabricObject[] = [new fabric.Rect({ left: 0, top: 0, width: data.width, height: data.height, rx: data.radius, ry: data.radius, fill: data.backgroundColor, stroke: data.accentColor, strokeWidth: 2, shadow: new fabric.Shadow({ color: "rgba(0,0,0,.12)", blur: 24, offsetY: 10 }), originX: "left", originY: "top" })];
  const mediaWidth = data.showMedia ? (data.layout === "horizontal" ? data.width * .34 : data.width - data.padding * 2) : 0; const mediaHeight = data.showMedia ? (data.layout === "horizontal" ? data.height - data.padding * 2 : data.height * .38) : 0;
  if (data.showMedia) { const slot = { x: data.padding, y: data.padding, width: mediaWidth, height: mediaHeight, label: "Media" }; if (data.imageUrl) { const image = await imageForSlot(data.imageUrl, slot, Math.max(8, data.radius - 10)); if (image) objects.push(image); } objects.push(new fabric.Rect({ left: slot.x, top: slot.y, width: slot.width, height: slot.height, rx: Math.max(8, data.radius - 10), ry: Math.max(8, data.radius - 10), fill: data.imageUrl ? "rgba(0,0,0,0)" : `${data.accentColor}18`, stroke: data.imageUrl ? undefined : data.accentColor, strokeDashArray: data.imageUrl ? undefined : [9, 7], selectable: false, evented: false })); }
  const textLeft = data.layout === "horizontal" && data.showMedia ? data.padding * 2 + mediaWidth : data.padding; const textTop = data.layout !== "horizontal" && data.showMedia ? data.padding * 2 + mediaHeight : data.padding; const textWidth = data.width - textLeft - data.padding;
  objects.push(new fabric.Rect({ left: textLeft, top: textTop, width: 54, height: 6, rx: 3, ry: 3, fill: data.accentColor, selectable: false, evented: false }));
  objects.push(new fabric.Textbox(data.title, { left: textLeft, top: textTop + 20, width: textWidth, fontFamily: "Inter", fontSize: 30, fontWeight: "700", fill: data.textColor, editable: true }));
  objects.push(new fabric.Textbox(data.subtitle, { left: textLeft, top: textTop + 64, width: textWidth, fontFamily: "Inter", fontSize: 14, fontWeight: "600", fill: data.accentColor, editable: true }));
  objects.push(new fabric.Textbox(data.body, { left: textLeft, top: textTop + 94, width: textWidth, fontFamily: "Inter", fontSize: 16, lineHeight: 1.35, fill: data.textColor, opacity: .78, editable: true }));
  if (data.ctaLabel) { const ctaWidth = Math.min(190, Math.max(110, data.ctaLabel.length * 9 + 34)); const y = data.height - data.padding - 38; objects.push(new fabric.Rect({ left: textLeft, top: y, width: ctaWidth, height: 38, rx: 12, ry: 12, fill: data.accentColor, selectable: false, evented: false })); objects.push(new fabric.Textbox(data.ctaLabel, { left: textLeft + 12, top: y + 10, width: ctaWidth - 24, fontFamily: "Inter", fontSize: 13, fontWeight: "700", textAlign: "center", fill: "#ffffff", editable: true })); }
  return objects;
}

export async function buildSmartElement(data: SmartElementData): Promise<SmartFabricObject> {
  const objects = data.type === "table" ? tableObjects(data) : data.type === "grid" ? await gridObjects(data) : data.type === "frame" ? await frameObjects(data) : data.type === "chart" ? chartObjects(data) : await moduleObjects(data);
  return applyMetadata(new fabric.Group(objects, { originX: "left", originY: "top", objectCaching: false }), data);
}
export async function smartElementFromSource(sourceId: string, color: string): Promise<SmartFabricObject | null> {
  const variant = structuralName(sourceId); if (!variant) return null;
  if (TABLE_PRESETS[variant]) return buildSmartElement(createTableData(variant, color));
  if (GRID_PRESETS[variant]) return buildSmartElement(createGridData(variant, color));
  if (variant.startsWith("frame-")) return buildSmartElement(createFrameData(variant, color));
  if (variant.startsWith("chart-")) return buildSmartElement(createChartData(variant, color));
  if (variant.startsWith("module-")) return buildSmartElement(createModuleData(variant, color));
  return null;
}
export function readSmartElementData(object: fabric.FabricObject | null | undefined): SmartElementData | null {
  const raw = (object as SmartFabricObject | null | undefined)?.ddoneSmartData; if (!raw) return null;
  try { const data = JSON.parse(raw) as SmartElementData; return data && ["table", "grid", "frame", "chart", "module"].includes(data.type) ? data : null; } catch { return null; }
}
export function isSmartElement(object: fabric.FabricObject | null | undefined): object is SmartFabricObject { return Boolean(readSmartElementData(object)); }
export async function rebuildSmartElement(canvas: fabric.Canvas, source: fabric.FabricObject, data: SmartElementData): Promise<SmartFabricObject> {
  const replacement = await buildSmartElement(data); replacement.set({ left: source.left, top: source.top, originX: source.originX, originY: source.originY, angle: source.angle, scaleX: source.scaleX, scaleY: source.scaleY, flipX: source.flipX, flipY: source.flipY, opacity: source.opacity, shadow: source.shadow });
  const sourceTarget = source as SmartFabricObject; replacement.ddoneId = sourceTarget.ddoneId; replacement.templateEditable = sourceTarget.templateEditable; replacement.templateLocked = sourceTarget.templateLocked;
  const index = canvas.getObjects().indexOf(source); canvas.remove(source); canvas.add(replacement); if (index >= 0) (canvas as unknown as { moveObjectTo?: (object: fabric.FabricObject, index: number) => void }).moveObjectTo?.(replacement, index); canvas.setActiveObject(replacement); replacement.setCoords(); canvas.requestRenderAll(); canvas.fire("object:modified", { target: replacement } as never); return replacement;
}
export function resizeTableData(data: SmartTableData, rows: number, columns: number): SmartTableData {
  const nextRows = Math.max(1, Math.min(20, Math.round(rows))); const nextColumns = Math.max(1, Math.min(10, Math.round(columns)));
  const cells = Array.from({ length: nextRows * nextColumns }, (_, index) => { const row = Math.floor(index / nextColumns); const column = index % nextColumns; if (row < data.rows && column < data.columns) return data.cells[row * data.columns + column] ?? ""; return defaultCellText(row, column, data.header); });
  return { ...data, rows: nextRows, columns: nextColumns, cells, height: Math.max(180, nextRows * 64), fontSize: nextColumns >= 5 ? Math.min(data.fontSize, 15) : data.fontSize };
}
