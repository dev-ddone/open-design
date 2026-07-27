import assert from "node:assert/strict";
import test from "node:test";
import type * as fabric from "fabric";
import { placeObjectWithoutOverlap } from "./smart-placement";

function objectStub(left: number, top: number, width: number, height: number): fabric.FabricObject {
  const state = { left, top, width, height };
  return {
    visible: true,
    opacity: 1,
    selectable: true,
    getScaledWidth: () => state.width,
    getScaledHeight: () => state.height,
    getBoundingRect: () => ({ left: state.left, top: state.top, width: state.width, height: state.height }),
    set: (values: { left?: number; top?: number }) => {
      if (typeof values.left === "number") state.left = values.left;
      if (typeof values.top === "number") state.top = values.top;
    },
    setCoords: () => undefined,
  } as unknown as fabric.FabricObject;
}

function intersectionArea(first: fabric.FabricObject, second: fabric.FabricObject): number {
  const a = first.getBoundingRect();
  const b = second.getBoundingRect();
  const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return width * height;
}

test("places a new object away from an existing central object", () => {
  const existing = objectStub(350, 300, 300, 220);
  const incoming = objectStub(350, 300, 300, 220);
  const canvas = { getObjects: () => [existing] } as unknown as fabric.Canvas;
  const result = placeObjectWithoutOverlap(canvas, incoming, 1000, 800);
  assert.equal(result.overlap, 0);
  assert.equal(intersectionArea(existing, incoming), 0);
});

test("uses the centre when the canvas has free space", () => {
  const incoming = objectStub(0, 0, 200, 100);
  const canvas = { getObjects: () => [] } as unknown as fabric.Canvas;
  const result = placeObjectWithoutOverlap(canvas, incoming, 1000, 800);
  assert.equal(result.overlap, 0);
  assert.equal(incoming.getBoundingRect().left, 400);
  assert.equal(incoming.getBoundingRect().top, 350);
});
