import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { ExternalLink, Globe2, Heart, Image as ImageIcon, LoaderCircle, Search, Sparkles, X } from "lucide-preact";
import * as fabric from "fabric";
import { getActiveClientId, scopedHeaders } from "../api";
import { ensureObjectId, markSvgObject, type DDoneFabricObject } from "../canvas-model";
import { extractVectorPalette } from "../canvas/media-effects";
import { placeObjectWithoutOverlap } from "../canvas/smart-placement";
import { useEditor } from "../context";
import type { DesignElement, ElementCategory, ElementProvider, ElementSearchResponse } from "../types";
import { config } from "../../server/config";
import translations from "../translations";

const lang = config.lang;

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
  { value: "all", label: translations[lang].all },
  { value: "photos", label: translations[lang].photos },
  { value: "food", label: translations[lang].food },
  { value: "ornaments", label: translations[lang].ornaments },
  { value: "frames", label: translations[lang].frames },
  { value: "illustrations", label: translations[lang].illustrations },
  { value: "graphics", label: translations[lang].graphics },
  { value: "backgrounds", label: translations[lang].label },
  { value: "mockups", label: translations[lang].mockups },
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
  return <div class="relative bg-zinc-100 rounded-xl w-full h-full overflow-hidden">{url ? <img src={url} alt={element.name} loading="lazy" class="w-full h-full object-contain" /> : <div class="place-items-center grid h-full text-zinc-400"><ImageIcon size={25} /></div>}<span class="bottom-1.5 left-1.5 absolute bg-zinc-950/75 px-1.5 py-0.5 rounded-md font-bold text-[7px] text-white">{(element.format ?? element.kind).toUpperCase()}</span></div>;
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
      <button type="button" onClick={() => setOpen(true)} title="Cerca contenuti sul web" class="flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 shadow-sm px-2 border border-sky-200 rounded-lg h-8 font-semibold text-[8px] text-sky-700 cursor-pointer"><Globe2 size={13} /> Web</button>
      {open && <div class="z-185 fixed inset-0 flex justify-end items-stretch bg-zinc-950/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-label="Libreria web" class="flex flex-col bg-white shadow-2xl border-white/60 border-l w-full max-w-190 h-full">
          <header class="flex justify-between items-center px-5 py-4 border-zinc-200 border-b"><div><div class="flex items-center gap-2"><Globe2 size={18} class="text-sky-600" /><h2 class="m-0 font-semibold text-zinc-900 text-base">Libreria web</h2></div><p class="mt-1 text-[10px] text-zinc-500">Cerca immagini e grafiche con licenza tracciata, poi importale nella libreria privata del cliente.</p></div><button onClick={() => setOpen(false)} class="place-items-center grid bg-zinc-100 border-0 rounded-xl w-9 h-9 text-zinc-500 cursor-pointer"><X size={16} /></button></header>
          <div class="bg-zinc-50/70 px-5 py-4 border-zinc-200 border-b">
            <form onSubmit={(event) => { event.preventDefault(); void search(1, false); }} class="flex gap-2"><div class="relative flex-1"><Search size={16} class="top-3 left-3 absolute text-zinc-400" /><input value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Pizza, cornice barocca, ornamento floreale…" class="bg-white pr-3 pl-9 border border-zinc-200 focus:border-sky-400 rounded-xl outline-none focus:ring-2 focus:ring-sky-100 w-full h-10 text-xs" /></div><button disabled={loading || !query.trim()} class="bg-sky-600 disabled:opacity-40 px-5 border-0 rounded-xl h-10 font-semibold text-white text-xs cursor-pointer">{loading ? "Ricerca…" : "Cerca"}</button></form>
            <div class="flex flex-wrap gap-1.5 mt-3">{CATEGORY_OPTIONS.map((option) => <button key={option.value} onClick={() => setCategory(option.value)} class={`rounded-full border px-2.5 py-1 text-[8px] font-semibold cursor-pointer ${category === option.value ? "border-sky-400 bg-sky-50 text-sky-700" : "border-zinc-200 bg-white text-zinc-500"}`}>{option.label}</button>)}</div>
            <div class="gap-2 grid grid-cols-2 md:grid-cols-4 mt-3">{CURATED_SEARCHES.map((entry) => <button key={entry.label} onClick={() => runCurated(entry)} class="bg-white hover:bg-sky-50 p-2 border border-zinc-200 hover:border-sky-300 rounded-xl text-left cursor-pointer"><strong class="block text-[9px] text-zinc-700">{entry.label}</strong><span class="block mt-0.5 text-[7px] text-zinc-400 leading-relaxed">{entry.description}</span></button>)}</div>
          </div>
          <div class="flex items-center gap-2 px-5 py-2 border-zinc-200 border-b overflow-x-auto"><button onClick={() => setProvider("all")} class={`shrink-0 rounded-lg px-2.5 py-1 text-[8px] font-semibold ${provider === "all" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"}`}>Tutte le fonti</button>{onlineProviders.map((item) => <button key={item.id} onClick={() => setProvider(item.id)} title={item.description} class={`shrink-0 rounded-lg px-2.5 py-1 text-[8px] font-semibold ${provider === item.id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-500"}`}>{item.label}</button>)}<button onClick={() => setOnlyFavorites((value) => !value)} class={`ml-auto shrink-0 rounded-lg px-2.5 py-1 text-[8px] font-semibold ${onlyFavorites ? "bg-rose-50 text-rose-600" : "bg-zinc-100 text-zinc-500"}`}><Heart size={10} class="inline mr-1" />Preferiti</button></div>
          <div class="flex-1 p-5 overflow-y-auto">
            {error && <div class="bg-red-50 mb-4 p-3 border border-red-200 rounded-xl text-[9px] text-red-700">{error}</div>}
            {warnings.length > 0 && <div class="bg-amber-50 mb-4 p-3 border border-amber-200 rounded-xl text-[8px] text-amber-700 leading-relaxed">Alcune fonti non hanno risposto: {warnings.join(" · ")}</div>}
            {loading ? <div class="place-items-center grid h-48 text-zinc-400"><LoaderCircle size={25} class="animate-spin" /></div> : visible.length > 0 ? <div class="gap-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">{visible.map((element) => <article key={element.id} class="group bg-white shadow-sm hover:shadow-md border border-zinc-200 hover:border-sky-300 rounded-2xl overflow-hidden"><button disabled={importing === element.id} onClick={() => void insert(element)} class="bg-zinc-50 disabled:opacity-50 p-2 border-0 w-full aspect-square cursor-pointer">{importing === element.id ? <LoaderCircle size={22} class="mx-auto text-sky-600 animate-spin" /> : <Preview element={element} />}</button><div class="p-2.5"><div class="flex items-start gap-2"><div class="flex-1 min-w-0"><strong class="block text-[9px] text-zinc-700 truncate">{element.name}</strong><span class="block mt-0.5 text-[7px] text-zinc-400 truncate">{element.providerLabel}</span></div><button onClick={() => toggleFavorite(element.id)} class="place-items-center grid bg-white border border-zinc-200 rounded-full w-7 h-7 text-zinc-400 cursor-pointer shrink-0"><Heart size={11} fill={favorites.includes(element.id) ? "currentColor" : "none"} class={favorites.includes(element.id) ? "text-rose-500" : ""} /></button></div><div class="flex justify-between items-center gap-1 mt-2"><span class="text-[7px] text-zinc-400 truncate">{element.license}</span>{element.sourceUrl && <a href={element.sourceUrl} target="_blank" rel="noreferrer" title="Apri la fonte" class="text-zinc-400 hover:text-sky-600"><ExternalLink size={11} /></a>}</div></div></article>)}</div> : <div class="place-items-center grid border border-zinc-200 border-dashed rounded-2xl h-56 text-center"><div><Sparkles size={25} class="mx-auto text-zinc-300" /><strong class="block mt-2 text-zinc-500 text-xs">Nessun risultato utile</strong><span class="block mt-1 text-[9px] text-zinc-400">Prova una ricerca più descrittiva o cambia categoria.</span></div></div>}
            {nextPage && !onlyFavorites && <button disabled={loadingMore} onClick={() => void search(nextPage, true)} class="bg-white disabled:opacity-40 mt-5 border border-zinc-200 hover:border-sky-300 rounded-xl w-full h-10 font-semibold text-[10px] text-zinc-600 cursor-pointer">{loadingMore ? "Caricamento…" : "Carica altri contenuti"}</button>}
          </div>
        </section>
      </div>}
    </div>
  );
}
