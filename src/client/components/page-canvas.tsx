import { useRef, useEffect } from "preact/hooks";
import * as fabric from "fabric";
import { useEditor } from "../context";
import type { Page } from "../types";
import { applyEditRules, serializeCanvas } from "../canvas-model";
import { installSmartGuides } from "../canvas/smart-guides";

interface PageCanvasProps {
  page: Page;
  isActive: boolean;
  width: number;
  height: number;
  onActivate: () => void;
}

export function PageCanvas({ page, isActive, width, height, onActivate }: PageCanvasProps) {
  const { registerCanvas, unregisterCanvas, templateEditRules, readOnly, beginCrop } = useEditor();
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const onActivateRef = useRef(onActivate);
  const beginCropRef = useRef(beginCrop);
  const loadedJsonRef = useRef<string>("{}");
  onActivateRef.current = onActivate;
  beginCropRef.current = beginCrop;

  useEffect(() => {
    if (!canvasElRef.current || fabricRef.current) return;
    const canvas = new fabric.Canvas(canvasElRef.current, {
      width,
      height,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selection: true,
      controlsAboveOverlay: true,
    });
    const dpr = window.devicePixelRatio || 1;
    canvas.setDimensions({ width: width * dpr, height: height * dpr }, { cssOnly: false });
    canvas.setDimensions({ width, height }, { cssOnly: true });
    canvas.setViewportTransform([dpr, 0, 0, dpr, 0, 0]);

    const controlStyle = {
      transparentCorners: false,
      borderColor: "#7c3aed",
      borderScaleFactor: 1.5,
      padding: 6,
      cornerSize: 14,
      cornerColor: "#ffffff",
      cornerStrokeColor: "#7c3aed",
      cornerStyle: "circle" as const,
    };
    const renderCircle = (context: CanvasRenderingContext2D, left: number, top: number) => {
      context.save();
      context.translate(left, top);
      context.beginPath();
      context.arc(0, 0, 7, 0, Math.PI * 2);
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#7c3aed";
      context.lineWidth = 2;
      context.fill();
      context.stroke();
      context.restore();
    };
    const renderPill = (horizontal: boolean) => (
      context: CanvasRenderingContext2D,
      left: number,
      top: number,
    ) => {
      const pillWidth = horizontal ? 28 : 8;
      const pillHeight = horizontal ? 8 : 28;
      context.save();
      context.translate(left, top);
      context.beginPath();
      context.roundRect(-pillWidth / 2, -pillHeight / 2, pillWidth, pillHeight, 4);
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#7c3aed";
      context.lineWidth = 2;
      context.fill();
      context.stroke();
      context.restore();
    };
    const applyControls = (object: fabric.FabricObject) => {
      object.set(controlStyle);
      for (const key of ["tl", "tr", "bl", "br"]) {
        if (object.controls?.[key]) object.controls[key].render = renderCircle as any;
      }
      for (const key of ["mt", "mb"]) {
        if (object.controls?.[key]) object.controls[key].render = renderPill(true) as any;
      }
      for (const key of ["ml", "mr"]) {
        if (object.controls?.[key]) object.controls[key].render = renderPill(false) as any;
      }
    };
    canvas.on("object:added", (event) => event.target && applyControls(event.target));
    canvas.on("mouse:down", () => onActivateRef.current());
    canvas.on("mouse:dblclick", (event) => {
      const target = event.target;
      if (!readOnly && target instanceof fabric.FabricImage && target.selectable) {
        canvas.setActiveObject(target);
        beginCropRef.current(target);
      }
    });
    const uninstallGuides = installSmartGuides(canvas, {
      threshold: 7,
      color: "#d946ef",
      lineWidth: 1,
    });

    const initial = page.canvas_json && page.canvas_json !== "{}" ? page.canvas_json : "{}";
    loadedJsonRef.current = initial;
    if (initial !== "{}") {
      void canvas.loadFromJSON(JSON.parse(initial)).then(() => {
        canvas.getObjects().forEach(applyControls);
        applyEditRules(canvas, templateEditRules, readOnly);
      });
    }

    fabricRef.current = canvas;
    registerCanvas(page.id, canvas);
    return () => {
      uninstallGuides();
      unregisterCanvas(page.id);
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !page.canvas_json || page.canvas_json === "{}") return;
    if (loadedJsonRef.current === page.canvas_json || serializeCanvas(canvas) === page.canvas_json) {
      loadedJsonRef.current = page.canvas_json;
      return;
    }
    loadedJsonRef.current = page.canvas_json;
    void canvas.loadFromJSON(JSON.parse(page.canvas_json)).then(() => {
      applyEditRules(canvas, templateEditRules, readOnly);
      canvas.requestRenderAll();
    });
  }, [page.canvas_json]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (canvas) applyEditRules(canvas, templateEditRules, readOnly);
  }, [readOnly, JSON.stringify(templateEditRules)]);

  return (
    <div
      class={`relative shadow-lg rounded-lg overflow-visible ${isActive ? "ring-2 ring-[#7c3aed]" : ""}`}
      style={{ width, height }}
    >
      <canvas ref={canvasElRef} />
    </div>
  );
}
