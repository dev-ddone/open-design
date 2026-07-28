import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { ExternalLink, Globe2, Heart, Image as ImageIcon, LoaderCircle, Search, Sparkles, X } from "lucide-preact";
import * as fabric from "fabric";
import { getActiveClientId, scopedHeaders } from "../api";
import { ensureObjectId, markSvgObject, type DDoneFabricObject } from "../canvas-model";
import { extractVectorPalette } from "../canvas/media-effects";
import { placeObjectWithoutOverlap } from "../canvas/smart-placement";
import { useEditor } from "../context";
import type { DesignElement, ElementCategory, ElementProvider, ElementSearchResponse } from "../types";

const CURATED_SEARCHES: Array<{ label: string; query: string; category: ElementCategory; description: string }> = [
  { label: "Pizze", query: "pizza italiana food isolated restaurant", category: "food", description: "Foto, illustrazioni e PNG per menu" },
  { label: "Cornici ornamentali", query: "ornamental decorative frame border corner vintage floral", category: "frames", description: "Bordi, angoli e cornici decorate" },
  { label: "Ornamenti floreali", query: "floral botanical ornament divider corner vector", category: "ornaments", description: "Divisori, foglie e decori" },
  { label: "Menu ristorante", query: "restaurant menu decorative food graphic", category: "graphics", description: "Elementi per menu e volantini" },
  { label: "Texture carta", query: "paper texture vintage parchment background", category: "backgrounds", description: "Carta, pergamena e superfici" },
  { label: "Mockup packaging", query: "food packaging box cup mockup", category: "mockups", description: "Confezioni e presentazioni prodotto" },
  { label: "Badge vintage", query: "vintage badge label ribbon ornamental vector", category: "ornaments", description: "Etichette, sigilli e nastri" },
  { label: "Cocktail", query: "cocktail drink glass bar isolated", category: "cocktails", description: "Drink, bicchieri e decorazioni bar" },
];

const CATEGORY_OPTIONS: Array<{ value: ElementCategory; label: string }> = [
  { value: "all", label: "Tutto" },
  { value: "photos", label: "Foto" },
  { value: "food", label: "Cibo" },
  { value: "ornaments", label: "Ornamenti" },
  { value: "frames", label: "Cornici" },
  { value: "illustrations", label: "Illustrazioni" },
  { value: "graphics", label: "Grafiche" },
  { value: "backgrounds", label: "Sfondi" },
  { value: "mockups", label: "Mockup" },
];

const FAVORITES_KEY = "ddone_web_asset_favorites_v1";

function readFavorites(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch { return []; }
}

function safeFilename(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "web-asset";
}

function extensionForMime(mime: string): string {
  if (mime.includes("svg")) return "svg";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

async function fetchProtected(path: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(path, { credentials: "include", headers: scopedHeaders(), signal });
  if (!response.ok) {
    let message = `Risorsa non disponibile (${response.status})`;
    try { message = String((await response.json())?.error ?? message); } catch { /* keep generic */ }
    throw new Error(message);
  }
  return response;
}

async function persistRemoteAsset(element: DesignElement): Promise<string> {
  if (!element.assetUrl) throw new Error("L’asset non dispone di un file importabile");
  if (element.provider === "uploads" && element.assetUrl.startsWith("/api/assets/")) return element.assetUrl;
  const source = await fetchProtected(element.assetUrl);
  const blob = await source.blob();
  if (!blob.type.startsWith("image/")) throw new Error("La sorgente non ha restituito un’immagine");
  if (blob.size > 25 * 1024 * 1024) throw new Error("Il file supera il limite di 25 MB");
  const file = new File([blob], `${safeFilename(element.name)}.${extensionForMime(blob.type)}`, { type: blob.type.split(";", 1)[0] });
  const form = new FormData();
  form.append("file", file);
  const clientId = getActiveClientId();
  if (clientId) form.append("client_id", clientId);
  form.append("display_name", element.name);
  form.append("category", element.category);
  form.append("tags", JSON.stringify(element.tags ?? []));
  form.append("license", element.license ?? "");
  form.append("author", element.author ?? "");
  form.append("source_url", element.sourceUrl ?? "");
  form.append("attribution_required", String(element.attributionRequired));
  const response = await fetch("/api/uploads", { method: "POST", credentials: "include", headers: scopedHeaders(), body: form });
  const result = await response.json() as { url?: string; error?: string };
  if (!response.ok || !result.url) throw new Error(result.error ?? "Importazione nella libreria privata non riuscita");
  return result.url;
}

function attachMetadata(object: fabric.FabricObject, element: DesignElement, stableUrl?: string): void {
  const metadata = object as DDoneFabricObject;
  ensureObjectId(object);
  metadata.ddoneSourceId = element.id;
  metadata.ddoneProvider = element.providerLabel || element.provider;
  metadata.ddoneSourceUrl = element.sourceUrl;
  metadata.ddoneLicense = element.license;
  metadata.ddoneLicenseUrl = element.licenseUrl;
  metadata.ddoneAuthor = element.author;
  metadata.ddoneAttribution = element.attribution;
  metadata.ddoneAttributionRequired = element.attributionRequired;
  metadata.ddoneMediaKind = element.kind;
  metadata.ddoneFormat = element.format;
  metadata.ddoneTransparent = element.transparent;
  metadata.ddoneMediaUrl = stableUrl ?? element.assetUrl;
}

function Preview({ element }: { element: DesignElement }) {
  const [url, setUrl] = useState<string | null>(element.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.svg)}` : null);
  useEffect(() => {
    if (element.svg) {
      setUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.svg)}`);
      return;
    }
    if (!element.previewUrl) { setUrl(null); return; }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetchProtected(element.previewUrl, controller.signal).then((response) => response.blob()).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setUrl(null); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [element.id, element.previewUrl, element.svg]);
  return <div class="relative h-full w-full overflow-hidden rounded-xl bg-zinc-100">{url ? <img src={url} alt={element.name} loading="lazy" class="h-full w-full object-contain" /> : <div class="grid h-full place-items-center text-zinc-400"><ImageIcon size={25} /></div>}<span class="absolute bottom-1.5 left-1.5 rounded-md bg-zinc-950/75 px-1.5 py-0.5 text-[7px] font-bold text-white">{(element.format ?? element.kind).toUpperCase()}</span></div>;
}

export function WebAssetsHost() {
  const { canvas, canvasWidth, canvasHeight } = useEditor();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("pizza italiana food isolated restaurant");
  const [category, setCategory] = useState<ElementCategory>("food");
  const [provider, setProvider] = useState("all");
  const [items, setItems] = useState<DesignElement[]>([]);
  const [providers, setProviders] = useState<ElementProvider[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const visible = useMemo(() => onlyFavorites ? items.filter((item) => favorites.includes(item.id)) : items, [items, onlyFavorites, favorites]);
  const onlineProviders = useMemo(() => providers.filter((item) => item.enabled && !["builtin", "uploads", "local-tabler", "local-twemoji", "local-structures", "studio-raster", "studio-raster-extra"].includes(item.id)), [providers]);

  const search = useCallback(async (page = 1, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category, q: query.trim(), page: String(page), page_size: "40", formats: "all" });
      if (provider !== "all") params.set("providers", provider);
      const response = await fetch(`/api/elements-universe/search?${params}`, { credentials: "include", headers: scopedHeaders() });
      const data = await response.json() as ElementSearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Ricerca web non disponibile");
      setProviders(data.providers);
      setWarnings(data.warnings ?? []);
      setNextPage(data.nextPage);
      setItems((current) => {
        const combined = append ? [...current, ...data.items] : data.items;
        return [...new Map(combined.map((item) => [item.id, item])).values()];
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ricerca web non riuscita"); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [query, category, provider]);

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ query?: string; category?: ElementCategory }>).detail;
      if (detail?.query) setQuery(detail.query);
      if (detail?.category) setCategory(detail.category);
      setOpen(true);
    };
    window.addEventListener("ddone:open-web-assets", show);
    return () => window.removeEventListener("ddone:open-web-assets", show);
  }, []);

  useEffect(() => { if (open && items.length === 0) void search(); }, [open]);

  const runCurated = (entry: typeof CURATED_SEARCHES[number]) => {
    setQuery(entry.query);
    setCategory(entry.category);
    setProvider("all");
    setOnlyFavorites(false);
    window.setTimeout(() => {
      const params = new URLSearchParams({ category: entry.category, q: entry.query, page: "1", page_size: "40", formats: "all" });
      void fetch(`/api/elements-universe/search?${params}`, { credentials: "include", headers: scopedHeaders() }).then(async (response) => {
        const data = await response.json() as ElementSearchResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Ricerca non disponibile");
        setItems(data.items); setProviders(data.providers); setWarnings(data.warnings ?? []); setNextPage(data.nextPage); setError(null);
      }).catch((caught) => setError(caught instanceof Error ? caught.message : "Ricerca non riuscita"));
    }, 0);
  };

  const toggleFavorite = (id: string) => setFavorites((current) => {
    const updated = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated.slice(0, 200)));
    return updated;
  });

  const insert = async (element: DesignElement) => {
    if (!canvas) return;
    setImporting(element.id);
    setError(null);
    try {
      if (element.kind === "vector") {
        const source = element.svg ?? (element.assetUrl ? await (await fetchProtected(element.assetUrl)).text() : null);
        if (!source) throw new Error("SVG non disponibile");
        const loaded = await fabric.loadSVGFromString(source);
        const objects = loaded.objects.filter(Boolean) as fabric.FabricObject[];
        if (objects.length === 0) throw new Error("SVG vuoto");
        const object = fabric.util.groupSVGElements(objects, loaded.options);
        const scale = Math.min((canvasWidth * 0.42) / (object.width || 1), (canvasHeight * 0.42) / (object.height || 1), 3);
        object.set({ scaleX: scale, scaleY: scale });
        attachMetadata(object, element);
        markSvgObject(object);
        extractVectorPalette(object);
        placeObjectWithoutOverlap(canvas, object, canvasWidth, canvasHeight);
        canvas.add(object);
        canvas.setActiveObject(object);
      } else {
        const stableUrl = await persistRemoteAsset(element);
        const image = await fabric.FabricImage.fromURL(stableUrl, { crossOrigin: "anonymous" });
        const scale = Math.min((canvasWidth * 0.62) / (image.width || 1), (canvasHeight * 0.62) / (image.height || 1), 1);
        image.set({ scaleX: scale, scaleY: scale });
        attachMetadata(image, element, stableUrl);
        placeObjectWithoutOverlap(canvas, image, canvasWidth, canvasHeight);
        canvas.add(image);
        canvas.setActiveObject(image);
      }
      canvas.requestRenderAll();
      canvas.fire("object:modified", { target: canvas.getActiveObject() } as never);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Impossibile inserire l’asset"); }
    finally { setImporting(null); }
  };

  return (
    <div class="relative">
      <button type="button" onClick={() => setOpen(true)} title="Cerca contenuti sul web" class="flex h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 text-[8px] font-semibold text-sky-700 shadow-sm cursor-pointer hover:bg-sky-100"><Globe2 size={13} /> Web</button>
      {open && <div class="fixed inset-0 z-[185] flex items-stretch justify-end bg-zinc-950/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-label="Libreria web" class="flex h-full w-full max-w-[760px] flex-col border-l border-white/60 bg-white shadow-2xl">
          <header class="flex items-center justify-between border-b border-zinc-200 px-5 py-4"><div><div class="flex items-center gap-2"><Globe2 size={18} class="text-sky-600" /><h2 class="m-0 text-base font-semibold text-zinc-900">Libreria web</h2></div><p class="mt-1 text-[10px] text-zinc-500">Cerca immagini e grafiche con licenza tracciata, poi importale nella libreria privata del cliente.</p></div><button onClick={() => setOpen(false)} class="grid h-9 w-9 place-items-center rounded-xl border-0 bg-zinc-100 text-zinc-500 cursor-pointer"><X size={16} /></button></header>
          <div class="border-b border-zinc-200 bg-zinc-50/70 px-5 py-4">
            <form onSubmit={(event) => { event.preventDefault(); void search(1, false); }} class="flex gap-2"><div class="relative flex-1"><Search size={16} class="absolute left-3 top-3 text-zinc-400" /><input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Pizza, cornice barocca, ornamento floreale…" class="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" /></div><button disabled={loading || !query.trim()} class="h-10 rounded-xl border-0 bg-sky-600 px-5 text-xs font-semibold text-white cursor-pointer disabled:opacity-40">{loading ? "Ricerca…" : "Cerca"}</button></form>
            <div class="mt-3 flex flex-wrap gap-1.5">{CATEGORY_OPTIONS.map((option) => <button key={option.value} onClick={() => setCategory(option.value)} class={`rounded-full border px-2.5 py-1 text-[8px] font-semibold cursor-pointer ${category === option.value ? "border-sky-400 bg-sky-50 text-sky-700" : "border-zinc-200 bg-white text-zinc-500"}`}>{option.label}</button>)}</div>
            <div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">{CURATED_SEARCHES.map((entry) => <button key={entry.label} onClick={() => runCurated(entry)} class="rounded-xl border border-zinc-200 bg-white p-2 text-left cursor-pointer hover:border-sky-300 hover:bg-sky-50"><strong class="block text-[9px] text-zinc-700">{entry.label}</strong><span class="mt-0.5 block text-[7px] leading-relaxed text-zinc-400">{entry.description}</span></button>)}</div>
          </div>
          <div class="flex items-center gap-2 overflow-x-auto border-b border-zinc-200 px-5 py-2"><button onClick={() => setProvider("all")} class={`shrink-0 rounded-lg px-2.5 py-1 text-[8px] font-semibold ${provider === "all" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"}`}>Tutte le fonti</button>{onlineProviders.map((item) => <button key={item.id} onClick={() => setProvider(item.id)} title={item.description} class={`shrink-0 rounded-lg px-2.5 py-1 text-[8px] font-semibold ${provider === item.id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"}`}>{item.label}</button>)}<button onClick={() => setOnlyFavorites((value) => !value)} class={`ml-auto shrink-0 rounded-lg px-2.5 py-1 text-[8px] font-semibold ${onlyFavorites ? "bg-rose-50 text-rose-600" : "bg-zinc-100 text-zinc-500"}`}><Heart size={10} class="mr-1 inline" />Preferiti</button></div>
          <div class="flex-1 overflow-y-auto p-5">
            {error && <div class="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[9px] text-red-700">{error}</div>}
            {warnings.length > 0 && <div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[8px] leading-relaxed text-amber-700">Alcune fonti non hanno risposto: {warnings.join(" · ")}</div>}
            {loading ? <div class="grid h-48 place-items-center text-zinc-400"><LoaderCircle size={25} class="animate-spin" /></div> : visible.length > 0 ? <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{visible.map((element) => <article key={element.id} class="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm hover:border-sky-300 hover:shadow-md"><button disabled={importing === element.id} onClick={() => void insert(element)} class="aspect-square w-full border-0 bg-zinc-50 p-2 cursor-pointer disabled:opacity-50">{importing === element.id ? <LoaderCircle size={22} class="mx-auto animate-spin text-sky-600" /> : <Preview element={element} />}</button><div class="p-2.5"><div class="flex items-start gap-2"><div class="min-w-0 flex-1"><strong class="block truncate text-[9px] text-zinc-700">{element.name}</strong><span class="mt-0.5 block truncate text-[7px] text-zinc-400">{element.providerLabel}</span></div><button onClick={() => toggleFavorite(element.id)} class="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-400 cursor-pointer"><Heart size={11} fill={favorites.includes(element.id) ? "currentColor" : "none"} class={favorites.includes(element.id) ? "text-rose-500" : ""} /></button></div><div class="mt-2 flex items-center justify-between gap-1"><span class="truncate text-[7px] text-zinc-400">{element.license}</span>{element.sourceUrl && <a href={element.sourceUrl} target="_blank" rel="noreferrer" title="Apri la fonte" class="text-zinc-400 hover:text-sky-600"><ExternalLink size={11} /></a>}</div></div></article>)}</div> : <div class="grid h-56 place-items-center rounded-2xl border border-dashed border-zinc-200 text-center"><div><Sparkles size={25} class="mx-auto text-zinc-300" /><strong class="mt-2 block text-xs text-zinc-500">Nessun risultato utile</strong><span class="mt-1 block text-[9px] text-zinc-400">Prova una ricerca più descrittiva o cambia categoria.</span></div></div>}
            {nextPage && !onlyFavorites && <button disabled={loadingMore} onClick={() => void search(nextPage, true)} class="mt-5 h-10 w-full rounded-xl border border-zinc-200 bg-white text-[10px] font-semibold text-zinc-600 cursor-pointer hover:border-sky-300 disabled:opacity-40">{loadingMore ? "Caricamento…" : "Carica altri contenuti"}</button>}
          </div>
        </section>
      </div>}
    </div>
  );
}
