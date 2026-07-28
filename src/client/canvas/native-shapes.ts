import * as fabric from "fabric";
import { ensureObjectId, markSvgObject, type DDoneFabricObject } from "../canvas-model";

export type NativeShapeKind =
  | "rect"
  | "rounded-rect"
  | "circle"
  | "ellipse"
  | "line"
  | "arrow"
  | "triangle"
  | "polygon"
  | "star"
  | "ring"
  | "arc"
  | "progress-ring"
  | "callout"
  | "bracket";

export type NativeStrokeStyle = "solid" | "dashed" | "dotted" | "long-dash" | "dash-dot" | "custom";
export type NativeFillMode = "solid" | "transparent" | "linear" | "radial";
export type NativeStrokeCap = "butt" | "round" | "square";
export type NativeStrokeJoin = "miter" | "round" | "bevel";

export interface NativeGradientStop {
  offset: number;
  color: string;
  opacity: number;
}

export interface NativeShapeData {
  version: 1;
  kind: NativeShapeKind;
  width: number;
  height: number;
  fillMode: NativeFillMode;
  fillColor: string;
  fillOpacity: number;
  gradientAngle: number;
  gradientCenterX: number;
  gradientCenterY: number;
  gradientRadius: number;
  gradientStops: NativeGradientStop[];
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  strokeStyle: NativeStrokeStyle;
  customDash: number[];
  strokeLineCap: NativeStrokeCap;
  strokeLineJoin: NativeStrokeJoin;
  cornerRadius: number;
  points: number;
  innerRadius: number;
  startAngle: number;
  endAngle: number;
  progress: number;
  arrowStart: boolean;
  arrowEnd: boolean;
}

export type NativeShapeObject = fabric.FabricObject & DDoneFabricObject & {
  ddoneNativeShape?: boolean;
  ddoneNativeShapeKind?: NativeShapeKind;
  ddoneNativeShapeData?: string;
};

const DEFAULT_STOPS: NativeGradientStop[] = [
  { offset: 0, color: "#7c3aed", opacity: 1 },
  { offset: 1, color: "#ec4899", opacity: 1 },
];

export const NATIVE_SHAPE_LABELS: Record<NativeShapeKind, string> = {
  rect: "Rettangolo",
  "rounded-rect": "Rettangolo arrotondato",
  circle: "Cerchio",
  ellipse: "Ellisse",
  line: "Linea",
  arrow: "Freccia",
  triangle: "Triangolo",
  polygon: "Poligono",
  star: "Stella",
  ring: "Anello",
  arc: "Arco",
  "progress-ring": "Indicatore circolare",
  callout: "Fumetto",
  bracket: "Parentesi",
};

export const NATIVE_SHAPE_GROUPS: Array<{ label: string; items: NativeShapeKind[] }> = [
  { label: "Forme base", items: ["rect", "rounded-rect", "circle", "ellipse", "triangle", "polygon", "star"] },
  { label: "Linee e direzioni", items: ["line", "arrow", "bracket"] },
  { label: "Cerchi e indicatori", items: ["ring", "arc", "progress-ring"] },
  { label: "Comunicazione", items: ["callout"] },
];

export function createNativeShapeData(kind: NativeShapeKind, color = "#7c3aed"): NativeShapeData {
  const lineLike = kind === "line" || kind === "arrow" || kind === "arc" || kind === "bracket";
  const circular = kind === "circle" || kind === "ring" || kind === "arc" || kind === "progress-ring";
  return {
    version: 1,
    kind,
    width: lineLike ? 360 : circular ? 280 : 340,
    height: lineLike ? (kind === "arc" ? 260 : 120) : circular ? 280 : 260,
    fillMode: lineLike || kind === "ring" || kind === "progress-ring" ? "transparent" : "solid",
    fillColor: color,
    fillOpacity: 1,
    gradientAngle: 135,
    gradientCenterX: 0.5,
    gradientCenterY: 0.5,
    gradientRadius: 0.65,
    gradientStops: DEFAULT_STOPS.map((stop, index) => ({ ...stop, color: index === 0 ? color : stop.color })),
    strokeColor: color,
    strokeWidth: lineLike || kind === "ring" || kind === "progress-ring" ? 14 : 4,
    strokeOpacity: 1,
    strokeStyle: "solid",
    customDash: [16, 10],
    strokeLineCap: lineLike || kind === "progress-ring" ? "round" : "butt",
    strokeLineJoin: "round",
    cornerRadius: kind === "rounded-rect" ? 42 : 0,
    points: kind === "star" ? 5 : kind === "polygon" ? 6 : 3,
    innerRadius: kind === "star" ? 0.48 : kind === "ring" ? 0.72 : 0.62,
    startAngle: kind === "arc" ? -35 : -90,
    endAngle: kind === "arc" ? 215 : 270,
    progress: 72,
    arrowStart: false,
    arrowEnd: kind === "arrow",
  };
}

export function dashArrayFor(data: Pick<NativeShapeData, "strokeStyle" | "strokeWidth" | "customDash">): number[] | undefined {
  const width = Math.max(1, data.strokeWidth);
  if (data.strokeStyle === "solid") return undefined;
  if (data.strokeStyle === "dashed") return [width * 2.5, width * 1.5];
  if (data.strokeStyle === "dotted") return [0.01, width * 1.8];
  if (data.strokeStyle === "long-dash") return [width * 5, width * 2];
  if (data.strokeStyle === "dash-dot") return [width * 4, width * 1.5, 0.01, width * 1.5];
  const cleaned = data.customDash.map((value) => Math.max(0.01, Number(value) || 0)).filter((value) => value > 0);
  return cleaned.length ? cleaned : undefined;
}

function clampedStops(stops: NativeGradientStop[]): NativeGradientStop[] {
  const source = stops.length >= 2 ? stops : DEFAULT_STOPS;
  return source
    .map((stop) => ({
      offset: Math.max(0, Math.min(1, Number(stop.offset) || 0)),
      color: stop.color || "#000000",
      opacity: Math.max(0, Math.min(1, Number(stop.opacity) || 0)),
    }))
    .sort((first, second) => first.offset - second.offset);
}

function fillFor(data: NativeShapeData, width: number, height: number): string | fabric.Gradient<"linear"> | fabric.Gradient<"radial"> {
  if (data.fillMode === "transparent") return "rgba(0,0,0,0)";
  if (data.fillMode === "solid") return data.fillColor;
  const colorStops = clampedStops(data.gradientStops);
  if (data.fillMode === "radial") {
    const x = width * data.gradientCenterX;
    const y = height * data.gradientCenterY;
    return new fabric.Gradient<"radial">({
      type: "radial",
      gradientUnits: "pixels",
      coords: { x1: x, y1: y, r1: 0, x2: x, y2: y, r2: Math.max(width, height) * data.gradientRadius },
      colorStops,
    });
  }
  const angle = (data.gradientAngle * Math.PI) / 180;
  const distance = Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle));
  const dx = (Math.cos(angle) * distance) / 2;
  const dy = (Math.sin(angle) * distance) / 2;
  return new fabric.Gradient<"linear">({
    type: "linear",
    gradientUnits: "pixels",
    coords: { x1: width / 2 - dx, y1: height / 2 - dy, x2: width / 2 + dx, y2: height / 2 + dy },
    colorStops,
  });
}

function polygonPoints(count: number, width: number, height: number, innerRatio = 1): Array<{ x: number; y: number }> {
  const safeCount = Math.max(3, Math.min(24, Math.round(count)));
  const points: Array<{ x: number; y: number }> = [];
  const total = innerRatio < 1 ? safeCount * 2 : safeCount;
  for (let index = 0; index < total; index += 1) {
    const ratio = innerRatio < 1 && index % 2 === 1 ? innerRatio : 1;
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
    points.push({ x: width / 2 + Math.cos(angle) * width * 0.48 * ratio, y: height / 2 + Math.sin(angle) * height * 0.48 * ratio });
  }
  return points;
}

function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: cx + Math.cos(radians) * radius, y: cy + Math.sin(radians) * radius };
}

function arcPath(width: number, height: number, startAngle: number, endAngle: number): string {
  const radius = Math.max(1, Math.min(width, height) / 2 - 8);
  const cx = width / 2;
  const cy = height / 2;
  let sweep = endAngle - startAngle;
  while (sweep <= 0) sweep += 360;
  sweep = Math.min(359.999, sweep);
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, startAngle + sweep);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y}`;
}

function commonOptions(data: NativeShapeData, width: number, height: number): fabric.TOptions<fabric.FabricObjectProps> {
  return {
    originX: "left",
    originY: "top",
    fill: fillFor(data, width, height),
    opacity: data.fillOpacity,
    stroke: data.strokeColor,
    strokeWidth: data.strokeWidth,
    strokeDashArray: dashArrayFor(data),
    strokeLineCap: data.strokeLineCap,
    strokeLineJoin: data.strokeLineJoin,
    strokeUniform: true,
    objectCaching: false,
  };
}

function lineObjects(data: NativeShapeData): fabric.FabricObject[] {
  const padding = Math.max(24, data.strokeWidth * 2.5);
  const y = data.height / 2;
  const startX = padding;
  const endX = data.width - padding;
  const objects: fabric.FabricObject[] = [new fabric.Line([startX, y, endX, y], {
    stroke: data.strokeColor,
    strokeWidth: data.strokeWidth,
    strokeDashArray: dashArrayFor(data),
    strokeLineCap: data.strokeLineCap,
    strokeLineJoin: data.strokeLineJoin,
    opacity: data.strokeOpacity,
    selectable: false,
    evented: false,
    strokeUniform: true,
  })];
  const size = Math.max(18, data.strokeWidth * 2.3);
  if (data.arrowStart) objects.push(new fabric.Triangle({ left: startX - size / 2, top: y - size / 2, width: size, height: size, angle: -90, fill: data.strokeColor, opacity: data.strokeOpacity, selectable: false, evented: false }));
  if (data.arrowEnd) objects.push(new fabric.Triangle({ left: endX - size / 2, top: y - size / 2, width: size, height: size, angle: 90, fill: data.strokeColor, opacity: data.strokeOpacity, selectable: false, evented: false }));
  return objects;
}

function calloutPath(width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 3));
  const tailStart = width * 0.58;
  const tailEnd = width * 0.78;
  const tailTip = width * 0.7;
  const bottom = height * 0.78;
  return `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${bottom - r} Q ${width} ${bottom} ${width - r} ${bottom} H ${tailEnd} L ${tailTip} ${height} L ${tailStart} ${bottom} H ${r} Q 0 ${bottom} 0 ${bottom - r} V ${r} Q 0 0 ${r} 0 Z`;
}

function bracketPath(width: number, height: number): string {
  const inset = Math.max(16, width * 0.12);
  return `M ${width - inset} 8 H ${inset} Q 8 8 8 ${inset} V ${height - inset} Q 8 ${height - 8} ${inset} ${height - 8} H ${width - inset}`;
}

function buildShape(data: NativeShapeData): fabric.FabricObject {
  const width = Math.max(24, data.width);
  const height = Math.max(24, data.height);
  const options = commonOptions(data, width, height);
  if (data.kind === "rect" || data.kind === "rounded-rect") return new fabric.Rect({ ...options, width, height, rx: data.kind === "rounded-rect" ? data.cornerRadius : 0, ry: data.kind === "rounded-rect" ? data.cornerRadius : 0 });
  if (data.kind === "circle") return new fabric.Circle({ ...options, radius: Math.min(width, height) / 2 });
  if (data.kind === "ellipse") return new fabric.Ellipse({ ...options, rx: width / 2, ry: height / 2 });
  if (data.kind === "triangle") return new fabric.Triangle({ ...options, width, height });
  if (data.kind === "polygon") return new fabric.Polygon(polygonPoints(data.points, width, height), options);
  if (data.kind === "star") return new fabric.Polygon(polygonPoints(data.points, width, height, Math.max(0.08, Math.min(0.92, data.innerRadius))), options);
  if (data.kind === "line" || data.kind === "arrow") return new fabric.Group(lineObjects(data), { originX: "left", originY: "top", width, height, objectCaching: false, subTargetCheck: false });
  if (data.kind === "ring") return new fabric.Circle({ originX: "left", originY: "top", radius: Math.min(width, height) / 2 - data.strokeWidth / 2, fill: "rgba(0,0,0,0)", stroke: data.strokeColor, strokeWidth: data.strokeWidth, strokeDashArray: dashArrayFor(data), strokeLineCap: data.strokeLineCap, opacity: data.strokeOpacity, strokeUniform: true, objectCaching: false });
  if (data.kind === "arc" || data.kind === "progress-ring") {
    const endAngle = data.kind === "progress-ring" ? data.startAngle + Math.max(0.1, Math.min(99.99, data.progress)) * 3.6 : data.endAngle;
    return new fabric.Path(arcPath(width, height, data.startAngle, endAngle), { originX: "left", originY: "top", fill: "rgba(0,0,0,0)", stroke: data.strokeColor, strokeWidth: data.strokeWidth, strokeDashArray: dashArrayFor(data), strokeLineCap: data.strokeLineCap, strokeLineJoin: data.strokeLineJoin, opacity: data.strokeOpacity, strokeUniform: true, objectCaching: false });
  }
  if (data.kind === "callout") return new fabric.Path(calloutPath(width, height, data.cornerRadius), options);
  return new fabric.Path(bracketPath(width, height), { originX: "left", originY: "top", fill: "rgba(0,0,0,0)", stroke: data.strokeColor, strokeWidth: data.strokeWidth, strokeDashArray: dashArrayFor(data), strokeLineCap: data.strokeLineCap, strokeLineJoin: data.strokeLineJoin, opacity: data.strokeOpacity, strokeUniform: true, objectCaching: false });
}

function attachMetadata(object: fabric.FabricObject, data: NativeShapeData): NativeShapeObject {
  const target = object as NativeShapeObject;
  ensureObjectId(object);
  markSvgObject(object, "native-shape");
  target.ddoneNativeShape = true;
  target.ddoneNativeShapeKind = data.kind;
  target.ddoneNativeShapeData = JSON.stringify(data);
  target.ddoneName = NATIVE_SHAPE_LABELS[data.kind];
  target.ddoneMediaKind = "vector";
  target.ddoneFormat = "native-shape";
  object.set({ objectCaching: false, transparentCorners: false, cornerStyle: "circle", cornerColor: "#7c3aed", borderColor: "#7c3aed" });
  return target;
}

export function buildNativeShape(data: NativeShapeData): NativeShapeObject {
  return attachMetadata(buildShape(normalizeNativeShapeData(data)), normalizeNativeShapeData(data));
}

export function normalizeNativeShapeData(input: Partial<NativeShapeData> & Pick<NativeShapeData, "kind">): NativeShapeData {
  const defaults = createNativeShapeData(input.kind, input.fillColor || input.strokeColor || "#7c3aed");
  return {
    ...defaults,
    ...input,
    version: 1,
    width: Math.max(24, Number(input.width ?? defaults.width)),
    height: Math.max(24, Number(input.height ?? defaults.height)),
    fillOpacity: Math.max(0, Math.min(1, Number(input.fillOpacity ?? defaults.fillOpacity))),
    strokeOpacity: Math.max(0, Math.min(1, Number(input.strokeOpacity ?? defaults.strokeOpacity))),
    strokeWidth: Math.max(0, Math.min(160, Number(input.strokeWidth ?? defaults.strokeWidth))),
    points: Math.max(3, Math.min(24, Math.round(Number(input.points ?? defaults.points)))),
    innerRadius: Math.max(0.05, Math.min(0.95, Number(input.innerRadius ?? defaults.innerRadius))),
    progress: Math.max(0, Math.min(100, Number(input.progress ?? defaults.progress))),
    gradientStops: clampedStops(input.gradientStops ?? defaults.gradientStops),
    customDash: Array.isArray(input.customDash) ? input.customDash : defaults.customDash,
  };
}

export function readNativeShapeData(object: fabric.FabricObject | null | undefined): NativeShapeData | null {
  const raw = (object as NativeShapeObject | null | undefined)?.ddoneNativeShapeData;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<NativeShapeData> & Pick<NativeShapeData, "kind">;
    if (!parsed.kind || !Object.hasOwn(NATIVE_SHAPE_LABELS, parsed.kind)) return null;
    return normalizeNativeShapeData(parsed);
  } catch {
    return null;
  }
}

export function isNativeShape(object: fabric.FabricObject | null | undefined): object is NativeShapeObject {
  return Boolean((object as NativeShapeObject | null | undefined)?.ddoneNativeShape && readNativeShapeData(object));
}

export function rebuildNativeShape(canvas: fabric.Canvas, source: fabric.FabricObject, data: NativeShapeData): NativeShapeObject {
  const replacement = buildNativeShape(data);
  const sourceTarget = source as NativeShapeObject;
  replacement.ddoneId = sourceTarget.ddoneId;
  replacement.templateEditable = sourceTarget.templateEditable;
  replacement.templateLocked = sourceTarget.templateLocked;
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
    shadow: source.shadow,
  });
  const index = canvas.getObjects().indexOf(source);
  canvas.remove(source);
  canvas.add(replacement);
  if (index >= 0) (canvas as unknown as { moveObjectTo?: (object: fabric.FabricObject, index: number) => void }).moveObjectTo?.(replacement, index);
  canvas.setActiveObject(replacement);
  replacement.setCoords();
  canvas.requestRenderAll();
  canvas.fire("object:modified", { target: replacement } as never);
  return replacement;
}
