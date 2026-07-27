import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Check, ImagePlus, Search, Upload, X } from "lucide-preact";
import * as fabric from "fabric";
import { api, getActiveClientId, scopedHeaders } from "../api";
import type { DDoneFabricObject } from "../canvas-model";
import { useEditor } from "../context";
import type { DesignElement, ElementCategory, ElementSearchResponse } from "../types";

export interface AssetSelection {
  url: string;
  name: string;
  element?: DesignElement;
}

interface PickerRequest {
  purpose?: "insert" | "replace-selected" | "callback";
  fieldType?: "image" | "logo";
  onSelect?: (selection: AssetSelection) => void | Promise<void>;
}

const QUICK_SEARCHES = ["ristorante", "persone", "business", "natura", "texture", "astratto", "cibo", "bevande"];
const CATEGORIES: Array<{ value: ElementCategory; label: string }> = [
  { value: "photos", label: "Foto" },
  { value: "graphics", label: "PNG e grafiche" },
  { value: "illustrations", label: "Illustrazioni" },
  { value: "backgrounds", label: "Sfondi" },
  { value: "mockups", label: "Mockup" },
];

function copyObjectMetadata(source: fabric.FabricObject, target: fabric.FabricObject): void {
  const sourceRecord = source as unknown as Record<string, unknown>;
  const targetRecord = target as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(sourceRecord)) {
    if (key.startsWith("ddone") || key.startsWith("template")) targetRecord[key] = value;
  }
}

async function replaceImage(canvas: fabric.Canvas, source: fabric.FabricObject, url: string): Promise<fabric.FabricImage> {
  const image = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
  const sourceWidth = Math.max(1, source.getScaledWidth());
  const sourceHeight = Math.max(1, source.getScaledHeight());
  image.set({
    left: source.left,
    top: source.top,
    originX: source.originX,
    originY: source.originY,
    angle: source.angle,
    opacity: source.opacity,
    flipX: source.flipX,
    flipY: source.flipY,
    scaleX: sourceWidth / Math.max(1, image.width || 1),
    scaleY: sourceHeight / Math.max(1, image.height || 1),
    clipPath: source.clipPath,
    shadow: source.shadow,
  });
  copyObjectMetadata(source, image);
  const index = canvas.getObjects().indexOf(source);
  canvas.remove(source);
  canvas.insertAt(Math.max(0, index), image);
  canvas.setActiveObject(image);
  image.setCoords();
  canvas.requestRenderAll();
  canvas.fire("object:modified", { target: image } as any);
  return image;
}

export function AssetPickerHost() {
  const { canvas, selectedObject, addImage } = useEditor();
  const [request, setRequest] = useState<PickerRequest | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ElementCategory>("photos");
  const [provider, setProvider] = useState("all");
  const [items, setItems] = useState<DesignElement[]>([]);
  const [providers, setProviders] = useState<Array<{ id: string; label: string; enabled: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = Boolean(request);
  const search = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category, page: "1", page_size: "48" });
      if (query.trim()) params.set("q", query.trim());
      if (provider !== "all") params.set("providers", provider);
      const result = await api<ElementSearchResponse>("GET", `/api/elements-universe/search?${params}`);
      setItems(result.items.filter((item) => item.kind === "image" || Boolean(item.previewUrl || item.assetUrl)));
      setProviders(result.providers);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Libreria non disponibile");
    } finally {
      setLoading(false);
    }
  }, [open, query, category, provider]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<PickerRequest>).detail ?? {};
      setRequest(detail);
      setQuery(detail.fieldType === "logo" ? "logo" : "");
      setCategory(detail.fieldType === "logo" ? "graphics" : "photos");
      setProvider("all");
      setSelectedId(null);
    };
    window.addEventListener("ddone:open-asset-picker", handler);
    return () => window.removeEventListener("ddone:open-asset-picker", handler);
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void search(), 250); return () => window.clearTimeout(timer); }, [search]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const assetUrl = (item: DesignElement) => item.assetUrl || item.previewUrl || "";

  const choose = async (selection: AssetSelection) => {
    if (!request) return;
    try {
      if (request.onSelect) await request.onSelect(selection);
      else if (request.purpose === "replace-selected" && canvas && selectedObject) await replaceImage(canvas, selectedObject, selection.url);
      else await addImage(selection.url);
      setRequest(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Immagine non inserita");
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const clientId = getActiveClientId();
      if (clientId) form.append("client_id", clientId);
      const response = await fetch("/api/uploads", { method: "POST", body: form, credentials: "include", headers: scopedHeaders() });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error ?? "Upload non riuscito");
      await choose({ url: data.url, name: file.name });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload non riuscito");
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;
  return (
    <div class="fixed inset-0 z-[160] grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="asset-picker-title">
      <div class="flex h-[min(820px,92vh)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header class="flex items-center justify-between border-b border-zinc-200 px-5 py-4"><div><h2 id="asset-picker-title" class="m-0 text-sm font-semibold text-zinc-900">Libreria immagini e PNG</h2><p class="mb-0 mt-1 text-[9px] text-zinc-500">Upload privati, foto, PNG, illustrazioni, mockup e sfondi open source.</p></div><button onClick={() => setRequest(null)} class="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-500 cursor-pointer"><X size={16} /></button></header>
        <div class="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-5 py-3">
          <label class="relative min-w-[260px] flex-1"><Search size={14} class="absolute left-3 top-2.5 text-zinc-400" /><input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Cerca foto, texture, prodotti, persone…" class="h-9 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-[10px] outline-none focus:border-violet-400 focus:bg-white" /></label>
          <button disabled={uploading} onClick={() => fileRef.current?.click()} class="flex h-9 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-[9px] font-semibold text-violet-700 cursor-pointer disabled:opacity-40"><Upload size={13} /> {uploading ? "Upload…" : "Carica"}</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden" onChange={(event) => void upload((event.target as HTMLInputElement).files?.[0])} />
        </div>
        <div class="flex gap-2 overflow-x-auto border-b border-zinc-100 px-5 py-2">{CATEGORIES.map((item) => <button key={item.value} onClick={() => setCategory(item.value)} class={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[8px] font-semibold cursor-pointer ${category === item.value ? "border-violet-600 bg-violet-600 text-white" : "border-zinc-200 bg-white text-zinc-500"}`}>{item.label}</button>)}</div>
        <div class="grid min-h-0 flex-1 md:grid-cols-[190px_1fr]">
          <aside class="overflow-y-auto border-r border-zinc-200 p-4"><strong class="text-[9px] text-zinc-700">Fonti</strong><button onClick={() => setProvider("all")} class={`mt-2 block w-full rounded-lg border-0 px-2 py-2 text-left text-[8px] cursor-pointer ${provider === "all" ? "bg-violet-50 text-violet-700" : "bg-transparent text-zinc-500"}`}>Tutte le fonti</button>{providers.map((item) => <button key={item.id} disabled={!item.enabled} onClick={() => setProvider(item.id)} class={`mt-1 block w-full rounded-lg border-0 px-2 py-2 text-left text-[8px] cursor-pointer disabled:opacity-40 ${provider === item.id ? "bg-violet-50 text-violet-700" : "bg-transparent text-zinc-500"}`}>{item.label}</button>)}<strong class="mt-5 block text-[9px] text-zinc-700">Ricerche rapide</strong><div class="mt-2 flex flex-wrap gap-1">{QUICK_SEARCHES.map((value) => <button key={value} onClick={() => setQuery(value)} class="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[7px] text-zinc-500 cursor-pointer">{value}</button>)}</div></aside>
          <main class="min-h-0 overflow-y-auto bg-zinc-50 p-4">
            {error && <p class="mb-3 rounded-xl border border-red-100 bg-red-50 p-3 text-[9px] text-red-600">{error}</p>}
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">{items.map((item) => { const url = assetUrl(item); const isSelected = selectedId === item.id; return <button key={item.id} disabled={!url} onDoubleClick={() => url && void choose({ url, name: item.name, element: item })} onClick={() => setSelectedId(item.id)} class={`group overflow-hidden rounded-xl border bg-white text-left cursor-pointer ${isSelected ? "border-violet-500 ring-2 ring-violet-100" : "border-zinc-200 hover:border-zinc-300"}`}><div class="relative aspect-square overflow-hidden bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:16px_16px]">{url ? <img src={item.previewUrl || url} loading="lazy" alt={item.name} class="h-full w-full object-contain" /> : <ImagePlus size={24} class="m-auto mt-12 text-zinc-300" />}{isSelected && <span class="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-violet-600 text-white"><Check size={13} /></span>}</div><div class="p-2"><strong class="block truncate text-[8px] text-zinc-700">{item.name}</strong><span class="mt-0.5 block truncate text-[7px] text-zinc-400">{item.providerLabel} · {item.format?.toUpperCase()}</span></div></button>; })}</div>
            {!loading && items.length === 0 && <p class="mt-20 text-center text-[10px] text-zinc-400">Nessun risultato. Prova una ricerca diversa o carica un file.</p>}
            {loading && <p class="mt-6 text-center text-[9px] text-zinc-400">Ricerca nelle librerie…</p>}
          </main>
        </div>
        <footer class="flex items-center justify-between border-t border-zinc-200 px-5 py-3"><span class="text-[8px] text-zinc-400">Licenza e attribuzione restano memorizzate quando disponibili.</span><button disabled={!selected || !assetUrl(selected)} onClick={() => selected && void choose({ url: assetUrl(selected), name: selected.name, element: selected })} class="flex h-9 items-center gap-2 rounded-xl border-0 bg-violet-600 px-5 text-[9px] font-semibold text-white cursor-pointer disabled:opacity-40"><ImagePlus size={13} /> Usa immagine</button></footer>
      </div>
    </div>
  );
}