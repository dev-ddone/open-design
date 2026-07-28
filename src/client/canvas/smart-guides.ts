import * as fabric from "fabric";

export interface SmartGuideOptions {
  threshold?: number;
  color?: string;
  lineWidth?: number;
}

interface GuideState {
  vertical: number[];
  horizontal: number[];
}

interface ObjectMovingEvent {
  target?: fabric.FabricObject;
}

function unique(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 100) / 100))];
}

function objectAnchors(object: fabric.FabricObject) {
  const rect = object.getBoundingRect();
  return {
    left: rect.left,
    centerX: rect.left + rect.width / 2,
    right: rect.left + rect.width,
    top: rect.top,
    centerY: rect.top + rect.height / 2,
    bottom: rect.top + rect.height,
  };
}

function drawGuide(
  context: CanvasRenderingContext2D,
  canvas: fabric.Canvas,
  axis: "vertical" | "horizontal",
  value: number,
  color: string,
  lineWidth: number,
): void {
  const transform = canvas.viewportTransform ?? fabric.iMatrix;
  const start = axis === "vertical"
    ? fabric.util.transformPoint(new fabric.Point(value, 0), transform)
    : fabric.util.transformPoint(new fabric.Point(0, value), transform);
  const end = axis === "vertical"
    ? fabric.util.transformPoint(new fabric.Point(value, canvas.height ?? 0), transform)
    : fabric.util.transformPoint(new fabric.Point(canvas.width ?? 0, value), transform);

  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.setLineDash([5, 4]);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

/**
 * Installs Canva-like magnetic guides on a Fabric canvas.
 *
 * Moving objects snap to the canvas edges/centre and to the left, centre,
 * right, top, middle and bottom anchors of every other visible object.
 */
export function installSmartGuides(
  canvas: fabric.Canvas,
  options: SmartGuideOptions = {},
): () => void {
  const threshold = options.threshold ?? 7;
  const color = options.color ?? "#d946ef";
  const lineWidth = options.lineWidth ?? 1;
  const guides: GuideState = { vertical: [], horizontal: [] };

  const clear = () => {
    guides.vertical = [];
    guides.horizontal = [];
    canvas.clearContext(canvas.contextTop);
  };

  const moving = (event: ObjectMovingEvent) => {
    const target = event.target;
    if (!target || !target.selectable) return;

    guides.vertical = [];
    guides.horizontal = [];

    const targetAnchors = objectAnchors(target);
    const targetX = [targetAnchors.left, targetAnchors.centerX, targetAnchors.right];
    const targetY = [targetAnchors.top, targetAnchors.centerY, targetAnchors.bottom];
    const xCandidates = [0, (canvas.width ?? 0) / 2, canvas.width ?? 0];
    const yCandidates = [0, (canvas.height ?? 0) / 2, canvas.height ?? 0];

    for (const object of canvas.getObjects()) {
      if (object === target || !object.visible || (object as any)._isBgImage) continue;
      const anchors = objectAnchors(object);
      xCandidates.push(anchors.left, anchors.centerX, anchors.right);
      yCandidates.push(anchors.top, anchors.centerY, anchors.bottom);
    }

    let bestX: { delta: number; guide: number } | null = null;
    for (const source of targetX) {
      for (const candidate of xCandidates) {
        const delta = candidate - source;
        if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, guide: candidate };
        }
      }
    }

    let bestY: { delta: number; guide: number } | null = null;
    for (const source of targetY) {
      for (const candidate of yCandidates) {
        const delta = candidate - source;
        if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = { delta, guide: candidate };
        }
      }
    }

    if (bestX) {
      target.set("left", (target.left ?? 0) + bestX.delta);
      guides.vertical = [bestX.guide];
    }
    if (bestY) {
      target.set("top", (target.top ?? 0) + bestY.delta);
      guides.horizontal = [bestY.guide];
    }
    target.setCoords();
  };

  const afterRender = () => {
    const context = canvas.contextTop;
    if (!context) return;
    for (const value of unique(guides.vertical)) drawGuide(context, canvas, "vertical", value, color, lineWidth);
    for (const value of unique(guides.horizontal)) drawGuide(context, canvas, "horizontal", value, color, lineWidth);
  };

  canvas.on("object:moving", moving as any);
  canvas.on("after:render", afterRender);
  canvas.on("mouse:up", clear);
  canvas.on("selection:cleared", clear);

  return () => {
    canvas.off("object:moving", moving as any);
    canvas.off("after:render", afterRender);
    canvas.off("mouse:up", clear);
    canvas.off("selection:cleared", clear);
    clear();
  };
}
