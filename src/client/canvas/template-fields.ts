import * as fabric from "fabric";
import {
  ensureObjectId,
  type DDoneFabricObject,
  type DDoneTemplateFieldType,
} from "../canvas-model";

export interface TemplateFieldDefinition {
  objectId: string;
  key: string;
  label: string;
  type: DDoneTemplateFieldType;
  required: boolean;
  defaultValue: string;
  objectType: string;
}

export interface TemplateFieldValidationIssue {
  objectId: string;
  key: string;
  label: string;
  message: string;
}

export interface ParsedCsvData {
  headers: string[];
  records: Record<string, string>[];
}

function walkObjects(objects: fabric.FabricObject[], callback: (object: fabric.FabricObject) => void): void {
  for (const object of objects) {
    callback(object);
    if (object instanceof fabric.Group) walkObjects(object.getObjects(), callback);
  }
}

function normalizedFieldKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function normalizeTemplateFieldKey(value: string): string {
  return normalizedFieldKey(value);
}

export function setTemplateField(
  object: fabric.FabricObject,
  input: {
    key: string;
    label?: string;
    type: DDoneTemplateFieldType;
    required?: boolean;
    defaultValue?: string;
  },
): TemplateFieldDefinition {
  const target = object as DDoneFabricObject;
  const key = normalizedFieldKey(input.key);
  if (!key) throw new Error("Il campo deve avere una chiave valida");
  const objectId = ensureObjectId(object);
  target.ddoneFieldKey = key;
  target.ddoneFieldLabel = input.label?.trim().slice(0, 120) || key;
  target.ddoneFieldType = input.type;
  target.ddoneFieldRequired = Boolean(input.required);
  target.ddoneFieldDefault = input.defaultValue?.slice(0, 4_000) ?? "";
  target.templateEditable = true;
  target.templateLocked = false;
  object.setCoords();
  return {
    objectId,
    key,
    label: target.ddoneFieldLabel,
    type: input.type,
    required: target.ddoneFieldRequired,
    defaultValue: target.ddoneFieldDefault,
    objectType: object.type,
  };
}

export function clearTemplateField(object: fabric.FabricObject): void {
  const target = object as DDoneFabricObject;
  delete target.ddoneFieldKey;
  delete target.ddoneFieldLabel;
  delete target.ddoneFieldType;
  delete target.ddoneFieldRequired;
  delete target.ddoneFieldDefault;
}

export function listTemplateFields(canvas: fabric.Canvas): TemplateFieldDefinition[] {
  const fields: TemplateFieldDefinition[] = [];
  walkObjects(canvas.getObjects(), (object) => {
    const target = object as DDoneFabricObject;
    if (!target.ddoneFieldKey || !target.ddoneFieldType) return;
    fields.push({
      objectId: ensureObjectId(object),
      key: target.ddoneFieldKey,
      label: target.ddoneFieldLabel || target.ddoneFieldKey,
      type: target.ddoneFieldType,
      required: Boolean(target.ddoneFieldRequired),
      defaultValue: target.ddoneFieldDefault ?? "",
      objectType: object.type,
    });
  });
  return fields.sort((first, second) => first.label.localeCompare(second.label));
}

function currentFieldValue(object: fabric.FabricObject): string {
  const target = object as DDoneFabricObject;
  if (object instanceof fabric.Textbox || object instanceof fabric.IText || object.type === "text") {
    return String((object as fabric.Textbox).text ?? "").trim();
  }
  if (object instanceof fabric.FabricImage) return String(target.ddoneMediaUrl ?? (object as any).getSrc?.() ?? "").trim();
  return target.ddoneFieldDefault?.trim() ?? "";
}

export function validateTemplateFields(canvas: fabric.Canvas): TemplateFieldValidationIssue[] {
  const issues: TemplateFieldValidationIssue[] = [];
  const keys = new Map<string, string[]>();
  walkObjects(canvas.getObjects(), (object) => {
    const target = object as DDoneFabricObject;
    if (!target.ddoneFieldKey || !target.ddoneFieldType) return;
    const objectId = ensureObjectId(object);
    const entries = keys.get(target.ddoneFieldKey) ?? [];
    entries.push(objectId);
    keys.set(target.ddoneFieldKey, entries);
    if (target.ddoneFieldRequired && !currentFieldValue(object) && !target.ddoneFieldDefault?.trim()) {
      issues.push({
        objectId,
        key: target.ddoneFieldKey,
        label: target.ddoneFieldLabel || target.ddoneFieldKey,
        message: "Campo obbligatorio senza valore o default",
      });
    }
    if (["text", "price", "cta"].includes(target.ddoneFieldType)
      && !(object instanceof fabric.Textbox || object instanceof fabric.IText || object.type === "text")) {
      issues.push({
        objectId,
        key: target.ddoneFieldKey,
        label: target.ddoneFieldLabel || target.ddoneFieldKey,
        message: "Il tipo testuale è assegnato a un oggetto non testuale",
      });
    }
    if (["image", "logo"].includes(target.ddoneFieldType) && !(object instanceof fabric.FabricImage)) {
      issues.push({
        objectId,
        key: target.ddoneFieldKey,
        label: target.ddoneFieldLabel || target.ddoneFieldKey,
        message: "Il campo immagine/logo richiede un oggetto immagine",
      });
    }
  });
  for (const [key, objectIds] of keys) {
    if (objectIds.length < 2) continue;
    for (const objectId of objectIds) {
      issues.push({ objectId, key, label: key, message: "Chiave duplicata nel template" });
    }
  }
  return issues;
}

function preserveObjectMetadata(source: fabric.FabricObject, target: fabric.FabricObject): void {
  const sourceMetadata = source as DDoneFabricObject;
  const targetMetadata = target as DDoneFabricObject;
  Object.assign(targetMetadata, {
    ddoneId: sourceMetadata.ddoneId,
    ddoneName: sourceMetadata.ddoneName,
    templateLocked: sourceMetadata.templateLocked,
    templateEditable: sourceMetadata.templateEditable,
    ddoneFieldKey: sourceMetadata.ddoneFieldKey,
    ddoneFieldLabel: sourceMetadata.ddoneFieldLabel,
    ddoneFieldType: sourceMetadata.ddoneFieldType,
    ddoneFieldRequired: sourceMetadata.ddoneFieldRequired,
    ddoneFieldDefault: sourceMetadata.ddoneFieldDefault,
    ddoneMediaUrl: sourceMetadata.ddoneMediaUrl,
  });
}

async function replaceImageObject(canvas: fabric.Canvas, object: fabric.FabricImage, url: string): Promise<void> {
  const replacement = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
  const index = canvas.getObjects().indexOf(object);
  replacement.set({
    left: object.left,
    top: object.top,
    originX: object.originX,
    originY: object.originY,
    scaleX: ((object.getScaledWidth() || object.width || 1) / (replacement.width || 1)),
    scaleY: ((object.getScaledHeight() || object.height || 1) / (replacement.height || 1)),
    angle: object.angle,
    flipX: object.flipX,
    flipY: object.flipY,
    opacity: object.opacity,
    clipPath: object.clipPath,
  });
  preserveObjectMetadata(object, replacement);
  (replacement as DDoneFabricObject).ddoneMediaUrl = url;
  canvas.remove(object);
  canvas.insertAt(index < 0 ? canvas.getObjects().length : index, replacement);
  replacement.setCoords();
}

export async function applyTemplateRecordToCanvas(
  canvas: fabric.Canvas,
  record: Record<string, string>,
): Promise<{ applied: number; missing: string[] }> {
  let applied = 0;
  const missing: string[] = [];
  const imageJobs: Promise<void>[] = [];
  walkObjects(canvas.getObjects(), (object) => {
    const target = object as DDoneFabricObject;
    if (!target.ddoneFieldKey || !target.ddoneFieldType) return;
    const rawValue = record[target.ddoneFieldKey];
    const value = (rawValue ?? target.ddoneFieldDefault ?? "").trim();
    if (!value) {
      if (target.ddoneFieldRequired) missing.push(target.ddoneFieldKey);
      return;
    }
    if (["text", "price", "cta"].includes(target.ddoneFieldType)
      && (object instanceof fabric.Textbox || object instanceof fabric.IText || object.type === "text")) {
      (object as fabric.Textbox).set({ text: value });
      object.setCoords();
      applied += 1;
      return;
    }
    if (["image", "logo"].includes(target.ddoneFieldType) && object instanceof fabric.FabricImage) {
      imageJobs.push(replaceImageObject(canvas, object, value));
      applied += 1;
    }
  });
  await Promise.all(imageJobs);
  canvas.requestRenderAll();
  for (const object of canvas.getObjects()) canvas.fire("object:modified", { target: object } as any);
  return { applied, missing: [...new Set(missing)] };
}

function parseCsvRows(source: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += character;
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function parseCsv(source: string): ParsedCsvData {
  const normalized = source.replace(/^\uFEFF/, "").trim();
  if (!normalized) return { headers: [], records: [] };
  const firstLine = normalized.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows = parseCsvRows(normalized, delimiter);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((value, index) => normalizedFieldKey(value) || `column_${index + 1}`);
  const records = rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
  return { headers, records };
}

function updateSerializedObject(object: any, record: Record<string, string>): number {
  let applied = 0;
  const key = typeof object.ddoneFieldKey === "string" ? object.ddoneFieldKey : null;
  const type = object.ddoneFieldType as DDoneTemplateFieldType | undefined;
  if (key && type) {
    const value = String(record[key] ?? object.ddoneFieldDefault ?? "").trim();
    if (value) {
      if (["text", "price", "cta"].includes(type)) object.text = value;
      if (["image", "logo"].includes(type)) {
        object.src = value;
        object.ddoneMediaUrl = value;
      }
      applied += 1;
    }
  }
  if (Array.isArray(object.objects)) {
    for (const child of object.objects) applied += updateSerializedObject(child, record);
  }
  return applied;
}

export function applyTemplateRecordToCanvasJson(
  canvasJson: string,
  record: Record<string, string>,
): { canvasJson: string; applied: number } {
  const parsed = JSON.parse(canvasJson || "{}") as { objects?: any[] };
  let applied = 0;
  for (const object of parsed.objects ?? []) applied += updateSerializedObject(object, record);
  return { canvasJson: JSON.stringify(parsed), applied };
}
