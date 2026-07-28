import * as fabric from "fabric";
import { ensureObjectId, type DDoneFabricObject } from "../canvas-model";

export type DissolveKind = "linear" | "radial";

export interface DissolveDefinition {
  kind: DissolveKind;
  angle: number;
  start: number;
  end: number;
  centerX: number;
  centerY: number;
  radius: number;
  invert: boolean;
}

export const DEFAULT_DISSOLVE: DissolveDefinition = {
  kind: "linear",
  angle: 90,
  start: 0.55,
  end: 1,
  centerX: 0.5,
  centerY: 0.5,
  radius: 0.72,
  invert: false,
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeDissolve(input: DissolveDefinition): DissolveDefinition {
  const start = clamp(Math.min(input.start, input.end - 0.01));
  const end = clamp(Math.max(input.end, start + 0.01));
  return {
    ...input,
    angle: ((input.angle % 360) + 360) % 360,
    start,
    end,
    centerX: clamp(input.centerX),
    centerY: clamp(input.centerY),
    radius: clamp(input.radius, 0.1, 1.5),
  };
}

export function dissolveToCss(input: DissolveDefinition): string {
  const definition = normalizeDissolve(input);
  const solid = definition.invert ? "transparent" : "black";
  const empty = definition.invert ? "black" : "transparent";
  const stops = `${solid} ${Math.round(definition.start * 100)}%, ${empty} ${Math.round(definition.end * 100)}%`;
  if (definition.kind === "radial") {
    return `radial-gradient(circle at ${Math.round(definition.centerX * 100)}% ${Math.round(definition.centerY * 100)}%, ${stops})`;
  }
  return `linear-gradient(${definition.angle}deg, ${stops})`;
}

function sourceCanvas(image: fabric.FabricImage): HTMLCanvasElement {
  const width = Math.max(1, image.width || 1);
  const height = Math.max(1, image.height || 1);
  const multiplier = Math.min(2, Math.max(1, 1600 / Math.max(width, height)));
  return image.toCanvasElement({ multiplier, withoutTransform: true });
}

function addMaskStops(gradient: CanvasGradient, definition: DissolveDefinition): void {
  const visible = definition.invert ? "rgba(0,0,0,0)" : "rgba(0,0,0,1)";
  const transparent = definition.invert ? "rgba(0,0,0,1)" : "rgba(0,0,0,0)";
  gradient.addColorStop(0, visible);
  gradient.addColorStop(definition.start, visible);
  gradient.addColorStop(definition.end, transparent);
  gradient.addColorStop(1, transparent);
}

function createLinearMask(context: CanvasRenderingContext2D, width: number, height: number, definition: DissolveDefinition): CanvasGradient {
  const radians = (definition.angle - 90) * Math.PI / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const extent = Math.abs(width * dx) + Math.abs(height * dy);
  const centreX = width / 2;
  const centreY = height / 2;
  const gradient = context.createLinearGradient(
    centreX - dx * extent / 2,
    centreY - dy * extent / 2,
    centreX + dx * extent / 2,
    centreY + dy * extent / 2,
  );
  addMaskStops(gradient, definition);
  return gradient;
}

function createRadialMask(context: CanvasRenderingContext2D, width: number, height: number, definition: DissolveDefinition): CanvasGradient {
  const centreX = width * definition.centerX;
  const centreY = height * definition.centerY;
  const radius = Math.max(width, height) * definition.radius;
  const gradient = context.createRadialGradient(centreX, centreY, 0, centreX, centreY, radius);
  addMaskStops(gradient, definition);
  return gradient;
}

export async function applyAdvancedDissolve(
  source: fabric.FabricImage,
  input: DissolveDefinition,
): Promise<fabric.FabricImage> {
  const definition = normalizeDissolve(input);
  const original = sourceCanvas(source);
  const output = document.createElement("canvas");
  output.width = original.width;
  output.height = original.height;
  const context = output.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas 2D non disponibile");
  context.drawImage(original, 0, 0);
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = definition.kind === "linear"
    ? createLinearMask(context, output.width, output.height, definition)
    : createRadialMask(context, output.width, output.height, definition);
  context.fillRect(0, 0, output.width, output.height);
  context.globalCompositeOperation = "source-over";

  const result = await fabric.FabricImage.fromURL(output.toDataURL("image/png", 1), { crossOrigin: "anonymous" });
  result.set({
    left: source.left,
    top: source.top,
    originX: source.originX,
    originY: source.originY,
    angle: source.angle,
    flipX: source.flipX,
    flipY: source.flipY,
    opacity: source.opacity,
    shadow: source.shadow,
    scaleX: source.getScaledWidth() / (result.width || 1),
    scaleY: source.getScaledHeight() / (result.height || 1),
  });
  const sourceMetadata = source as DDoneFabricObject;
  const metadata = result as DDoneFabricObject & { ddoneDissolveConfig?: string };
  Object.assign(metadata, {
    ddoneMediaKind: "image",
    ddoneFormat: "png",
    ddoneTransparent: true,
    ddoneEffect: `dissolve:${definition.kind}`,
    ddoneEffectConfig: JSON.stringify(definition),
    ddoneDissolveConfig: JSON.stringify(definition),
    ddoneProvider: sourceMetadata.ddoneProvider,
    ddoneSourceId: sourceMetadata.ddoneSourceId,
    ddoneSourceUrl: sourceMetadata.ddoneSourceUrl,
    ddoneLicense: sourceMetadata.ddoneLicense,
    ddoneLicenseUrl: sourceMetadata.ddoneLicenseUrl,
    ddoneAuthor: sourceMetadata.ddoneAuthor,
    ddoneAttribution: sourceMetadata.ddoneAttribution,
    ddoneAttributionRequired: sourceMetadata.ddoneAttributionRequired,
    ddoneMediaUrl: sourceMetadata.ddoneMediaUrl,
  });
  ensureObjectId(result);
  return result;
}
