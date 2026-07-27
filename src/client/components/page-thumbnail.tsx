import { useEffect, useRef, useState } from "preact/hooks";
import * as fabric from "fabric";
import type { Page } from "../types";

interface PageThumbnailProps {
  page: Page;
  canvasWidth: number;
  canvasHeight: number;
  className?: string;
  maxPixels?: number;
}

export function PageThumbnail({
  page,
  canvasWidth,
  canvasHeight,
  className = "h-full w-full rounded object-contain",
  maxPixels = 320,
}: PageThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);
  const previousJson = useRef("");

  useEffect(() => {
    if (page.canvas_json === previousJson.current && src) return;
    previousJson.current = page.canvas_json;
    let disposed = false;
    const element = document.createElement("canvas");
    const staticCanvas = new fabric.StaticCanvas(element, { width: canvasWidth, height: canvasHeight });

    try {
      void staticCanvas.loadFromJSON(JSON.parse(page.canvas_json || "{}")).then(() => {
        if (disposed) return;
        staticCanvas.renderAll();
        setSrc(staticCanvas.toDataURL({
          format: "png",
          multiplier: Math.min(maxPixels / Math.max(1, canvasWidth), maxPixels / Math.max(1, canvasHeight), 1),
        }));
        staticCanvas.dispose();
      }).catch(() => staticCanvas.dispose());
    } catch {
      staticCanvas.dispose();
    }

    return () => {
      disposed = true;
      try { staticCanvas.dispose(); } catch { /* already disposed */ }
    };
  }, [page.canvas_json, canvasWidth, canvasHeight, maxPixels]);

  return src
    ? <img src={src} class={className} alt={`Anteprima ${page.title}`} loading="lazy" />
    : <div class={`${className} animate-pulse bg-zinc-100`} aria-label={`Generazione anteprima ${page.title}`} />;
}
