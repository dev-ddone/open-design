import * as fabric from "fabric";
import type { DDoneFabricObject } from "../canvas-model";
import type { BrandKit } from "../types";

export type AuditSeverity = "error" | "warning" | "info";

export interface DesignAuditIssue {
  id: string;
  severity: AuditSeverity;
  category: "layout" | "brand" | "typography" | "license" | "accessibility" | "template";
  title: string;
  detail: string;
  objectId?: string;
}

export interface DesignAuditReport {
  score: number;
  issues: DesignAuditIssue[];
  errors: number;
  warnings: number;
  infos: number;
  checkedObjects: number;
}

export function normalizeDesignColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color);
  if (!rgb) return null;
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, "0")).join("")}`;
}

export function scoreAuditIssues(issues: DesignAuditIssue[]): number {
  const penalty = issues.reduce((total, item) => total + (item.severity === "error" ? 12 : item.severity === "warning" ? 5 : 1), 0);
  return Math.max(0, 100 - penalty);
}

function isTextObject(object: fabric.FabricObject): object is fabric.Textbox | fabric.IText {
  return object instanceof fabric.Textbox || object instanceof fabric.IText || object.type === "text";
}

function walk(object: fabric.FabricObject, callback: (item: fabric.FabricObject, topLevel: boolean) => void, topLevel = true): void {
  callback(object, topLevel);
  if (object instanceof fabric.Group) object.getObjects().forEach((child) => walk(child, callback, false));
}

function addIssue(
  issues: DesignAuditIssue[],
  object: fabric.FabricObject,
  severity: AuditSeverity,
  category: DesignAuditIssue["category"],
  title: string,
  detail: string,
): void {
  const metadata = object as DDoneFabricObject;
  issues.push({
    id: `${category}-${metadata.ddoneId ?? object.type}-${issues.length}`,
    severity,
    category,
    title,
    detail,
    objectId: metadata.ddoneId,
  });
}

function templateFieldValue(object: fabric.FabricObject): string {
  const metadata = object as DDoneFabricObject;
  if (isTextObject(object)) return String((object as fabric.Textbox).text ?? "").trim();
  if (object instanceof fabric.FabricImage) {
    return String(metadata.ddoneMediaUrl ?? (object as any).getSrc?.() ?? "").trim();
  }
  return metadata.ddoneFieldDefault?.trim() ?? "";
}

export function auditDesign(
  canvas: fabric.Canvas,
  canvasWidth: number,
  canvasHeight: number,
  brandKit?: BrandKit | null,
): DesignAuditReport {
  const issues: DesignAuditIssue[] = [];
  const allowedColors = new Set((brandKit?.colors ?? []).map(normalizeDesignColor).filter(Boolean) as string[]);
  const allowedFonts = new Set((brandKit?.fonts ?? []).map((font) => font.trim().toLowerCase()).filter(Boolean));
  const neutralColors = new Set(["#000000", "#ffffff", "#18181b", "#27272a"]);
  const fieldObjects = new Map<string, fabric.FabricObject[]>();
  let checkedObjects = 0;

  for (const root of canvas.getObjects()) {
    walk(root, (object, topLevel) => {
      checkedObjects += 1;
      const metadata = object as DDoneFabricObject;

      if (topLevel && object.visible !== false && !metadata._isBgImage) {
        const bounds = object.getBoundingRect();
        const completelyOutside = bounds.left + bounds.width < 0
          || bounds.top + bounds.height < 0
          || bounds.left > canvasWidth
          || bounds.top > canvasHeight;
        const partiallyOutside = bounds.left < 0
          || bounds.top < 0
          || bounds.left + bounds.width > canvasWidth
          || bounds.top + bounds.height > canvasHeight;
        if (completelyOutside) addIssue(issues, object, "error", "layout", "Elemento fuori pagina", "L’elemento non è visibile nell’area esportata.");
        else if (partiallyOutside) addIssue(issues, object, "warning", "layout", "Elemento tagliato", "Una parte dell’elemento supera i bordi della pagina.");
      }

      if (isTextObject(object)) {
        const text = object as fabric.Textbox;
        const visualSize = Number(text.fontSize ?? 0) * Math.abs(text.scaleY ?? 1);
        if (visualSize > 0 && visualSize < 12) addIssue(issues, object, "warning", "accessibility", "Testo molto piccolo", `Dimensione visiva circa ${Math.round(visualSize)} px.`);
        const font = String(text.fontFamily ?? "").trim().toLowerCase();
        if (allowedFonts.size > 0 && font && !allowedFonts.has(font)) addIssue(issues, object, "warning", "typography", "Font fuori brand", `${text.fontFamily} non appartiene al brand kit attivo.`);
        if (!String(text.text ?? "").trim()) addIssue(issues, object, "info", "accessibility", "Testo vuoto", "Rimuovi il livello oppure inserisci il contenuto previsto.");
      }

      if (!(object instanceof fabric.FabricImage) && allowedColors.size > 0) {
        for (const value of [(object as any).fill, (object as any).stroke]) {
          const color = normalizeDesignColor(value);
          if (color && !allowedColors.has(color) && !neutralColors.has(color)) {
            addIssue(issues, object, "warning", "brand", "Colore fuori brand", `${color} non è presente nel brand kit attivo.`);
            break;
          }
        }
      }

      if (object instanceof fabric.FabricImage && !metadata.ddoneName?.trim()) {
        addIssue(issues, object, "info", "accessibility", "Immagine senza nome livello", "Assegna un nome descrittivo dal pannello Livelli.");
      }

      if (metadata.ddoneAttributionRequired) {
        if (!metadata.ddoneLicense || !metadata.ddoneSourceUrl) {
          addIssue(issues, object, "error", "license", "Attribuzione incompleta", "La risorsa richiede attribuzione ma fonte o licenza non sono disponibili.");
        } else if (!metadata.ddoneAttribution && !metadata.ddoneAuthor) {
          addIssue(issues, object, "warning", "license", "Autore non indicato", "Conserva autore o testo di attribuzione prima della pubblicazione.");
        }
      }

      if (metadata.ddoneFieldKey) {
        const objects = fieldObjects.get(metadata.ddoneFieldKey) ?? [];
        objects.push(object);
        fieldObjects.set(metadata.ddoneFieldKey, objects);
        if (!metadata.ddoneFieldType) {
          addIssue(issues, object, "error", "template", "Campo senza tipo", `Il campo ${metadata.ddoneFieldKey} non ha un tipo semantico.`);
        }
        if (metadata.ddoneFieldRequired && !templateFieldValue(object) && !metadata.ddoneFieldDefault?.trim()) {
          addIssue(issues, object, "error", "template", "Campo obbligatorio vuoto", `${metadata.ddoneFieldLabel || metadata.ddoneFieldKey} deve avere un valore o un default.`);
        }
        if (!metadata.ddoneFieldLabel?.trim()) {
          addIssue(issues, object, "info", "template", "Campo senza etichetta", `Aggiungi un’etichetta leggibile a ${metadata.ddoneFieldKey}.`);
        }
      }
    });
  }

  for (const [key, objects] of fieldObjects) {
    if (objects.length < 2) continue;
    for (const object of objects) {
      addIssue(issues, object, "error", "template", "Chiave campo duplicata", `${key} è assegnato a più oggetti.`);
    }
  }

  if (canvas.getObjects().length === 0) {
    issues.push({ id: "layout-empty", severity: "info", category: "layout", title: "Pagina vuota", detail: "Aggiungi contenuti prima dell’esportazione." });
  }

  const errors = issues.filter((item) => item.severity === "error").length;
  const warnings = issues.filter((item) => item.severity === "warning").length;
  const infos = issues.filter((item) => item.severity === "info").length;
  return { score: scoreAuditIssues(issues), issues, errors, warnings, infos, checkedObjects };
}
