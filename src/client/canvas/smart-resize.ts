import * as fabric from "fabric";
import type { DDoneFabricObject } from "../canvas-model";

export type SmartResizeMode = "balanced" | "position-only" | "stretch";

export interface StaticFormatPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  group: string;
}

export const STATIC_FORMAT_PRESETS: StaticFormatPreset[] = [
  { id: "instagram-post", label: "Instagram post", width: 1080, height: 1080, group: "Social" },
  { id: "instagram-portrait", label: "Instagram verticale", width: 1080, height: 1350, group: "Social" },
  { id: "instagram-story", label: "Story", width: 1080, height: 1920, group: "Social" },
  { id: "facebook-cover", label: "Facebook cover", width: 1640, height: 924, group: "Social" },
  { id: "linkedin-post", label: "LinkedIn post", width: 1200, height: 627, group: "Social" },
  { id: "a4-portrait", label: "A4 verticale", width: 794, height: 1123, group: "Stampa" },
  { id: "a4-landscape", label: "A4 orizzontale", width: 1123, height: 794, group: "Stampa" },
  { id: "presentation", label: "Presentazione 16:9", width: 1920, height: 1080, group: "Presentazioni" },
];

export interface SmartResizeResult {
  width: number;
  height: number;
  movedObjects: number;
  scaledObjects: number;
}

export function smartResizeCanvas(
  canvas: fabric.Canvas,
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
  mode: SmartResizeMode,
): SmartResizeResult {
  const safeFromWidth = Math.max(1, fromWidth);
  const safeFromHeight = Math.max(1, fromHeight);
  const width = Math.max(64, Math.round(toWidth));
  const height = Math.max(64, Math.round(toHeight));
  const ratioX = width / safeFromWidth;
  const ratioY = height / safeFromHeight;
  const uniformScale = Math.min(ratioX, ratioY);
  let movedObjects = 0;
  let scaledObjects = 0;

  for (const object of canvas.getObjects()) {
    const metadata = object as DDoneFabricObject;
    if (metadata._isBgImage) {
      const intrinsicWidth = Math.max(1, object.width || safeFromWidth);
      const intrinsicHeight = Math.max(1, object.height || safeFromHeight);
      const cover = Math.max(width / intrinsicWidth, height / intrinsicHeight);
      object.set({
        left: width / 2,
        top: height / 2,
        originX: "center",
        originY: "center",
        scaleX: cover,
        scaleY: cover,
      });
      object.setCoords();
      continue;
    }

    const center = object.getCenterPoint();
    const nextCenter = new fabric.Point(center.x * ratioX, center.y * ratioY);
    if (mode === "stretch") {
      object.set({
        scaleX: (object.scaleX ?? 1) * ratioX,
        scaleY: (object.scaleY ?? 1) * ratioY,
      });
      scaledObjects += 1;
    } else if (mode === "balanced") {
      object.set({
        scaleX: (object.scaleX ?? 1) * uniformScale,
        scaleY: (object.scaleY ?? 1) * uniformScale,
      });
      scaledObjects += 1;
    }
    object.setPositionByOrigin(nextCenter, "center", "center");
    object.setCoords();
    movedObjects += 1;
  }

  canvas.setDimensions({ width, height });
  canvas.requestRenderAll();
  for (const object of canvas.getObjects()) {
    canvas.fire("object:modified", { target: object } as any);
  }
  return { width, height, movedObjects, scaledObjects };
}
