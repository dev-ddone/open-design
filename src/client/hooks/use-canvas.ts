import { useState, useCallback, useRef, useEffect } from "preact/hooks";
import * as fabric from "fabric";
import { jsPDF } from "jspdf";
import type { Template, TemplateEditRules } from "../types";
import {
  applyEditRules,
  ensureObjectId,
  normalizeEditRules,
  rulesFromCanvas,
  serializeCanvas,
  setObjectTemplateLock,
  type DDoneFabricObject,
} from "../canvas-model";

const MAX_HISTORY = 50;

const TEXT_PRESETS = {
  heading: { text: "Add a heading", fontSize: 48, fontWeight: "700", fontFamily: "Montserrat" },
  subheading: { text: "Add a subheading", fontSize: 32, fontWeight: "500", fontFamily: "Inter" },
  body: { text: "Add body text", fontSize: 18, fontWeight: "400", fontFamily: "Inter" },
} as const;

const SHAPE_DEFAULTS = {
  fill: "#6366f1",
  stroke: "",
  strokeWidth: 0,
  opacity: 1,
};

interface CanvasHistory {
  entries: string[];
  index: number;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function safeFilename(input: string): string {
  return input.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "design";
}

export function useCanvasState() {
  const canvasMapRef = useRef<Map<string, fabric.Canvas>>(new Map());
  const historyMapRef = useRef<Map<string, CanvasHistory>>(new Map());
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const activeCanvasIdRef = useRef<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(1080);
  const [canvasHeight, setCanvasHeight] = useState(1080);
  const [zoom, setZoom] = useState(0.58);
  const [fitScale, setFitScale] = useState(0.58);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [templateEditRules, setTemplateEditRulesState] = useState<TemplateEditRules>(
    normalizeEditRules(undefined),
  );
  const templateRulesRef = useRef<TemplateEditRules>(normalizeEditRules(undefined));
  const forceReadOnlyRef = useRef(false);
  const isRestoringRef = useRef<Set<string>>(new Set());

  const getActiveCanvas = useCallback((): fabric.Canvas | null => {
    const id = activeCanvasIdRef.current;
    return id ? canvasMapRef.current.get(id) ?? null : null;
  }, []);

  const updateUndoRedoState = useCallback((pageId: string) => {
    if (pageId !== activeCanvasIdRef.current) return;
    const history = historyMapRef.current.get(pageId);
    setCanUndo(Boolean(history && history.index > 0));
    setCanRedo(Boolean(history && history.index < history.entries.length - 1));
  }, []);

  const saveHistory = useCallback((pageId: string) => {
    if (isRestoringRef.current.has(pageId)) return;
    const canvas = canvasMapRef.current.get(pageId);
    if (!canvas) return;
    const json = serializeCanvas(canvas);
    let history = historyMapRef.current.get(pageId);
    if (!history) {
      history = { entries: [], index: -1 };
      historyMapRef.current.set(pageId, history);
    }
    if (history.entries[history.index] === json) return;
    history.entries = history.entries.slice(0, history.index + 1);
    history.entries.push(json);
    if (history.entries.length > MAX_HISTORY) history.entries.shift();
    history.index = history.entries.length - 1;
    updateUndoRedoState(pageId);
  }, [updateUndoRedoState]);

  const registerCanvas = useCallback((pageId: string, canvas: fabric.Canvas) => {
    canvasMapRef.current.set(pageId, canvas);

    const select = (event: any) => {
      if (activeCanvasIdRef.current === pageId) setSelectedObject(event.selected?.[0] ?? null);
    };
    canvas.on("selection:created", select);
    canvas.on("selection:updated", select);
    canvas.on("selection:cleared", () => {
      if (activeCanvasIdRef.current === pageId) setSelectedObject(null);
    });
    canvas.on("object:added", (event) => {
      if (event.target) ensureObjectId(event.target);
      applyEditRules(canvas, templateRulesRef.current, forceReadOnlyRef.current);
      saveHistory(pageId);
    });
    canvas.on("object:modified", () => saveHistory(pageId));
    canvas.on("object:removed", () => saveHistory(pageId));
    canvas.on("text:changed", () => saveHistory(pageId));

    setTimeout(() => {
      applyEditRules(canvas, templateRulesRef.current, forceReadOnlyRef.current);
      const json = serializeCanvas(canvas);
      historyMapRef.current.set(pageId, { entries: [json], index: 0 });
      updateUndoRedoState(pageId);
    }, 100);
  }, [saveHistory, updateUndoRedoState]);

  const unregisterCanvas = useCallback((pageId: string) => {
    canvasMapRef.current.delete(pageId);
    historyMapRef.current.delete(pageId);
  }, []);

  const setActiveCanvas = useCallback((pageId: string) => {
    const previousId = activeCanvasIdRef.current;
    if (previousId === pageId) return;
    if (previousId) {
      const previousCanvas = canvasMapRef.current.get(previousId);
      previousCanvas?.discardActiveObject();
      previousCanvas?.requestRenderAll();
    }
    activeCanvasIdRef.current = pageId;
    setActiveCanvasId(pageId);
    setSelectedObject(null);
    updateUndoRedoState(pageId);
  }, [updateUndoRedoState]);

  const setTemplateEditRules = useCallback((rules: TemplateEditRules | null | undefined, readOnly = false) => {
    const normalized = normalizeEditRules(rules);
    templateRulesRef.current = normalized;
    forceReadOnlyRef.current = readOnly;
    setTemplateEditRulesState(normalized);
    for (const canvas of canvasMapRef.current.values()) applyEditRules(canvas, normalized, readOnly);
  }, []);

  const addText = useCallback((preset: keyof typeof TEXT_PRESETS) => {
    const canvas = getActiveCanvas();
    if (!canvas || forceReadOnlyRef.current) return;
    const config = TEXT_PRESETS[preset];
    const text = new fabric.Textbox(config.text, {
      left: canvasWidth / 2 - 200,
      top: canvasHeight / 2 - 30,
      width: 400,
      fontSize: config.fontSize,
      fontWeight: config.fontWeight,
      fontFamily: config.fontFamily,
      fill: "#111827",
      textAlign: "center",
      editable: true,
    });
    ensureObjectId(text);
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
  }, [getActiveCanvas, canvasWidth, canvasHeight]);

  const addShape = useCallback((type: "rect" | "circle" | "line" | "triangle") => {
    const canvas = getActiveCanvas();
    if (!canvas || forceReadOnlyRef.current) return;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    let object: fabric.FabricObject;
    if (type === "rect") {
      object = new fabric.Rect({ left: centerX - 75, top: centerY - 75, width: 150, height: 150, rx: 8, ry: 8, ...SHAPE_DEFAULTS });
    } else if (type === "circle") {
      object = new fabric.Circle({ left: centerX - 60, top: centerY - 60, radius: 60, ...SHAPE_DEFAULTS });
    } else if (type === "triangle") {
      object = new fabric.Triangle({ left: centerX - 60, top: centerY - 60, width: 120, height: 120, ...SHAPE_DEFAULTS });
    } else {
      object = new fabric.Line([centerX - 100, centerY, centerX + 100, centerY], { stroke: "#6366f1", strokeWidth: 3, fill: "" });
    }
    ensureObjectId(object);
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
  }, [getActiveCanvas, canvasWidth, canvasHeight]);

  const addImage = useCallback(async (url: string) => {
    const canvas = getActiveCanvas();
    if (!canvas || forceReadOnlyRef.current) return;
    try {
      const image = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      const scale = Math.min(
        (canvasWidth * 0.6) / (image.width || 1),
        (canvasHeight * 0.6) / (image.height || 1),
        1,
      );
      image.set({
        left: canvasWidth / 2 - ((image.width || 0) * scale) / 2,
        top: canvasHeight / 2 - ((image.height || 0) * scale) / 2,
        scaleX: scale,
        scaleY: scale,
      });
      ensureObjectId(image);
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.requestRenderAll();
    } catch (error) {
      console.error("Failed to load image", error);
    }
  }, [getActiveCanvas, canvasWidth, canvasHeight]);

  const setBackground = useCallback((type: "color" | "gradient" | "image", value: string) => {
    const canvas = getActiveCanvas();
    const pageId = activeCanvasIdRef.current;
    if (!canvas || !pageId || forceReadOnlyRef.current) return;
    if (type === "color" || type === "gradient") {
      canvas.backgroundColor = value;
      canvas.requestRenderAll();
      saveHistory(pageId);
      return;
    }
    void fabric.FabricImage.fromURL(value, { crossOrigin: "anonymous" }).then((image) => {
      const scaleX = canvasWidth / (image.width || 1);
      const scaleY = canvasHeight / (image.height || 1);
      image.set({ left: 0, top: 0, scaleX, scaleY, selectable: false, evented: false });
      const oldBackground = canvas.getObjects().find((object) => (object as DDoneFabricObject)._isBgImage);
      if (oldBackground) canvas.remove(oldBackground);
      (image as DDoneFabricObject)._isBgImage = true;
      (image as DDoneFabricObject).templateLocked = true;
      ensureObjectId(image);
      canvas.add(image);
      canvas.sendObjectToBack(image);
      applyEditRules(canvas, templateRulesRef.current, forceReadOnlyRef.current);
      saveHistory(pageId);
    });
  }, [getActiveCanvas, canvasWidth, canvasHeight, saveHistory]);

  const updateSelectedObject = useCallback((properties: Record<string, unknown>) => {
    const canvas = getActiveCanvas();
    const pageId = activeCanvasIdRef.current;
    if (!canvas || !selectedObject || !pageId || !selectedObject.selectable) return;
    selectedObject.set(properties as Partial<fabric.FabricObject>);
    canvas.requestRenderAll();
    saveHistory(pageId);
    setSelectedObject({ ...selectedObject } as fabric.FabricObject);
  }, [getActiveCanvas, selectedObject, saveHistory]);

  const deleteSelected = useCallback(() => {
    const canvas = getActiveCanvas();
    if (!canvas || forceReadOnlyRef.current) return;
    const active = canvas.getActiveObjects().filter((object) => object.selectable);
    active.forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [getActiveCanvas]);

  const setSelectedTemplateLock = useCallback((locked: boolean) => {
    const canvas = getActiveCanvas();
    if (!canvas || !selectedObject) return;
    setObjectTemplateLock(selectedObject, locked);
    const rules = rulesFromCanvas(canvas, "regions");
    templateRulesRef.current = rules;
    setTemplateEditRulesState(rules);
    applyEditRules(canvas, rules, false);
    if (locked) {
      canvas.discardActiveObject();
      setSelectedObject(null);
    }
    canvas.requestRenderAll();
  }, [getActiveCanvas, selectedObject]);

  const buildTemplateRules = useCallback((mode: TemplateEditRules["mode"]) => {
    const canvas = getActiveCanvas();
    return canvas ? rulesFromCanvas(canvas, mode) : normalizeEditRules(undefined);
  }, [getActiveCanvas]);

  const restoreFromHistory = useCallback((index: number) => {
    const pageId = activeCanvasIdRef.current;
    const canvas = getActiveCanvas();
    const history = pageId ? historyMapRef.current.get(pageId) : undefined;
    if (!canvas || !pageId || !history || index < 0 || index >= history.entries.length) return;
    isRestoringRef.current.add(pageId);
    history.index = index;
    void canvas.loadFromJSON(JSON.parse(history.entries[index])).then(() => {
      applyEditRules(canvas, templateRulesRef.current, forceReadOnlyRef.current);
      isRestoringRef.current.delete(pageId);
      updateUndoRedoState(pageId);
    });
  }, [getActiveCanvas, updateUndoRedoState]);

  const undo = useCallback(() => {
    const pageId = activeCanvasIdRef.current;
    const history = pageId ? historyMapRef.current.get(pageId) : undefined;
    if (history) restoreFromHistory(history.index - 1);
  }, [restoreFromHistory]);

  const redo = useCallback(() => {
    const pageId = activeCanvasIdRef.current;
    const history = pageId ? historyMapRef.current.get(pageId) : undefined;
    if (history) restoreFromHistory(history.index + 1);
  }, [restoreFromHistory]);

  const setCanvasSize = useCallback((width: number, height: number) => {
    setCanvasWidth(width);
    setCanvasHeight(height);
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of canvasMapRef.current.values()) {
      canvas.setDimensions({ width: width * dpr, height: height * dpr }, { cssOnly: false });
      canvas.setDimensions({ width, height }, { cssOnly: true });
      canvas.setViewportTransform([dpr, 0, 0, dpr, 0, 0]);
      canvas.requestRenderAll();
    }
  }, []);

  const zoomToFit = useCallback(() => setZoom(fitScale), [fitScale]);
  const zoomIn = useCallback(() => setZoom((value) => Math.min(value * 1.2, 3)), []);
  const zoomOut = useCallback(() => setZoom((value) => Math.max(value / 1.2, 0.05)), []);

  const exportDesign = useCallback(async (
    format: "png" | "jpg" | "svg" | "pdf",
    filename = "design",
    allPages = format === "pdf",
  ) => {
    const canvases = allPages
      ? [...canvasMapRef.current.entries()]
      : activeCanvasIdRef.current
        ? [[activeCanvasIdRef.current, getActiveCanvas()] as const]
        : [];
    const available = canvases.filter((entry): entry is readonly [string, fabric.Canvas] => Boolean(entry[1]));
    if (available.length === 0) return;
    const base = safeFilename(filename);

    if (format === "pdf") {
      const orientation = canvasWidth >= canvasHeight ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "px", format: [canvasWidth, canvasHeight], hotfixes: ["px_scaling"] });
      for (let index = 0; index < available.length; index += 1) {
        const canvas = available[index][1];
        const activeObject = canvas.getActiveObject();
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        if (index > 0) pdf.addPage([canvasWidth, canvasHeight], orientation);
        const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2, quality: 1 });
        pdf.addImage(dataUrl, "PNG", 0, 0, canvasWidth, canvasHeight, undefined, "FAST");
        if (activeObject) canvas.setActiveObject(activeObject);
      }
      pdf.save(`${base}.pdf`);
      return;
    }

    const canvas = available[0][1];
    const activeObject = canvas.getActiveObject();
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    if (format === "svg") {
      downloadBlob(new Blob([canvas.toSVG()], { type: "image/svg+xml;charset=utf-8" }), `${base}.svg`);
    } else {
      const mimeFormat = format === "jpg" ? "jpeg" : "png";
      const dataUrl = canvas.toDataURL({ format: mimeFormat, multiplier: 2, quality: 0.95 });
      const link = document.createElement("a");
      link.download = `${base}.${format}`;
      link.href = dataUrl;
      link.click();
    }
    if (activeObject) {
      canvas.setActiveObject(activeObject);
      canvas.requestRenderAll();
    }
  }, [getActiveCanvas, canvasWidth, canvasHeight]);

  const exportPNG = useCallback(() => void exportDesign("png"), [exportDesign]);
  const getCanvasJSON = useCallback(() => {
    const canvas = getActiveCanvas();
    return canvas ? serializeCanvas(canvas) : "{}";
  }, [getActiveCanvas]);
  const getCanvasJSONForPage = useCallback((pageId: string) => {
    const canvas = canvasMapRef.current.get(pageId);
    return canvas ? serializeCanvas(canvas) : "{}";
  }, []);

  const loadTemplate = useCallback((template: Template) => {
    setCanvasWidth(template.width);
    setCanvasHeight(template.height);
    const rules = normalizeEditRules(template.edit_rules);
    templateRulesRef.current = rules;
    setTemplateEditRulesState(rules);
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of canvasMapRef.current.values()) {
      canvas.setDimensions({ width: template.width * dpr, height: template.height * dpr }, { cssOnly: false });
      canvas.setDimensions({ width: template.width, height: template.height }, { cssOnly: true });
      canvas.setViewportTransform([dpr, 0, 0, dpr, 0, 0]);
    }
    const canvas = getActiveCanvas();
    const pageId = activeCanvasIdRef.current;
    if (canvas && pageId) {
      isRestoringRef.current.add(pageId);
      void canvas.loadFromJSON(JSON.parse(template.canvas_json)).then(() => {
        applyEditRules(canvas, rules, forceReadOnlyRef.current);
        isRestoringRef.current.delete(pageId);
        historyMapRef.current.set(pageId, { entries: [serializeCanvas(canvas)], index: 0 });
        updateUndoRedoState(pageId);
      });
    }
  }, [getActiveCanvas, updateUndoRedoState]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (meta && event.key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if ((event.key === "Delete" || event.key === "Backspace") && !isTextEditing()) {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, deleteSelected]);

  function isTextEditing(): boolean {
    const object = getActiveCanvas()?.getActiveObject();
    return object instanceof fabric.Textbox && object.isEditing === true;
  }

  return {
    registerCanvas,
    unregisterCanvas,
    setActiveCanvas,
    activeCanvasId,
    canvasMap: canvasMapRef,
    get canvas() { return getActiveCanvas(); },
    selectedObject,
    canvasWidth,
    canvasHeight,
    zoom,
    setZoomRaw: setZoom,
    fitScale,
    setFitScale,
    addText,
    addShape,
    addImage,
    setBackground,
    updateSelectedObject,
    deleteSelected,
    undo,
    redo,
    canUndo,
    canRedo,
    setCanvasSize,
    zoomToFit,
    zoomIn,
    zoomOut,
    exportPNG,
    exportDesign,
    getCanvasJSON,
    getCanvasJSONForPage,
    loadTemplate,
    templateEditRules,
    setTemplateEditRules,
    setSelectedTemplateLock,
    buildTemplateRules,
  };
}
