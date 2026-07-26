import * as fabric from "fabric";
import { ensureObjectId, markSvgObject, type DDoneFabricObject } from "../canvas-model";

export type SmartElementType = "table" | "grid" | "frame";

export interface SmartTableData {
  type: "table";
  variant: string;
  rows: number;
  columns: number;
  cells: string[];
  header: boolean;
  width: number;
  height: number;
  borderColor: string;
  headerColor: string;
  textColor: string;
  backgroundColor: string;
  borderWidth: number;
  fontSize: number;
}

export interface SmartSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  imageUrl?: string;
}

export interface SmartGridData {
  type: "grid";
  variant: string;
  width: number;
  height: number;
  gap: number;
  radius: number;
  borderColor: string;
  backgroundColor: string;
  slots: SmartSlot[];
}

export interface SmartFrameData {
  type: "frame";
  variant: string;
  width: number;
  height: number;
  radius: number;
  borderColor: string;
  borderWidth: number;
  backgroundColor: string;
  imageUrl?: string;
}

export type SmartElementData = SmartTableData | SmartGridData | SmartFrameData;

export type SmartFabricObject = fabric.Group & DDoneFabricObject & {
  ddoneSmartType?: SmartElementType;
  ddoneSmartVariant?: string;
  ddoneSmartData?: string;
};

const TABLE_PRESETS: Record<string, Pick<SmartTableData, "rows" | "columns" | "header">> = {
  "table-menu": { rows: 4, columns: 2, header: true },
  "table-price-list": { rows: 6, columns: 2, header: false },
  "table-comparison": { rows: 5, columns: 4, header: true },
  "table-week": { rows: 6, columns: 7, header: true },
  "table-wine": { rows: 5, columns: 3, header: true },
  "table-menu-wide": { rows: 5, columns: 3, header: false },
};

const GRID_PRESETS: Record<string, Array<[number, number, number, number]>> = {
  "grid-2x2": [[0, 0, 0.48, 0.46], [0.52, 0, 0.48, 0.46], [0, 0.54, 0.48, 0.46], [0.52, 0.54, 0.48, 0.46]],
  "grid-3-columns": [[0, 0, 0.31, 1], [0.345, 0, 0.31, 1], [0.69, 0, 0.31, 1]],
  "grid-hero": [[0, 0, 1, 0.61], [0, 0.66, 0.31, 0.34], [0.345, 0.66, 0.31, 0.34], [0.69, 0.66, 0.31, 0.34]],
  "grid-three": [[0, 0, 0.61, 1], [0.66, 0, 0.34, 0.47], [0.66, 0.53, 0.34, 0.47]],
  "grid-masonry": [[0, 0, 0.31, 0.58], [0.345, 0, 0.31, 0.37], [0.69, 0, 0.31, 0.58], [0, 0.64, 0.31, 0.36], [0.345, 0.43, 0.31, 0.57], [0.69, 0.64, 0.31, 0.36]],
};

function structuralName(sourceId: string): string | null {
  const match = /^local-pack:structures:([^:]+):svg$/.exec(sourceId);
  return match?.[1] ?? null;
}

function defaultCellText(row: number, column: number, header: boolean): string {
  if (header && row === 0) return column === 0 ? "Voce" : column === 1 ? "Prezzo" : `Colonna ${column + 1}`;
  if (column === 0) return `Elemento ${row + (header ? 0 : 1)}`;
  if (column === 1) return "€ 0,00";
  return "Testo";
}

function createTableData(variant: string, color: string): SmartTableData {
  const preset = TABLE_PRESETS[variant] ?? TABLE_PRESETS["table-menu"];
  const cells = Array.from({ length: preset.rows * preset.columns }, (_, index) => {
    const row = Math.floor(index / preset.columns);
    const column = index % preset.columns;
    return defaultCellText(row, column, preset.header);
  });
  return {
    type: "table",
    variant,
    rows: preset.rows,
    columns: preset.columns,
    cells,
    header: preset.header,
    width: 560,
    height: Math.max(250, preset.rows * 64),
    borderColor: color,
    headerColor: color,
    textColor: color,
    backgroundColor: "#ffffff",
    borderWidth: 3,
    fontSize: preset.columns >= 5 ? 15 : 20,
  };
}

function createGridData(variant: string, color: string): SmartGridData {
  const width = 560;
  const height = 400;
  const normalized = GRID_PRESETS[variant] ?? GRID_PRESETS["grid-2x2"];
  return {
    type: "grid",
    variant,
    width,
    height,
    gap: 12,
    radius: 18,
    borderColor: color,
    backgroundColor: "#f4f4f5",
    slots: normalized.map(([x, y, slotWidth, slotHeight], index) => ({
      x: x * width,
      y: y * height,
      width: slotWidth * width,
      height: slotHeight * height,
      label: `Foto ${index + 1}`,
    })),
  };
}

function createFrameData(variant: string, color: string): SmartFrameData {
  return {
    type: "frame",
    variant,
    width: 520,
    height: 380,
    radius: variant === "frame-rounded" ? 48 : variant === "frame-photo" ? 6 : 22,
    borderColor: color,
    borderWidth: variant === "frame-double" ? 8 : 14,
    backgroundColor: "#f4f4f5",
  };
}

function applyMetadata(group: fabric.Group, data: SmartElementData): SmartFabricObject {
  const target = group as SmartFabricObject;
  ensureObjectId(group);
  markSvgObject(group, "smart");
  target.ddoneSmartType = data.type;
  target.ddoneSmartVariant = data.variant;
  target.ddoneSmartData = JSON.stringify(data);
  target.ddoneMediaKind = "vector";
  target.ddoneFormat = "smart";
  group.set({ subTargetCheck: true, interactive: true });
  return target;
}

function tableObjects(data: SmartTableData): fabric.FabricObject[] {
  const objects: fabric.FabricObject[] = [];
  const cellWidth = data.width / data.columns;
  const cellHeight = data.height / data.rows;
  objects.push(new fabric.Rect({
    left: 0,
    top: 0,
    width: data.width,
    height: data.height,
    rx: 18,
    ry: 18,
    fill: data.backgroundColor,
    stroke: data.borderColor,
    strokeWidth: data.borderWidth,
    originX: "left",
    originY: "top",
  }));
  if (data.header) {
    objects.push(new fabric.Rect({
      left: data.borderWidth / 2,
      top: data.borderWidth / 2,
      width: data.width - data.borderWidth,
      height: cellHeight - data.borderWidth / 2,
      rx: 16,
      ry: 16,
      fill: data.headerColor,
      opacity: 0.14,
      originX: "left",
      originY: "top",
      selectable: false,
      evented: false,
    }));
  }
  for (let row = 1; row < data.rows; row += 1) {
    objects.push(new fabric.Line([0, row * cellHeight, data.width, row * cellHeight], {
      stroke: data.borderColor,
      strokeWidth: data.borderWidth,
      selectable: false,
      evented: false,
    }));
  }
  for (let column = 1; column < data.columns; column += 1) {
    objects.push(new fabric.Line([column * cellWidth, 0, column * cellWidth, data.height], {
      stroke: data.borderColor,
      strokeWidth: data.borderWidth,
      selectable: false,
      evented: false,
    }));
  }
  data.cells.forEach((text, index) => {
    const row = Math.floor(index / data.columns);
    const column = index % data.columns;
    const cell = new fabric.Textbox(text, {
      left: column * cellWidth + 10,
      top: row * cellHeight + Math.max(8, (cellHeight - data.fontSize * 1.25) / 2),
      width: Math.max(20, cellWidth - 20),
      fontFamily: "Inter",
      fontSize: data.fontSize,
      fontWeight: data.header && row === 0 ? "700" : "400",
      fill: data.textColor,
      textAlign: column === data.columns - 1 && data.columns <= 3 ? "right" : "left",
      editable: true,
      originX: "left",
      originY: "top",
    });
    (cell as any).ddoneSmartCellIndex = index;
    objects.push(cell);
  });
  return objects;
}

async function imageForSlot(url: string, slot: SmartSlot): Promise<fabric.FabricObject | null> {
  try {
    const image = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    const scale = Math.max(slot.width / (image.width || 1), slot.height / (image.height || 1));
    image.set({
      left: slot.x + (slot.width - (image.width || 1) * scale) / 2,
      top: slot.y + (slot.height - (image.height || 1) * scale) / 2,
      scaleX: scale,
      scaleY: scale,
      selectable: false,
      evented: false,
      clipPath: new fabric.Rect({
        left: slot.x,
        top: slot.y,
        width: slot.width,
        height: slot.height,
        rx: 16,
        ry: 16,
        absolutePositioned: true,
        originX: "left",
        originY: "top",
      }),
    });
    return image;
  } catch {
    return null;
  }
}

async function gridObjects(data: SmartGridData): Promise<fabric.FabricObject[]> {
  const objects: fabric.FabricObject[] = [];
  for (const [index, slot] of data.slots.entries()) {
    if (slot.imageUrl) {
      const image = await imageForSlot(slot.imageUrl, slot);
      if (image) objects.push(image);
    }
    objects.push(new fabric.Rect({
      left: slot.x,
      top: slot.y,
      width: slot.width,
      height: slot.height,
      rx: data.radius,
      ry: data.radius,
      fill: slot.imageUrl ? "rgba(0,0,0,0)" : data.backgroundColor,
      stroke: data.borderColor,
      strokeWidth: 3,
      strokeDashArray: slot.imageUrl ? undefined : [10, 8],
      originX: "left",
      originY: "top",
      selectable: false,
      evented: false,
    }));
    if (!slot.imageUrl) {
      objects.push(new fabric.Textbox(slot.label || `Foto ${index + 1}`, {
        left: slot.x + 12,
        top: slot.y + slot.height / 2 - 10,
        width: Math.max(20, slot.width - 24),
        fontSize: 18,
        fontFamily: "Inter",
        fill: data.borderColor,
        opacity: 0.62,
        textAlign: "center",
        selectable: false,
        evented: false,
      }));
    }
  }
  return objects;
}

async function frameObjects(data: SmartFrameData): Promise<fabric.FabricObject[]> {
  const objects: fabric.FabricObject[] = [];
  if (data.imageUrl) {
    const image = await imageForSlot(data.imageUrl, { x: 0, y: 0, width: data.width, height: data.height, label: "Foto" });
    if (image) objects.push(image);
  }
  objects.push(new fabric.Rect({
    left: 0,
    top: 0,
    width: data.width,
    height: data.height,
    rx: data.radius,
    ry: data.radius,
    fill: data.imageUrl ? "rgba(0,0,0,0)" : data.backgroundColor,
    stroke: data.borderColor,
    strokeWidth: data.borderWidth,
    originX: "left",
    originY: "top",
  }));
  if (!data.imageUrl) {
    objects.push(new fabric.Textbox("Inserisci una foto dalla sezione Strumenti", {
      left: 40,
      top: data.height / 2 - 14,
      width: data.width - 80,
      textAlign: "center",
      fontFamily: "Inter",
      fontSize: 20,
      fill: data.borderColor,
      opacity: 0.62,
      selectable: false,
      evented: false,
    }));
  }
  if (data.variant === "frame-double") {
    objects.push(new fabric.Rect({
      left: data.borderWidth * 1.5,
      top: data.borderWidth * 1.5,
      width: data.width - data.borderWidth * 3,
      height: data.height - data.borderWidth * 3,
      rx: Math.max(0, data.radius - 8),
      ry: Math.max(0, data.radius - 8),
      fill: "rgba(0,0,0,0)",
      stroke: data.borderColor,
      strokeWidth: Math.max(2, data.borderWidth / 3),
      selectable: false,
      evented: false,
    }));
  }
  return objects;
}

export async function buildSmartElement(data: SmartElementData): Promise<SmartFabricObject> {
  const objects = data.type === "table"
    ? tableObjects(data)
    : data.type === "grid"
      ? await gridObjects(data)
      : await frameObjects(data);
  return applyMetadata(new fabric.Group(objects, {
    originX: "left",
    originY: "top",
    objectCaching: false,
  }), data);
}

export async function smartElementFromSource(sourceId: string, color: string): Promise<SmartFabricObject | null> {
  const variant = structuralName(sourceId);
  if (!variant) return null;
  if (TABLE_PRESETS[variant]) return buildSmartElement(createTableData(variant, color));
  if (GRID_PRESETS[variant]) return buildSmartElement(createGridData(variant, color));
  if (variant.startsWith("frame-")) return buildSmartElement(createFrameData(variant, color));
  return null;
}

export function readSmartElementData(object: fabric.FabricObject | null | undefined): SmartElementData | null {
  const raw = (object as SmartFabricObject | null | undefined)?.ddoneSmartData;
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SmartElementData;
    return data && ["table", "grid", "frame"].includes(data.type) ? data : null;
  } catch {
    return null;
  }
}

export function isSmartElement(object: fabric.FabricObject | null | undefined): object is SmartFabricObject {
  return Boolean(readSmartElementData(object));
}

export async function rebuildSmartElement(
  canvas: fabric.Canvas,
  source: fabric.FabricObject,
  data: SmartElementData,
): Promise<SmartFabricObject> {
  const replacement = await buildSmartElement(data);
  replacement.set({
    left: source.left,
    top: source.top,
    originX: source.originX,
    originY: source.originY,
    angle: source.angle,
    scaleX: source.scaleX,
    scaleY: source.scaleY,
    flipX: source.flipX,
    flipY: source.flipY,
    opacity: source.opacity,
    shadow: source.shadow,
  });
  const index = canvas.getObjects().indexOf(source);
  canvas.remove(source);
  canvas.add(replacement);
  if (index >= 0) (canvas as any).moveObjectTo?.(replacement, index);
  canvas.setActiveObject(replacement);
  replacement.setCoords();
  canvas.requestRenderAll();
  canvas.fire("object:modified", { target: replacement } as any);
  return replacement;
}

export function resizeTableData(data: SmartTableData, rows: number, columns: number): SmartTableData {
  const nextRows = Math.max(1, Math.min(20, Math.round(rows)));
  const nextColumns = Math.max(1, Math.min(10, Math.round(columns)));
  const cells = Array.from({ length: nextRows * nextColumns }, (_, index) => {
    const row = Math.floor(index / nextColumns);
    const column = index % nextColumns;
    if (row < data.rows && column < data.columns) return data.cells[row * data.columns + column] ?? "";
    return defaultCellText(row, column, data.header);
  });
  return {
    ...data,
    rows: nextRows,
    columns: nextColumns,
    cells,
    height: Math.max(180, nextRows * 64),
    fontSize: nextColumns >= 5 ? Math.min(data.fontSize, 15) : data.fontSize,
  };
}
