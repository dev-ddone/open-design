import * as XLSX from "xlsx";
import { normalizeTemplateFieldKey, parseCsv } from "../canvas/template-fields";

export type SpreadsheetRecord = Record<string, string>;
export interface SpreadsheetSheet { name: string; headers: string[]; records: SpreadsheetRecord[]; }
export interface SpreadsheetWorkbook { fileName: string; sheets: SpreadsheetSheet[]; }
export interface FieldTarget { key: string; label: string; type?: string; }

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function uniqueHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header, index) => {
    const base = normalizeTemplateFieldKey(header) || `colonna_${index + 1}`;
    const next = (counts.get(base) ?? 0) + 1;
    counts.set(base, next);
    return next === 1 ? base : `${base}_${next}`;
  });
}

export function sheetFromRows(name: string, rows: unknown[][]): SpreadsheetSheet {
  if (rows.length === 0) return { name, headers: [], records: [] };
  const rawHeaders = (rows[0] ?? []).map((value, index) => stringValue(value).trim() || `Colonna ${index + 1}`);
  const headers = uniqueHeaders(rawHeaders);
  const records = rows.slice(1)
    .filter((row) => row.some((value) => stringValue(value).trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, stringValue(row[index])]))) as SpreadsheetRecord[];
  return { name, headers, records };
}

export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetWorkbook> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv" || file.type.includes("csv")) {
    const parsed = parseCsv(await file.text());
    return { fileName: file.name, sheets: [{ name: "CSV", headers: parsed.headers, records: parsed.records }] };
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheets = workbook.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: false, blankrows: false });
    return sheetFromRows(name, rows);
  }).filter((sheet) => sheet.headers.length > 0);
  if (sheets.length === 0) throw new Error("Il file non contiene fogli con dati leggibili.");
  return { fileName: file.name, sheets };
}

function tokens(value: string): string[] {
  return normalizeTemplateFieldKey(value).split("_").filter(Boolean);
}

export function scoreColumnMatch(source: string, target: FieldTarget): number {
  const sourceKey = normalizeTemplateFieldKey(source);
  const targetKey = normalizeTemplateFieldKey(target.key);
  const targetLabel = normalizeTemplateFieldKey(target.label);
  if (!sourceKey || !targetKey) return 0;
  if (sourceKey === targetKey) return 100;
  if (sourceKey === targetLabel) return 96;
  if (sourceKey.includes(targetKey) || targetKey.includes(sourceKey)) return 78;
  const sourceTokens = new Set(tokens(sourceKey));
  const targetTokens = new Set([...tokens(targetKey), ...tokens(targetLabel)]);
  const overlap = [...sourceTokens].filter((token) => targetTokens.has(token)).length;
  return overlap === 0 ? 0 : Math.round((overlap / Math.max(sourceTokens.size, targetTokens.size)) * 70);
}

export function suggestColumnMapping(headers: string[], targets: FieldTarget[]): Record<string, string> {
  const used = new Set<string>();
  const mapping: Record<string, string> = {};
  for (const target of targets) {
    const best = headers.filter((header) => !used.has(header))
      .map((header) => ({ header, score: scoreColumnMatch(header, target) }))
      .sort((left, right) => right.score - left.score)[0];
    if (best && best.score >= 35) { mapping[target.key] = best.header; used.add(best.header); }
  }
  return mapping;
}

export function applyColumnMapping(records: SpreadsheetRecord[], mapping: Record<string, string>): SpreadsheetRecord[] {
  return records.map((record) => Object.fromEntries(Object.entries(mapping)
    .filter(([, source]) => Boolean(source))
    .map(([target, source]) => [target, record[source] ?? ""])));
}

export function mappedRecordCompleteness(record: SpreadsheetRecord, requiredKeys: string[]) {
  const missing = requiredKeys.filter((key) => !String(record[key] ?? "").trim());
  return { complete: missing.length === 0, missing };
}