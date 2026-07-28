import * as fabric from "fabric";
import { ensureObjectId, type DDoneFabricObject } from "../canvas-model";

export type GradientKind = "linear" | "radial";

export interface GradientStop {
  id: string;
  color: string;
  offset: number;
  opacity: number;
}

export interface GradientDefinition {
  kind: GradientKind;
  angle: number;
  centerX: number;
  centerY: number;
  radius: number;
  stops: GradientStop[];
}

export const DEFAULT_GRADIENT: GradientDefinition = {
  kind: "linear",
  angle: 135,
  centerX: 0.5,
  centerY: 0.5,
  radius: 0.72,
  stops: [
    { id: "violet", color: "#6d5dfc", offset: 0, opacity: 1 },
    { id: "pink", color: "#f15bb5", offset: 0.52, opacity: 1 },
    { id: "amber", color: "#fbbf24", offset: 1, opacity: 1 },
  ],
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rgba(hex: string, opacity: number): string {
  const normalized = hex.replace("#", "");
  const source = normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(source, 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${clamp(opacity)})`;
}

export function normalizeGradient(definition: GradientDefinition): GradientDefinition {
  const stops = definition.stops
    .map((stop) => ({ ...stop, offset: clamp(stop.offset), opacity: clamp(stop.opacity) }))
    .sort((first, second) => first.offset - second.offset);
  return {
    ...definition,
    angle: ((definition.angle % 360) + 360) % 360,
    centerX: clamp(definition.centerX),
    centerY: clamp(definition.centerY),
    radius: clamp(definition.radius, 0.05, 1.5),
    stops: stops.length >= 2 ? stops : DEFAULT_GRADIENT.stops.map((stop) => ({ ...stop, id: crypto.randomUUID() })),
  };
}

export function gradientToCss(input: GradientDefinition): string {
  const definition = normalizeGradient(input);
  const stops = definition.stops.map((stop) => `${rgba(stop.color, stop.opacity)} ${Math.round(stop.offset * 100)}%`).join(", ");
  if (definition.kind === "radial") {
    return `radial-gradient(circle at ${Math.round(definition.centerX * 100)}% ${Math.round(definition.centerY * 100)}%, ${stops})`;
  }
  return `linear-gradient(${definition.angle}deg, ${stops})`;
}

export function createFabricGradient(
  input: GradientDefinition,
  width: number,
  height: number,
): fabric.Gradient<"linear", "linear"> | fabric.Gradient<"radial", "radial"> {
  const definition = normalizeGradient(input);
  const colorStops = definition.stops.map((stop) => ({ offset: stop.offset, color: rgba(stop.color, stop.opacity) }));
  if (definition.kind === "radial") {
    const radius = Math.max(1, Math.max(width, height) * definition.radius);
    return new fabric.Gradient<"radial", "radial">({
      type: "radial",
      gradientUnits: "pixels",
      coords: {
        x1: width * definition.centerX,
        y1: height * definition.centerY,
        r1: 0,
        x2: width * definition.centerX,
        y2: height * definition.centerY,
        r2: radius,
      },
      colorStops,
    });
  }
  const radians = (definition.angle - 90) * Math.PI / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const extent = Math.abs(width * dx) + Math.abs(height * dy);
  const centreX = width / 2;
  const centreY = height / 2;
  return new fabric.Gradient<"linear", "linear">({
    type: "linear",
    gradientUnits: "pixels",
    coords: {
      x1: centreX - dx * extent / 2,
      y1: centreY - dy * extent / 2,
      x2: centreX + dx * extent / 2,
      y2: centreY + dy * extent / 2,
    },
    colorStops,
  });
}

function visitPaintable(object: fabric.FabricObject, callback: (target: fabric.FabricObject) => void): void {
  const collection = object as fabric.FabricObject & { getObjects?: () => fabric.FabricObject[] };
  const children = typeof collection.getObjects === "function" ? collection.getObjects() : [];
  if (children.length === 0) callback(object);
  else children.forEach((child) => visitPaintable(child, callback));
}

export function applyGradientToObject(object: fabric.FabricObject, definition: GradientDefinition): number {
  let changed = 0;
  visitPaintable(object, (target) => {
    if (target instanceof fabric.FabricImage) return;
    const width = Math.max(1, target.width || target.getScaledWidth());
    const height = Math.max(1, target.height || target.getScaledHeight());
    target.set("fill", createFabricGradient(definition, width, height));
    target.dirty = true;
    changed += 1;
  });
  if (changed > 0) {
    const metadata = object as DDoneFabricObject & { ddoneGradientConfig?: string };
    metadata.ddoneGradientConfig = JSON.stringify(normalizeGradient(definition));
    object.dirty = true;
  }
  return changed;
}

export function applyGradientBackground(
  canvas: fabric.Canvas,
  canvasWidth: number,
  canvasHeight: number,
  definition: GradientDefinition,
): fabric.Rect {
  const existing = canvas.getObjects().filter((object) => {
    const metadata = object as DDoneFabricObject & { _isBgGradient?: boolean };
    return metadata._isBgImage || metadata._isBgGradient;
  });
  existing.forEach((object) => canvas.remove(object));
  const background = new fabric.Rect({
    left: 0,
    top: 0,
    width: canvasWidth,
    height: canvasHeight,
    fill: createFabricGradient(definition, canvasWidth, canvasHeight),
    selectable: false,
    evented: false,
    hasControls: false,
    hoverCursor: "default",
  });
  const metadata = background as DDoneFabricObject & { _isBgGradient?: boolean; ddoneGradientConfig?: string };
  metadata._isBgGradient = true;
  metadata.templateLocked = true;
  metadata.ddoneMediaKind = "gradient";
  metadata.ddoneGradientConfig = JSON.stringify(normalizeGradient(definition));
  ensureObjectId(background);
  canvas.add(background);
  canvas.sendObjectToBack(background);
  canvas.requestRenderAll();
  canvas.fire("object:modified", { target: background } as never);
  return background;
}
