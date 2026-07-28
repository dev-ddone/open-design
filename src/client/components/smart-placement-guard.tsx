import { useEffect } from "preact/hooks";
import type * as fabric from "fabric";
import { useEditor } from "../context";
import type { DDoneFabricObject } from "../canvas-model";
import { placeObjectWithoutOverlap } from "../canvas/smart-placement";

function overlapRatio(canvas: fabric.Canvas, target: fabric.FabricObject): number {
  const targetRect = target.getBoundingRect();
  const targetArea = Math.max(1, targetRect.width * targetRect.height);
  let overlap = 0;
  for (const object of canvas.getObjects()) {
    if (object === target || object.visible === false) continue;
    const metadata = object as DDoneFabricObject & { _isBgGradient?: boolean };
    if (metadata._isBgImage || metadata._isBgGradient) continue;
    const rect = object.getBoundingRect();
    const width = Math.max(0, Math.min(targetRect.left + targetRect.width, rect.left + rect.width) - Math.max(targetRect.left, rect.left));
    const height = Math.max(0, Math.min(targetRect.top + targetRect.height, rect.top + rect.height) - Math.max(targetRect.top, rect.top));
    overlap += width * height;
  }
  return overlap / targetArea;
}

/**
 * Existing insert actions historically put every object in the exact canvas
 * centre. This guard preserves deliberate positions, but moves a just-created
 * active object when it substantially covers content already on the page.
 */
export function SmartPlacementGuard() {
  const { canvas, canvasWidth, canvasHeight, activePageId } = useEditor();

  useEffect(() => {
    if (!canvas) return;
    const onAdded = (event: { target?: fabric.FabricObject }) => {
      const target = event.target;
      if (!target) return;
      const metadata = target as DDoneFabricObject & { _isBgGradient?: boolean };
      if (metadata._isBgImage || metadata._isBgGradient || target.selectable === false) return;

      window.setTimeout(() => {
        if (canvas.getActiveObject() !== target || !canvas.getObjects().includes(target)) return;
        if (overlapRatio(canvas, target) < 0.18) return;
        placeObjectWithoutOverlap(canvas, target, canvasWidth, canvasHeight, { ignore: [target] });
        canvas.requestRenderAll();
        canvas.fire("object:modified", { target } as never);
      }, 0);
    };
    canvas.on("object:added", onAdded as never);
    return () => canvas.off("object:added", onAdded as never);
  }, [canvas, canvasWidth, canvasHeight, activePageId]);

  return null;
}
