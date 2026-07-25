import * as fabric from "fabric";
import { ensureObjectId, type DDoneFabricObject } from "../canvas-model";

export type BlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "lighten"
  | "darken"
  | "difference";

export type DissolveMode = "linear" | "radial" | "panel";
export type DissolveDirection = "left" | "right" | "top" | "bottom";

function naturalSize(image: fabric.FabricImage): { width: number; height: number } {
  const element = image.getElement() as HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
  const width = "naturalWidth" in element && element.naturalWidth ? element.naturalWidth : element.width;
  const height = "naturalHeight" in element && element.naturalHeight ? element.naturalHeight : element.height;
  return { width: width || image.width || 1, height: height || image.height || 1 };
}

function objectToCanvas(image: fabric.FabricImage, width: number, height: number): HTMLCanvasElement {
  const multiplier = Math.min(2, Math.max(1, 1600 / Math.max(width, height)));
  const rendered = image.toCanvasElement({ multiplier, withoutTransform: true });
  return rendered;
}

function canvasDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png", 1);
}

function copyPlacement(source: fabric.FabricObject, target: fabric.FabricObject): void {
  target.set({
    left: source.left,
    top: source.top,
    originX: source.originX,
    originY: source.originY,
    angle: source.angle,
    flipX: source.flipX,
    flipY: source.flipY,
    opacity: source.opacity,
    shadow: source.shadow,
  });
}

async function imageFromCanvas(canvas: HTMLCanvasElement): Promise<fabric.FabricImage> {
  return fabric.FabricImage.fromURL(canvasDataUrl(canvas), { crossOrigin: "anonymous" });
}

export async function blendImages(
  first: fabric.FabricImage,
  second: fabric.FabricImage,
  mode: BlendMode,
  secondOpacity: number,
): Promise<fabric.FabricImage> {
  const firstSize = naturalSize(first);
  const secondSize = naturalSize(second);
  const width = Math.max(firstSize.width, secondSize.width);
  const height = Math.max(firstSize.height, secondSize.height);
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(width));
  output.height = Math.max(1, Math.round(height));
  const context = output.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas 2D is not available");

  const firstCanvas = objectToCanvas(first, width, height);
  const secondCanvas = objectToCanvas(second, width, height);
  context.drawImage(firstCanvas, 0, 0, output.width, output.height);
  context.save();
  context.globalCompositeOperation = mode;
  context.globalAlpha = Math.min(1, Math.max(0, secondOpacity));
  context.drawImage(secondCanvas, 0, 0, output.width, output.height);
  context.restore();

  const result = await imageFromCanvas(output);
  const reference = first.getScaledWidth() * first.getScaledHeight() >= second.getScaledWidth() * second.getScaledHeight()
    ? first
    : second;
  const displayWidth = Math.max(first.getScaledWidth(), second.getScaledWidth());
  const displayHeight = Math.max(first.getScaledHeight(), second.getScaledHeight());
  copyPlacement(reference, result);
  result.set({
    scaleX: displayWidth / (result.width || 1),
    scaleY: displayHeight / (result.height || 1),
  });
  const metadata = result as DDoneFabricObject;
  metadata.ddoneMediaKind = "blend";
  metadata.ddoneEffect = `blend:${mode}`;
  ensureObjectId(result);
  return result;
}

function linearGradient(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  direction: DissolveDirection,
  softness: number,
): CanvasGradient {
  const gradient = direction === "left" || direction === "right"
    ? context.createLinearGradient(0, 0, width, 0)
    : context.createLinearGradient(0, 0, 0, height);
  const edge = Math.min(0.49, Math.max(0.02, softness));
  const reversed = direction === "left" || direction === "top";
  if (reversed) {
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(edge, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,1)");
  } else {
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1 - edge, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
  }
  return gradient;
}

function radialGradient(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  softness: number,
): CanvasGradient {
  const radius = Math.hypot(width, height) / 2;
  const inner = radius * Math.min(0.9, Math.max(0.05, 1 - softness));
  const gradient = context.createRadialGradient(width / 2, height / 2, inner, width / 2, height / 2, radius);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  return gradient;
}

function panelMask(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  softness: number,
): void {
  context.fillStyle = "rgba(0,0,0,1)";
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "destination-out";
  const radius = Math.max(18, Math.min(width, height) * (0.14 + softness * 0.18));
  const gradient = context.createRadialGradient(width * 0.72, height * 0.34, radius * 0.15, width * 0.72, height * 0.34, radius);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(width * 0.72, height * 0.34, radius, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "source-over";
}

export async function dissolveImage(
  source: fabric.FabricImage,
  mode: DissolveMode,
  direction: DissolveDirection,
  softness: number,
): Promise<fabric.FabricImage> {
  const width = Math.max(1, Math.round(source.width || 1));
  const height = Math.max(1, Math.round(source.height || 1));
  const sourceCanvas = objectToCanvas(source, width, height);
  const output = document.createElement("canvas");
  output.width = sourceCanvas.width;
  output.height = sourceCanvas.height;
  const context = output.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas 2D is not available");
  context.drawImage(sourceCanvas, 0, 0);
  context.globalCompositeOperation = "destination-in";

  if (mode === "panel") {
    const mask = document.createElement("canvas");
    mask.width = output.width;
    mask.height = output.height;
    const maskContext = mask.getContext("2d", { alpha: true });
    if (!maskContext) throw new Error("Canvas 2D is not available");
    panelMask(maskContext, mask.width, mask.height, softness);
    context.drawImage(mask, 0, 0);
  } else {
    context.fillStyle = mode === "linear"
      ? linearGradient(context, output.width, output.height, direction, softness)
      : radialGradient(context, output.width, output.height, softness);
    context.fillRect(0, 0, output.width, output.height);
  }
  context.globalCompositeOperation = "source-over";

  const result = await imageFromCanvas(output);
  copyPlacement(source, result);
  result.set({ scaleX: source.scaleX, scaleY: source.scaleY });
  const metadata = result as DDoneFabricObject;
  metadata.ddoneMediaKind = "image";
  metadata.ddoneEffect = `dissolve:${mode}`;
  ensureObjectId(result);
  return result;
}

function canPaint(value: unknown): value is string {
  return typeof value === "string"
    && value !== ""
    && value !== "none"
    && value !== "transparent"
    && !value.startsWith("url(");
}

export function recolorVectorObject(object: fabric.FabricObject, color: string): number {
  let changed = 0;
  const visit = (target: fabric.FabricObject) => {
    const anyTarget = target as any;
    if (canPaint(anyTarget.fill)) {
      anyTarget.set("fill", color);
      changed += 1;
    }
    if (canPaint(anyTarget.stroke)) {
      anyTarget.set("stroke", color);
      changed += 1;
    }
    if (typeof anyTarget.getObjects === "function") {
      for (const child of anyTarget.getObjects() as fabric.FabricObject[]) visit(child);
    }
  };
  visit(object);
  object.dirty = true;
  return changed;
}

export function activeImages(canvas: fabric.Canvas | null): fabric.FabricImage[] {
  if (!canvas) return [];
  const active = canvas.getActiveObjects();
  return active.filter((object): object is fabric.FabricImage => object instanceof fabric.FabricImage);
}
