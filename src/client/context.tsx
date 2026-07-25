import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Design, DesignVersion, Template, TemplateEditRules, Page } from "./types";
import type * as fabric from "fabric";
import type { Collaborator } from "./hooks/use-collaboration";

export interface CanvasSize {
  label: string;
  width: number;
  height: number;
}

export const CANVAS_SIZES: CanvasSize[] = [
  { label: "LinkedIn Square", width: 1080, height: 1080 },
  { label: "LinkedIn Landscape", width: 1200, height: 627 },
  { label: "LinkedIn Portrait", width: 1200, height: 1500 },
  { label: "Instagram Story", width: 1080, height: 1920 },
  { label: "A4 Portrait", width: 1240, height: 1754 },
  { label: "A4 Landscape", width: 1754, height: 1240 },
  { label: "Instagram Portrait", width: 1080, height: 1350 },
  { label: "Facebook Post", width: 1200, height: 630 },
];

export type CropAspect = "free" | "original" | "1:1" | "4:5" | "16:9";

export interface CropState {
  active: boolean;
  objectId: string | null;
  aspect: CropAspect;
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}

export interface EditorContextValue {
  registerCanvas: (pageId: string, canvas: fabric.Canvas) => void;
  unregisterCanvas: (pageId: string) => void;
  setActiveCanvas: (pageId: string) => void;
  activeCanvasId: string | null;
  canvas: fabric.Canvas | null;
  canvasMap: { current: Map<string, fabric.Canvas> };
  selectedObject: fabric.FabricObject | null;
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  setZoomRaw: (zoom: number) => void;
  fitScale: number;
  setFitScale: (scale: number) => void;

  addText: (preset: "heading" | "subheading" | "body") => void;
  addShape: (type: "rect" | "circle" | "line" | "triangle") => void;
  addImage: (url: string) => Promise<void> | void;
  setBackground: (type: "color" | "gradient" | "image", value: string) => void;
  updateSelectedObject: (props: Record<string, unknown>) => void;
  deleteSelected: () => void;
  duplicateSelected: () => Promise<void>;
  arrangeSelected: (direction: "front" | "forward" | "backward" | "back") => void;
  flipSelected: (axis: "x" | "y") => void;
  toggleSelectedLock: () => void;
  recolorSelectedVector: (color: string) => void;
  beginCrop: (image?: fabric.FabricImage | null) => void;
  updateCrop: (changes: Partial<Omit<CropState, "active" | "objectId">>) => void;
  applyCrop: () => void;
  cancelCrop: () => void;
  cropState: CropState;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  setCanvasSize: (width: number, height: number) => void;
  zoomToFit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  exportPNG: () => void;
  exportDesign: (format: "png" | "jpg" | "svg" | "pdf", filename?: string, allPages?: boolean) => Promise<void>;
  getCanvasJSON: () => string;
  getCanvasJSONForPage: (pageId: string) => string;
  loadTemplate: (template: Template) => void;
  templateEditRules: TemplateEditRules;
  setTemplateEditRules: (rules: TemplateEditRules | null | undefined, readOnly?: boolean) => void;
  setSelectedTemplateLock: (locked: boolean) => void;
  buildTemplateRules: (mode: TemplateEditRules["mode"]) => TemplateEditRules;

  navigate: (to: string) => void;

  designs: Design[];
  activeDesign: Design | null;
  createDesign: () => Promise<string | undefined>;
  createFromTemplate: (template: Template) => Promise<string | undefined>;
  loadDesign: (id: string) => Promise<void>;
  saveDesign: () => Promise<void>;
  deleteDesign: (id: string) => Promise<void>;
  renameDesign: (id: string, name: string) => Promise<void>;
  saving: boolean;

  pages: Page[];
  activePageId: string | null;
  activePage: Page | null;
  addPage: (afterPageId?: string) => Promise<void>;
  duplicatePage: (pageId: string) => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  renamePage: (pageId: string, title: string) => Promise<void>;
  switchToPage: (pageId: string) => void;

  templates: Template[];
  loading: boolean;
  refreshLibrary: () => Promise<void>;
  versions: DesignVersion[];
  versionsLoading: boolean;
  loadVersions: (designId?: string | null) => Promise<void>;
  createVersion: (label?: string, source?: "manual" | "save") => Promise<void>;
  restoreVersion: (versionId: string) => Promise<void>;

  readOnly: boolean;
  collaborationConnected: boolean;
  collaborationSynced: boolean;
  collaborators: Collaborator[];
}

export const EditorContext = createContext<EditorContextValue>(null!);

export function useEditor() {
  return useContext(EditorContext);
}
