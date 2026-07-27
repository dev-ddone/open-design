import * as fabric from "fabric";
import JSZip from "jszip";
import type { DesignWithPages, Page } from "../types";

export type BatchImageFormat = "png" | "jpg" | "svg" | "json";

export interface BatchExportProject extends Pick<DesignWithPages, "id" | "name" | "width" | "height"> {
  pages: Page[];
}

export interface BatchExportProgress {
  completed: number;
  total: number;
  percent: number;
  current: string;
}

export interface BatchExportOptions {
  projects: BatchExportProject[];
  formats: BatchImageFormat[];
  scale: number;
  onProgress?: (progress: BatchExportProgress) => void;
}

export function safeExportName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "design";
}

function dataUrlBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(",", 2);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "application/octet-stream";
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

async function renderPage(page: Page, width: number, height: number, format: BatchImageFormat, scale: number): Promise<Blob> {
  if (format === "json") return new Blob([page.canvas_json], { type: "application/json;charset=utf-8" });
  const element = document.createElement("canvas");
  const canvas = new fabric.StaticCanvas(element, { width, height, renderOnAddRemove: false });
  try {
    await canvas.loadFromJSON(JSON.parse(page.canvas_json || "{}"));
    canvas.renderAll();
    if (format === "svg") return new Blob([canvas.toSVG()], { type: "image/svg+xml;charset=utf-8" });
    const dataUrl = canvas.toDataURL({
      format: format === "jpg" ? "jpeg" : "png",
      multiplier: Math.max(0.25, Math.min(4, scale)),
      quality: format === "jpg" ? 0.94 : 1,
    });
    return dataUrlBlob(dataUrl);
  } finally {
    canvas.dispose();
  }
}

export async function buildBatchExportZip(options: BatchExportOptions): Promise<Blob> {
  const formats = [...new Set(options.formats)];
  if (options.projects.length === 0) throw new Error("Nessun progetto selezionato.");
  if (formats.length === 0) throw new Error("Seleziona almeno un formato.");
  const tasks = options.projects.flatMap((project) => project.pages.flatMap((page) => formats.map((format) => ({ project, page, format }))));
  if (tasks.length > 2_000) throw new Error("L’operazione supera il limite di 2.000 file.");

  const zip = new JSZip();
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scale: options.scale,
    formats,
    projects: options.projects.map((project) => ({
      id: project.id,
      name: project.name,
      width: project.width,
      height: project.height,
      pages: project.pages.map((page) => ({ id: page.id, title: page.title, sortOrder: page.sort_order })),
    })),
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  for (let index = 0; index < tasks.length; index += 1) {
    const { project, page, format } = tasks[index];
    const projectName = safeExportName(project.name);
    const pageNumber = String(project.pages.findIndex((item) => item.id === page.id) + 1).padStart(3, "0");
    const pageName = safeExportName(page.title || `pagina-${pageNumber}`);
    const filename = `${projectName}/${pageNumber}-${pageName}.${format}`;
    options.onProgress?.({
      completed: index,
      total: tasks.length,
      percent: Math.round((index / Math.max(1, tasks.length)) * 100),
      current: filename,
    });
    zip.file(filename, await renderPage(page, project.width, project.height, format, options.scale));
  }

  options.onProgress?.({ completed: tasks.length, total: tasks.length, percent: 100, current: "Compressione ZIP" });
  return zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 }, streamFiles: true },
    (metadata) => options.onProgress?.({
      completed: tasks.length,
      total: tasks.length,
      percent: Math.max(0, Math.min(100, Math.round(metadata.percent))),
      current: metadata.currentFile || "Compressione ZIP",
    }),
  );
}

export function downloadBatchZip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeExportName(filename)}.zip`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}