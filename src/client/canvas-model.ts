import type * as fabric from "fabric";
import type { TemplateEditRules } from "./types";

export const EXTRA_OBJECT_PROPERTIES = [
  "ddoneId", "ddoneName", "templateLocked", "templateEditable", "_isBgImage",
  "ddoneSourceId", "ddoneProvider", "ddoneSourceUrl", "ddoneLicense", "ddoneLicenseUrl",
  "ddoneAuthor", "ddoneAttribution", "ddoneAttributionRequired", "ddoneIsSvg", "ddoneMediaKind",
  "ddoneFormat", "ddoneTransparent", "ddoneEffect", "ddoneMediaUrl", "ddonePosterUrl",
  "ddoneSmartType", "ddoneSmartVariant", "ddoneSmartData", "ddoneVectorPalette",
  "ddoneVectorOriginalPalette", "ddoneEffectConfig", "ddoneEffectSourceId", "ddoneFieldKey",
  "ddoneFieldLabel", "ddoneFieldType", "ddoneFieldRequired", "ddoneFieldDefault",
] as const;

export type DDoneTemplateFieldType = "text" | "price" | "cta" | "image" | "logo";
export type DDoneSmartElementType = "table" | "grid" | "frame" | "chart" | "module";

export type DDoneFabricObject = fabric.FabricObject & {
  ddoneId?: string;
  ddoneName?: string;
  templateLocked?: boolean;
  templateEditable?: boolean;
  _isBgImage?: boolean;
  ddoneSourceId?: string;
  ddoneProvider?: string;
  ddoneSourceUrl?: string;
  ddoneLicense?: string;
  ddoneLicenseUrl?: string;
  ddoneAuthor?: string;
  ddoneAttribution?: string;
  ddoneAttributionRequired?: boolean;
  ddoneIsSvg?: boolean;
  ddoneMediaKind?: string;
  ddoneFormat?: string;
  ddoneTransparent?: boolean;
  ddoneEffect?: string;
  ddoneMediaUrl?: string;
  ddonePosterUrl?: string;
  ddoneSmartType?: DDoneSmartElementType;
  ddoneSmartVariant?: string;
  ddoneSmartData?: string;
  ddoneVectorPalette?: string[];
  ddoneVectorOriginalPalette?: string[];
  ddoneEffectConfig?: string;
  ddoneEffectSourceId?: string;
  ddoneFieldKey?: string;
  ddoneFieldLabel?: string;
  ddoneFieldType?: DDoneTemplateFieldType;
  ddoneFieldRequired?: boolean;
  ddoneFieldDefault?: string;
};

export function ensureObjectId(object: fabric.FabricObject): string {
  const target = object as DDoneFabricObject;
  if (!target.ddoneId) target.ddoneId = crypto.randomUUID();
  return target.ddoneId;
}
export function ensureCanvasObjectIds(canvas: fabric.Canvas): void { for (const object of canvas.getObjects()) ensureObjectId(object); }
export function serializeObject(object: fabric.FabricObject): Record<string, unknown> {
  ensureObjectId(object);
  return object.toObject([...EXTRA_OBJECT_PROPERTIES] as unknown as string[]) as Record<string, unknown>;
}
export function serializeCanvas(canvas: fabric.Canvas): string {
  ensureCanvasObjectIds(canvas);
  const serialized = (canvas as unknown as { toJSON(propertiesToInclude?: string[]): Record<string, unknown> }).toJSON([...EXTRA_OBJECT_PROPERTIES]);
  return JSON.stringify(serialized);
}
export function normalizeEditRules(value: TemplateEditRules | null | undefined): TemplateEditRules {
  return { mode: value?.mode ?? "unlocked", editableObjectIds: value?.editableObjectIds ?? [], lockedObjectIds: value?.lockedObjectIds ?? [] };
}
export function isObjectEditable(object: fabric.FabricObject, rulesValue: TemplateEditRules | null | undefined): boolean {
  const rules = normalizeEditRules(rulesValue);
  const target = object as DDoneFabricObject;
  if (target._isBgImage) return false;
  if (rules.mode === "unlocked") return true;
  const id = ensureObjectId(object);
  if (rules.lockedObjectIds.includes(id) || target.templateLocked) return false;
  if (rules.editableObjectIds.includes(id) || target.templateEditable) return true;
  if (rules.mode === "locked") return false;
  return true;
}
export function applyEditRules(canvas: fabric.Canvas, rulesValue: TemplateEditRules | null | undefined, forceReadOnly = false): void {
  const rules = normalizeEditRules(rulesValue);
  ensureCanvasObjectIds(canvas);
  for (const object of canvas.getObjects()) {
    const editable = !forceReadOnly && isObjectEditable(object, rules);
    object.set({ selectable: editable, evented: editable, lockMovementX: !editable, lockMovementY: !editable, lockScalingX: !editable, lockScalingY: !editable, lockRotation: !editable, hasControls: editable, hoverCursor: editable ? "move" : "not-allowed" });
  }
  canvas.selection = !forceReadOnly && rules.mode !== "locked";
  canvas.requestRenderAll();
}
export function rulesFromCanvas(canvas: fabric.Canvas, mode: TemplateEditRules["mode"]): TemplateEditRules {
  ensureCanvasObjectIds(canvas);
  const editableObjectIds: string[] = [];
  const lockedObjectIds: string[] = [];
  for (const object of canvas.getObjects()) {
    const target = object as DDoneFabricObject;
    const id = ensureObjectId(object);
    if (target.templateEditable) editableObjectIds.push(id);
    if (target.templateLocked || target._isBgImage) lockedObjectIds.push(id);
  }
  return { mode, editableObjectIds, lockedObjectIds };
}
export function setObjectTemplateLock(object: fabric.FabricObject, locked: boolean): void {
  const target = object as DDoneFabricObject;
  ensureObjectId(object);
  target.templateLocked = locked;
  target.templateEditable = !locked;
}
export function markSvgObject(object: fabric.FabricObject, format = "svg"): void {
  const target = object as DDoneFabricObject;
  ensureObjectId(object);
  target.ddoneIsSvg = true;
  target.ddoneMediaKind = "vector";
  target.ddoneFormat = format;
}