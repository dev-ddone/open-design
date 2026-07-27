import * as fabric from "fabric";
import type { DDoneFabricObject } from "../canvas-model";

export interface SmartPlacementOptions {
  margin?: number;
  padding?: number;
  ignore?: fabric.FabricObject[];
  preferTopLeft?: boolean;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function overlapArea(first: Box, second: Box, padding: number): number {
  const left = Math.max(first.left - padding, second.left - padding);
  const top = Math.max(first.top - padding, second.top - padding);
  const right = Math.min(first.left + first.width + padding, second.left + second.width + padding);
  const bottom = Math.min(first.top + first.height + padding, second.top + second.height + padding);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function objectBox(object: fabric.FabricObject): Box {
  const rect = object.getBoundingRect();
  return {
    left: rect.left,
    top: rect.top,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
  };
}

function candidateOffsets(stepX: number, stepY: number, preferTopLeft: boolean): Array<[number, number]> {
  const values: Array<[number, number]> = [[0, 0]];
  const directions = preferTopLeft
    ? [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [-1, 0], [1, 0], [0, 1]]
    : [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1], [-1, 0], [0, -1]];
  for (let ring = 1; ring <= 7; ring += 1) {
    for (const [x, y] of directions) values.push([x * stepX * ring, y * stepY * ring]);
    for (let index = 1; index < ring; index += 1) {
      values.push([stepX * ring, stepY * index]);
      values.push([-stepX * ring, stepY * index]);
      values.push([stepX * index, stepY * ring]);
      values.push([stepX * index, -stepY * ring]);
    }
  }
  return values;
}

/**
 * Places a new Fabric object near the canvas centre while minimising overlap
 * with existing visible design objects. Backgrounds and explicitly ignored
 * objects do not participate in collision scoring.
 */
export function placeObjectWithoutOverlap(
  canvas: fabric.Canvas,
  object: fabric.FabricObject,
  canvasWidth: number,
  canvasHeight: number,
  options: SmartPlacementOptions = {},
): { left: number; top: number; overlap: number } {
  const margin = options.margin ?? Math.max(18, Math.min(canvasWidth, canvasHeight) * 0.025);
  const padding = options.padding ?? Math.max(8, margin * 0.45);
  const ignored = new Set([object, ...(options.ignore ?? [])]);
  const width = Math.min(Math.max(1, object.getScaledWidth()), Math.max(1, canvasWidth - margin * 2));
  const height = Math.min(Math.max(1, object.getScaledHeight()), Math.max(1, canvasHeight - margin * 2));
  const maximumLeft = Math.max(margin, canvasWidth - width - margin);
  const maximumTop = Math.max(margin, canvasHeight - height - margin);
  const centreLeft = clamp((canvasWidth - width) / 2, margin, maximumLeft);
  const centreTop = clamp((canvasHeight - height) / 2, margin, maximumTop);
  const stepX = Math.max(44, Math.min(width * 0.42, canvasWidth * 0.18));
  const stepY = Math.max(38, Math.min(height * 0.42, canvasHeight * 0.18));

  const occupied = canvas.getObjects().filter((candidate) => {
    if (ignored.has(candidate) || candidate.visible === false || (candidate.opacity ?? 1) <= 0.01) return false;
    const metadata = candidate as DDoneFabricObject;
    return !metadata._isBgImage && !(metadata as DDoneFabricObject & { _isBgGradient?: boolean })._isBgGradient;
  }).map(objectBox);

  let best = { left: centreLeft, top: centreTop, overlap: Number.POSITIVE_INFINITY, distance: Number.POSITIVE_INFINITY };
  for (const [offsetX, offsetY] of candidateOffsets(stepX, stepY, Boolean(options.preferTopLeft))) {
    const left = clamp(centreLeft + offsetX, margin, maximumLeft);
    const top = clamp(centreTop + offsetY, margin, maximumTop);
    const box = { left, top, width, height };
    const overlap = occupied.reduce((total, occupiedBox) => total + overlapArea(box, occupiedBox, padding), 0);
    const distance = Math.hypot(left - centreLeft, top - centreTop);
    if (overlap < best.overlap || (overlap === best.overlap && distance < best.distance)) {
      best = { left, top, overlap, distance };
      if (overlap === 0 && distance <= Math.max(stepX, stepY)) break;
    }
  }

  object.set({ left: best.left, top: best.top });
  object.setCoords();
  return { left: best.left, top: best.top, overlap: best.overlap };
}
