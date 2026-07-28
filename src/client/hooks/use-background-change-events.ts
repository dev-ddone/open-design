import { useEffect } from "preact/hooks";
import type * as fabric from "fabric";

/**
 * Fabric does not emit a dedicated event when backgroundColor is assigned.
 * This small observer converts background changes into a canvas event consumed
 * by the Yjs collaboration hook, keeping colors and gradients in sync.
 */
export function useBackgroundChangeEvents(
  canvasMap: { current: Map<string, fabric.Canvas> },
): void {
  useEffect(() => {
    const previous = new WeakMap<fabric.Canvas, string>();
    const timer = window.setInterval(() => {
      for (const canvas of canvasMap.current.values()) {
        const value = typeof canvas.backgroundColor === "string"
          ? canvas.backgroundColor
          : "";
        if (!previous.has(canvas)) {
          previous.set(canvas, value);
          continue;
        }
        if (previous.get(canvas) !== value) {
          previous.set(canvas, value);
          (canvas as any).fire("ddone:background:changed");
        }
      }
    }, 180);
    return () => window.clearInterval(timer);
  }, [canvasMap]);
}
