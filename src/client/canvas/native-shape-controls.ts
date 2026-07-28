import * as fabric from "fabric";
import { isNativeShape, readNativeShapeData, rebuildNativeShape, type NativeShapeData, type NativeShapeObject } from "./native-shapes";

type ControlTransform = { target: fabric.FabricObject };
type PendingShape = NativeShapeObject & { __ddonePendingNativeShapeData?: NativeShapeData };
type LocalPointResolver = (data: NativeShapeData, object: fabric.FabricObject) => fabric.Point;
type DataUpdater = (data: NativeShapeData, point: fabric.Point, object: fabric.FabricObject) => NativeShapeData;

const CONTROL_KEYS = ["ddoneRadius", "ddoneArcStart", "ddoneArcEnd", "ddoneProgress", "ddoneInner", "ddoneGradientStart", "ddoneGradientEnd", "ddoneGradientCenter", "ddoneGradientRadius"] as const;

function renderHandle(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  object: fabric.FabricObject,
): void {
  const zoom = object.canvas?.getZoom() ?? 1;
  context.save();
  context.translate(left, top);
  context.scale(1 / Math.max(.25, zoom), 1 / Math.max(.25, zoom));
  context.beginPath();
  context.arc(0, 0, 7, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "#7c3aed";
  context.stroke();
  context.restore();
}

function localPointFromPointer(object: fabric.FabricObject, x: number, y: number): fabric.Point {
  const inverted = fabric.util.invertTransform(object.calcTransformMatrix());
  return fabric.util.transformPoint(new fabric.Point(x, y), inverted);
}

function localToCanvas(point: fabric.Point, finalMatrix: number[]): fabric.Point {
  return fabric.util.transformPoint(point, finalMatrix);
}

function centerFor(object: fabric.FabricObject): fabric.Point {
  return new fabric.Point((object.width ?? 1) / 2, (object.height ?? 1) / 2);
}

function angleFromPoint(point: fabric.Point, object: fabric.FabricObject): number {
  const center = centerFor(object);
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

function polarPoint(object: fabric.FabricObject, angle: number, radiusScale = .45): fabric.Point {
  const center = centerFor(object);
  const radius = Math.min(object.width ?? 1, object.height ?? 1) * radiusScale;
  const radians = (angle * Math.PI) / 180;
  return new fabric.Point(center.x + Math.cos(radians) * radius, center.y + Math.sin(radians) * radius);
}

function flushPending(object: fabric.FabricObject): boolean {
  const target = object as PendingShape;
  const data = target.__ddonePendingNativeShapeData;
  const canvas = object.canvas;
  if (!data || !canvas || !isNativeShape(object)) return false;
  delete target.__ddonePendingNativeShapeData;
  queueMicrotask(() => {
    if (canvas.getObjects().includes(object)) rebuildNativeShape(canvas, object, data);
  });
  return true;
}

function dataControl(
  pointResolver: LocalPointResolver,
  updater: DataUpdater,
  cursorStyle: string,
): fabric.Control {
  return new fabric.Control({
    cursorStyle,
    sizeX: 18,
    sizeY: 18,
    touchSizeX: 30,
    touchSizeY: 30,
    render: renderHandle as never,
    positionHandler: ((_dimensions: unknown, finalMatrix: number[], object: fabric.FabricObject) => {
      const data = readNativeShapeData(object);
      if (!data) return localToCanvas(centerFor(object), finalMatrix);
      return localToCanvas(pointResolver(data, object), finalMatrix);
    }) as never,
    actionHandler: ((_eventData: Event, transform: ControlTransform, x: number, y: number) => {
      const object = transform.target;
      const current = readNativeShapeData(object);
      if (!current) return false;
      const local = localPointFromPointer(object, x, y);
      (object as PendingShape).__ddonePendingNativeShapeData = updater(current, local, object);
      object.dirty = true;
      object.canvas?.requestRenderAll();
      return true;
    }) as never,
    mouseUpHandler: ((_eventData: Event, transform: ControlTransform) => flushPending(transform.target)) as never,
  });
}

function clamped(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function endpointFor(data: NativeShapeData, start: boolean): number {
  if (start) return data.startAngle;
  return data.kind === "progress-ring" ? data.startAngle + clamped(data.progress, 0, 100) * 3.6 : data.endAngle;
}

function baseControls(object: fabric.FabricObject): Record<string, fabric.Control> {
  const controls = { ...object.controls } as Record<string, fabric.Control>;
  for (const key of CONTROL_KEYS) delete controls[key];
  return controls;
}

export function configureNativeShapeControls(object: fabric.FabricObject | null | undefined): void {
  if (!object || !isNativeShape(object)) return;
  const data = readNativeShapeData(object);
  if (!data) return;
  const controls = baseControls(object);

  if (data.kind === "rounded-rect" || data.kind === "callout") {
    controls.ddoneRadius = dataControl(
      (current) => new fabric.Point(clamped(current.cornerRadius, 0, current.width / 2), 0),
      (current, point) => ({ ...current, cornerRadius: clamped(point.x, 0, Math.min(current.width, current.height) / 2) }),
      "ew-resize",
    );
  }

  if (data.kind === "arc" || data.kind === "progress-ring") {
    controls.ddoneArcStart = dataControl(
      (current, target) => polarPoint(target, current.startAngle),
      (current, point, target) => ({ ...current, startAngle: angleFromPoint(point, target) }),
      "crosshair",
    );
    const endKey = data.kind === "progress-ring" ? "ddoneProgress" : "ddoneArcEnd";
    controls[endKey] = dataControl(
      (current, target) => polarPoint(target, endpointFor(current, false)),
      (current, point, target) => {
        let sweep = angleFromPoint(point, target) - current.startAngle;
        while (sweep < 0) sweep += 360;
        if (current.kind === "progress-ring") return { ...current, progress: clamped(sweep / 3.6, 0, 100) };
        return { ...current, endAngle: current.startAngle + clamped(sweep, .1, 359.9) };
      },
      "crosshair",
    );
  }

  if (data.kind === "star") {
    controls.ddoneInner = dataControl(
      (current, target) => polarPoint(target, -90, clamped(current.innerRadius, .08, .92) * .45),
      (current, point, target) => {
        const center = centerFor(target);
        const distance = Math.hypot(point.x - center.x, point.y - center.y);
        const outer = Math.max(1, Math.min(target.width ?? 1, target.height ?? 1) * .45);
        return { ...current, innerRadius: clamped(distance / outer, .08, .92) };
      },
      "ns-resize",
    );
  }

  if (data.fillMode === "linear") {
    const gradientPoint = (current: NativeShapeData, target: fabric.FabricObject, direction: -1 | 1) => {
      const center = centerFor(target);
      const angle = (current.gradientAngle * Math.PI) / 180;
      const radius = Math.min(target.width ?? 1, target.height ?? 1) * .35;
      return new fabric.Point(center.x + Math.cos(angle) * radius * direction, center.y + Math.sin(angle) * radius * direction);
    };
    const updateAngle = (current: NativeShapeData, point: fabric.Point, target: fabric.FabricObject) => ({ ...current, gradientAngle: angleFromPoint(point, target) });
    controls.ddoneGradientStart = dataControl((current, target) => gradientPoint(current, target, -1), (current, point, target) => ({ ...updateAngle(current, point, target), gradientAngle: angleFromPoint(point, target) + 180 }), "crosshair");
    controls.ddoneGradientEnd = dataControl((current, target) => gradientPoint(current, target, 1), updateAngle, "crosshair");
  }

  if (data.fillMode === "radial") {
    controls.ddoneGradientCenter = dataControl(
      (current, target) => new fabric.Point((target.width ?? 1) * current.gradientCenterX, (target.height ?? 1) * current.gradientCenterY),
      (current, point, target) => ({ ...current, gradientCenterX: clamped(point.x / Math.max(1, target.width ?? 1), 0, 1), gradientCenterY: clamped(point.y / Math.max(1, target.height ?? 1), 0, 1) }),
      "move",
    );
    controls.ddoneGradientRadius = dataControl(
      (current, target) => new fabric.Point((target.width ?? 1) * current.gradientCenterX + Math.max(target.width ?? 1, target.height ?? 1) * current.gradientRadius, (target.height ?? 1) * current.gradientCenterY),
      (current, point, target) => {
        const centerX = (target.width ?? 1) * current.gradientCenterX;
        const centerY = (target.height ?? 1) * current.gradientCenterY;
        return { ...current, gradientRadius: clamped(Math.hypot(point.x - centerX, point.y - centerY) / Math.max(target.width ?? 1, target.height ?? 1), .05, 2) };
      },
      "ew-resize",
    );
  }

  object.controls = controls;
  object.setCoords();
}
