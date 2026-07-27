import * as fabric from "fabric";
import type { DDoneFabricObject } from "../canvas-model";

export interface AttributionEntry {
  id: string;
  name: string;
  provider: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  attribution: string;
  required: boolean;
}

function walk(objects: fabric.FabricObject[], callback: (object: fabric.FabricObject) => void): void {
  for (const object of objects) {
    callback(object);
    if (object instanceof fabric.Group) walk(object.getObjects(), callback);
  }
}

export function collectAttributions(canvas: fabric.Canvas): AttributionEntry[] {
  const entries = new Map<string, AttributionEntry>();
  walk(canvas.getObjects(), (object) => {
    const metadata = object as DDoneFabricObject;
    if (!metadata.ddoneProvider && !metadata.ddoneSourceUrl && !metadata.ddoneLicense) return;
    const id = metadata.ddoneSourceId || metadata.ddoneSourceUrl || metadata.ddoneId || `${metadata.ddoneProvider}-${entries.size}`;
    entries.set(id, {
      id,
      name: metadata.ddoneName || metadata.ddoneSourceId || object.type || "Risorsa",
      provider: metadata.ddoneProvider || "Sorgente non indicata",
      author: metadata.ddoneAuthor || "Non indicato",
      license: metadata.ddoneLicense || "Non indicata",
      licenseUrl: metadata.ddoneLicenseUrl || "",
      sourceUrl: metadata.ddoneSourceUrl || "",
      attribution: metadata.ddoneAttribution || "",
      required: Boolean(metadata.ddoneAttributionRequired),
    });
  });
  return [...entries.values()].sort((first, second) => Number(second.required) - Number(first.required) || first.name.localeCompare(second.name));
}

function escapeCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function attributionReportCsv(entries: AttributionEntry[]): string {
  const header = ["name", "provider", "author", "license", "license_url", "source_url", "attribution", "required"];
  const rows = entries.map((entry) => [
    entry.name,
    entry.provider,
    entry.author,
    entry.license,
    entry.licenseUrl,
    entry.sourceUrl,
    entry.attribution,
    entry.required ? "yes" : "no",
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export function attributionReportMarkdown(entries: AttributionEntry[], designName: string): string {
  const lines = [
    `# Attributions — ${designName}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
  ];
  if (entries.length === 0) {
    lines.push("No third-party attribution metadata was found in this design.");
    return lines.join("\n");
  }
  entries.forEach((entry, index) => {
    lines.push(`## ${index + 1}. ${entry.name}`);
    lines.push("");
    lines.push(`- Provider: ${entry.provider}`);
    lines.push(`- Author: ${entry.author}`);
    lines.push(`- License: ${entry.license}`);
    if (entry.licenseUrl) lines.push(`- License URL: ${entry.licenseUrl}`);
    if (entry.sourceUrl) lines.push(`- Source: ${entry.sourceUrl}`);
    lines.push(`- Attribution required: ${entry.required ? "Yes" : "No"}`);
    if (entry.attribution) lines.push(`- Attribution text: ${entry.attribution}`);
    lines.push("");
  });
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
