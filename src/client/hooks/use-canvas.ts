import { useState, useCallback, useRef, useEffect } from "preact/hooks";
import * as fabric from "fabric";
import { jsPDF } from "jspdf";
import type { CropAspect, CropState } from "../context";
import type { Template, TemplateEditRules } from "../types";
import {
  applyEditRules,
  ensureObjectId,
  EXTRA_OBJECT_PROPERTIES,
  normalizeEditRules,
  rulesFromCanvas,
  serializeCanvas,
  setObjectTemplateLock,
  type DDoneFabricObject,
} from "../canvas-model";
import { recolorVectorObject } from "../canvas/media-effects";

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

const EMPTY_CROP_STATE: CropState = {
  active: false,
  objectId: null,
  aspect: "free",
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

interface CanvasHistory {
  entries: string[];
  index: number;
}

interface CropSnapshot {
  image: fabric.FabricImage;
  center: fabric.Point;
  sourceWidth: number;
  sourceHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  properties: {
    cropX: number;
    cropY: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    angle: number;
    left: number;
    top: number;
    originX: fabric.TOriginX;
    originY: fabric.TOriginY;
  };
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

function sourceDimensions(image: fabric.FabricImage): { width: number; height: number } {
  const element = image.getElement() as any;
  return {
    width: Number(element?.naturalWidth || element?.videoWidth || element?.width || image.width || 1),
    height: Number(element?.naturalHeight || element?.videoHeight || element?.height || image.height || 1),
  };
}

function aspectRatio(aspect: CropAspect, snapshot: CropSnapshot): number {
  if (aspect === "original") return snapshot.sourceWidth / snapshot.sourceHeight;
  if (aspect === "1:1") return 1;
  if (aspect === "4:5") return 4 / 5;
  if (aspect === "16:9") return 16 / 9;
  return snapshot.properties.width / snapshot.properties.height;
}

function cropBaseSize(snapshot: CropSnapshot, aspect: CropAspect): { width: number; height: number } {
  const ratio = aspectRatio(aspect, snapshot);
  if (snapshot.sourceWidth / snapshot.sourceHeight > ratio) {
    return { width: snapshot.sourceHeight * ratio, height: snapshot.sourceHeight };
  }
  return { width: snapshot.sourceWidth, height: snapshot.sourceWidth / ratio };
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
  const [cropState, setCropState] = useState<CropState>(EMPTY_CROP_STATE);
  const cropSnapshotRef = useRef<CropSnapshot | null>(null);
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

  const refreshSelectedObject = useCallback((target: fabric.FabricObject | null) => {
    setSelectedObject(null);
    queueMicrotask(() => setSelectedObject(target));
  }, []);

  const registerCanvas = useCallback((pageId: string, canvas: fabric.Canvas) => {
    canvasMapRef.current.set(pageId, canvas);

    const select = (event: any) => {
      if (activeCanvasIdRef.current === pageId) setSelectedObject(event.selected?.[0] ?? null);
    };
    const clearSelection = () => {
      if (activeCanvasIdRef.current === pageId && !cropSnapshotRef.current) setSelectedObject(null);
    };
    canvas.on("selection:created", select);
    canvas.on("selection:updated", select);
    canvas.on("selection:cleared", clearSelection);
    canvas.on("object:added", (event) => {
      if (event.target) ensureObjectId(event.target);
      applyEditRules(canvas, templateRulesRef.current, forceReadOnlyRef.current);
      saveHistory(pageId);
    });
    canvas.on("object:modified", (event) => {
      saveHistory(pageId);
      if (event.target && activeCanvasIdRef.current === pageId) refreshSelectedObject(event.target);
    });
    canvas.on("object:removed", () => saveHistory(pageId));
    canvas.on("text:changed", () => saveHistory(pageId));

    setTimeout(() => {
      applyEditRules(canvas, templateRulesRef.current, forceReadOnlyRef.current);
      const json = serializeCanvas(canvas);
      historyMapRef.current.set(pageId, { entries: [json], index: 0 });
      updateUndoRedoState(pageId);
    }, 100);
  }, [saveHistory, updateUndoRedoState, refreshSelectedObject]);

  const unregisterCanvas = useCallback((pageId: string) => {
    canvasMapRef.current.delete(pageId);
    historyMapRef.current.delete(pageId);
  }, []);

  const setActiveCanvas = useCallback((pageId: string) => {
    const previousId = activeCanvasIdRef.current;
    if (previousId === pageId) return;
    cropSnapshotRef.current = null;
    setCropState(EMPTY_CROP_STATE);
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
      const metadata = image as DDoneFabricObject;
      metadata.ddoneMediaKind = "image";
      metadata.ddoneMediaUrl = url;
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
      const metadata = image as DDoneFabricObject;
      metadata._isBgImage = true;
      metadata.templateLocked = true;
      metadata.ddoneMediaKind = "image";
      metadata.ddoneMediaUrl = value;
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
    const target = canvas?.getActiveObject() ?? selectedObject;
    if (!canvas || !target || !pageId || !target.selectable) return;
    target.set(properties as Partial<fabric.FabricObject>);
    target.setCoords();
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target } as any);
    saveHistory(pageId);
    refreshSelectedObject(target);
  }, [getActiveCanvas, selectedObject, saveHistory, refreshSelectedObject]);

  const deleteSelected = useCallback(() => {
    const canvas = getActiveCanvas();
    if (!canvas || forceReadOnlyRef.current) return;
    const active = canvas.getActiveObjects().filter((object) => object.selectable);
    active.forEach((object) => canvas.remove(object));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, [getActiveCanvas]);

  const duplicateSelected = useCallback(async () => {
    const canvas = getActiveCanvas();
    if (!canvas || forceReadOnlyRef.current) return;
    const active = canvas.getActiveObject();
    if (!active) return;
    const clone = await active.clone([...EXTRA_OBJECT_PROPERTIES] as unknown as string[]);
    const metadata = clone as DDoneFabricObject;
    metadata.ddoneId = undefined;
    ensureObjectId(clone);
    clone.set({ left: (active.left ?? 0) + 24, top: (active.top ?? 0) + 24 });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    canvas.requestRenderAll();
  }, [getActiveCanvas]);

  const arrangeSelected = useCallback((direction: "front" | "forward" | "backward" | "back") => {
    const canvas = getActiveCanvas();
    const target = canvas?.getActiveObject();
    if (!canvas || !target || forceReadOnlyRef.current) return;
    const api = canvas as any;
    if (direction === "front") api.bringObjectToFront?.(target);
    if (direction === "forward") api.bringObjectForward?.(target);
    if (direction === "backward") api.sendObjectBackwards?.(target);
    if (direction === "back") api.sendObjectToBack?.(target);
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target } as any);
  }, [getActiveCanvas]);

  const flipSelected = useCallback((axis: "x" | "y") => {
    const canvas = getActiveCanvas();
    const target = canvas?.getActiveObject();
    if (!canvas || !target || forceReadOnlyRef.current) return;
    target.set(axis === "x" ? { flipX: !target.flipX } : { flipY: !target.flipY });
    target.setCoords();
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target } as any);
  }, [getActiveCanvas]);

  const toggleSelectedLock = useCallback(() => {
    const canvas = getActiveCanvas();
    const target = canvas?.getActiveObject();
    if (!canvas || !target || forceReadOnlyRef.current) return;
    const locked = Boolean(target.lockMovementX && target.lockMovementY && target.lockScalingX && target.lockScalingY);
    target.set({
      lockMovementX: !locked,
      lockMovementY: !locked,
      lockScalingX: !locked,
      lockScalingY: !locked,
      lockRotation: !locked,
      hasControls: locked,
      hoverCursor: locked ? "move" : "default",
    });
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target } as any);
    refreshSelectedObject(target);
  }, [getActiveCanvas, refreshSelectedObject]);

  const recolorSelectedVector = useCallback((color: string) => {
    const canvas = getActiveCanvas();
    const target = canvas?.getActiveObject();
    if (!canvas || !target || forceReadOnlyRef.current) return;
    if (recolorVectorObject(target, color) === 0) return;
    canvas.requestRenderAll();
    canvas.fire("object:modified", { target } as any);
    refreshSelectedObject(target);
  }, [getActiveCanvas, refreshSelectedObject]);

  const applyCropState = useCallback((state: CropState) => {
    const canvas = getActiveCanvas();
    const snapshot = cropSnapshotRef.current;
    if (!canvas || !snapshot) return;
    const image = snapshot.image;
    const base = cropBaseSize(snapshot, state.aspect);
    const zoomFactor = Math.max(1, Math.min(4, state.zoom));
    const width = Math.max(1, base.width / zoomFactor);
    const height = Math.max(1, base.height / zoomFactor);
    const maxX = Math.max(0, snapshot.sourceWidth - width);
    const maxY = Math.max(0, snapshot.sourceHeight - height);
    const cropX = maxX * ((Math.max(-1, Math.min(1, state.offsetX)) + 1) / 2);
    const cropY = maxY * ((Math.max(-1, Math.min(1, state.offsetY)) + 1) / 2);
    const ratio = width / height;
    let renderedWidth = snapshot.renderedWidth;
    let renderedHeight = renderedWidth / ratio;
    if (renderedHeight > snapshot.renderedHeight) {
      renderedHeight = snapshot.renderedHeight;
      renderedWidth = renderedHeight * ratio;
    }

    image.set({
      cropX,
      cropY,
      width,
      height,
      scaleX: renderedWidth / width,
      scaleY: renderedHeight / height,
      angle: state.rotation,
    });
    image.setPositionByOrigin(snapshot.center, "center", "center");
    image.setCoords();
    canvas.requestRenderAll();
    refreshSelectedObject(image);
  }, [getActiveCanvas, refreshSelectedObject]);

  const beginCrop = useCallback((provided?: fabric.FabricImage | null) => {
    const canvas = getActiveCanvas();
    const active = provided ?? (canvas?.getActiveObject() instanceof fabric.FabricImage
      ? canvas.getActiveObject() as fabric.FabricImage
      : null);
    if (!canvas || !active || forceReadOnlyRef.current) return;
    const source = sourceDimensions(active);
    const id = ensureObjectId(active);
    cropSnapshotRef.current = {
      image: active,
      center: active.getCenterPoint(),
      sourceWidth: source.width,
      sourceHeight: source.height,
      renderedWidth: active.getScaledWidth(),
      renderedHeight: active.getScaledHeight(),
      properties: {
        cropX: active.cropX ?? 0,
        cropY: active.cropY ?? 0,
        width: active.width || source.width,
        height: active.height || source.height,
        scaleX: active.scaleX ?? 1,
        scaleY: active.scaleY ?? 1,
        angle: active.angle ?? 0,
        left: active.left ?? 0,
        top: active.top ?? 0,
        originX: active.originX,
        originY: active.originY,
      },
    };
    const state: CropState = {
      active: true,
      objectId: id,
      aspect: "free",
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: active.angle ?? 0,
    };
    setCropState(state);
    canvas.setActiveObject(active);
    canvas.requestRenderAll();
  }, [getActiveCanvas]);

  const updateCrop = useCallback((changes: Partial<Omit<CropState, "active" | "objectId">>) => {
    setCropState((current) => {
      if (!current.active) return current;
      const next = { ...current, ...changes };
      applyCropState(next);
      return next;
    });
  }, [applyCropState]);

  const applyCrop = useCallback(() => {
    const canvas = getActiveCanvas();
    const pageId = activeCanvasIdRef.current;
    const snapshot = cropSnapshotRef.current;
    if (!canvas || !pageId || !snapshot) return;
    canvas.fire("object:modified", { target: snapshot.image } as any);
    saveHistory(pageId);
    cropSnapshotRef.current = null;
    setCropState(EMPTY_CROP_STATE);
    refreshSelectedObject(snapshot.image);
  }, [getActiveCanvas, saveHistory, refreshSelectedObject]);

  const cancelCrop = useCallback(() => {
    const canvas = getActiveCanvas();
    const snapshot = cropSnapshotRef.current;
    if (!canvas || !snapshot) {
      setCropState(EMPTY_CROP_STATE);
      return;
    }
    snapshot.image.set(snapshot.properties as any);
    snapshot.image.setPositionByOrigin(snapshot.center, "center", "center");
    snapshot.image.setCoords();
    canvas.setActiveObject(snapshot.image);
    canvas.requestRenderAll();
    cropSnapshotRef.current = null;
    setCropState(EMPTY_CROP_STATE);
    refreshSelectedObject(snapshot.image);
  }, [getActiveCanvas, refreshSelectedObject]);

  const setSelectedTemplateLock = useCallback((locked: boolean) => {
    const canvas = getActiveCanvas();
    const target = canvas?.getActiveObject() ?? selectedObject;
    if (!canvas || !target) return;
    setObjectTemplateLock(target, locked);
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
    cropSnapshotRef.current = null;
    setCropState(EMPTY_CROP_STATE);
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
      } else if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicateSelected();
      } else if ((event.key === "Delete" || event.key === "Backspace") && !isTextEditing()) {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "Escape" && cropSnapshotRef.current) {
        cancelCrop();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, duplicateSelected, deleteSelected, cancelCrop]);

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
    duplicateSelected,
    arrangeSelected,
    flipSelected,
    toggleSelectedLock,
    recolorSelectedVector,
    beginCrop,
    updateCrop,
    applyCrop,
    cancelCrop,
    cropState,
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
