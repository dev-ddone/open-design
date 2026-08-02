import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import {
  Camera,
  Check,
  Clock3,
  Compass,
  ExternalLink,
  Frame,
  Heart,
  Image as ImageIcon,
  LayoutDashboard,
  LoaderCircle,
  MoreHorizontal,
  PaintBucket,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Utensils,
  Wallpaper,
  X,
} from "lucide-preact";
import * as fabric from "fabric";
import { getActiveClientId, scopedHeaders } from "../api";
import { ensureObjectId, markSvgObject, type DDoneFabricObject } from "../canvas-model";
import { extractVectorPalette } from "../canvas/media-effects";
import { placeObjectWithoutOverlap } from "../canvas/smart-placement";
import { smartElementFromSource } from "../canvas/smart-elements";
import { useEditor } from "../context";
import {
  buildElementSearchParams,
  ELEMENT_CATEGORY_OPTIONS,
  ELEMENT_COLLECTIONS,
  ELEMENT_FORMAT_OPTIONS,
  hasActiveElementFilters,
  summarizeElementProviders,
  type ElementsFormatFilter,
  type ElementsView,
} from "../elements-library-model";
import type { DesignElement, ElementCategory, ElementProvider, ElementSearchResponse } from "../types";
import translations from "../../translations";
import { config } from "../../server/config";

const lang = config.lang;

const FAVORITES_KEY = "ddone_design_element_favorites_v3";
const FAVORITE_ITEMS_KEY = "ddone_design_element_favorite_items_v1";
const RECENTS_KEY = "ddone_design_element_recents_v3";

const COLLECTION_ICONS = {
  sparkles: Sparkles,
  camera: Camera,
  frame: Frame,
  layout: LayoutDashboard,
  wallpaper: Wallpaper,
  food: Utensils,
} as const;

function readArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function uniqueItems(items: DesignElement[], maximum: number): DesignElement[] {
  return [...new Map(items.filter((item) => item?.id).map((item) => [item.id, item])).values()].slice(0, maximum);
}

function writeItems(key: string, items: DesignElement[], maximum: number): void {
  localStorage.setItem(key, JSON.stringify(uniqueItems(items, maximum)));
}

function svgPreview(svg: string, color: string, recolorable: boolean): string {
  const source = recolorable ? svg.replaceAll("currentColor", color) : svg;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

async function fetchProtected(path: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(path, {
    credentials: "include",
    headers: scopedHeaders(),
    signal,
  });
  if (!response.ok) {
    let message = `Risorsa non disponibile (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error) message = String(data.error);
    } catch {
      // Keep the generic message for non-JSON responses.
    }
    throw new Error(message);
  }
  return response;
}

function safeFilename(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "open-asset";
}

function extensionForMime(mime: string): string {
  const value = mime.split(";", 1)[0].toLowerCase();
  if (value === "image/svg+xml") return "svg";
  if (value === "image/png") return "png";
  if (value === "image/jpeg") return "jpg";
  if (value === "image/webp") return "webp";
  return "png";
}

async function persistRemoteImage(element: DesignElement): Promise<string> {
  if (!element.assetUrl) throw new Error("Immagine non disponibile");
  if (element.provider === "uploads" && element.assetUrl.startsWith("/api/assets/")) return element.assetUrl;

  const source = await fetchProtected(element.assetUrl);
  const blob = await source.blob();
  if (!blob.type.startsWith("image/")) throw new Error("La sorgente non ha restituito un’immagine");
  if (blob.size > 25 * 1024 * 1024) throw new Error("L’immagine supera il limite di 25 MB");

  const file = new File(
    [blob],
    `${safeFilename(element.name)}-${safeFilename(element.provider)}.${extensionForMime(blob.type)}`,
    { type: blob.type.split(";", 1)[0] },
  );
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

  const response = await fetch("/api/uploads", {
    method: "POST",
    credentials: "include",
    headers: scopedHeaders(),
    body: form,
  });
  const data = await response.json() as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error ?? "Impossibile importare l’immagine nella libreria privata");
  return data.url;
}

function attachSourceMetadata(object: fabric.FabricObject, element: DesignElement, stableUrl?: string): void {
  const target = object as DDoneFabricObject;
  ensureObjectId(object);
  target.ddoneSourceId = element.id;
  target.ddoneProvider = element.providerLabel || element.provider;
  target.ddoneSourceUrl = element.sourceUrl;
  target.ddoneLicense = element.license;
  target.ddoneLicenseUrl = element.licenseUrl;
  target.ddoneAuthor = element.author;
  target.ddoneAttribution = element.attribution;
  target.ddoneAttributionRequired = element.attributionRequired;
  target.ddoneMediaKind = element.kind;
  target.ddoneFormat = element.format;
  target.ddoneTransparent = element.transparent;
  target.ddoneMediaUrl = stableUrl ?? element.assetUrl;
  if (element.kind === "vector" || element.format === "svg") markSvgObject(object, element.format ?? "svg");
}

function formatLabel(element: DesignElement): string {
  if (element.format === "png" && element.transparent) return "PNG trasparente";
  if (element.format === "jpg") return "Foto JPG";
  if (element.format === "svg") return element.recolorable ? "SVG modificabile" : "SVG";
  return (element.format ?? element.kind).toUpperCase();
}

function AssetPreview({ element, color }: { element: DesignElement; color: string }) {
  const [url, setUrl] = useState<string | null>(
    element.svg ? svgPreview(element.svg, color, Boolean(element.recolorable)) : null,
  );

  useEffect(() => {
    if (element.svg) {
      setUrl(svgPreview(element.svg, color, Boolean(element.recolorable)));
      return;
    }
    if (!element.previewUrl) {
      setUrl(null);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetchProtected(element.previewUrl, controller.signal)
      .then((response) => response.blob())
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (!controller.signal.aborted) setUrl(null); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [element.id, element.previewUrl, element.svg, color]);

  const checkerboard = element.transparent
    ? {
        backgroundImage: "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e4e7 75%),linear-gradient(-45deg,transparent 75%,#e4e4e7 75%)",
        backgroundSize: "14px 14px",
        backgroundPosition: "0 0,0 7px,7px -7px,-7px 0",
      }
    : undefined;

  return (
    <div class="bg-zinc-100 w-full h-full overflow-hidden" style={checkerboard}>
      {url
        ? <img src={url} alt={element.name} class="w-full h-full object-contain" loading="lazy" />
        : <div class="place-items-center grid w-full h-full text-zinc-300"><ImageIcon size={28} /></div>}
    </div>
  );
}

interface ElementCardProps {
  element: DesignElement;
  color: string;
  favorite: boolean;
  importing: boolean;
  menuOpen: boolean;
  onInsert: () => void;
  onFavorite: () => void;
  onToggleMenu: () => void;
  onBackground: () => void;
}

function ElementCard({
  element,
  color,
  favorite,
  importing,
  menuOpen,
  onInsert,
  onFavorite,
  onToggleMenu,
  onBackground,
}: ElementCardProps) {
  return (
    <article class="relative bg-white shadow-sm hover:shadow-md border border-zinc-200 hover:border-violet-300 rounded-xl overflow-visible transition">
      <div class="relative bg-zinc-100 rounded-t-xl aspect-4/3 overflow-hidden">
        <button
          type="button"
          disabled={importing}
          onClick={onInsert}
          aria-label={`Inserisci ${element.name}`}
          class="bg-transparent disabled:opacity-50 p-0 border-0 w-full h-full cursor-pointer"
        >
          {importing
            ? <div class="place-items-center grid h-full"><LoaderCircle size={22} class="text-violet-600 animate-spin" /></div>
            : <AssetPreview element={element} color={color} />}
        </button>
        <button
          type="button"
          onClick={onFavorite}
          aria-label={favorite ? `${translations[lang].remove} ${element.name} ${translations[lang].from} ${translations[lang].favorites}` : `${translations[lang].add} ${element.name} ${translations[lang].to} ${translations[lang].favorites}`}
          class={`absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full border border-white/80 bg-white/95 shadow-sm cursor-pointer ${favorite ? "text-rose-500" : "text-zinc-500"}`}
        >
          <Heart size={12} fill={favorite ? "currentColor" : "none"} />
        </button>
        {(element.kind === "image" || element.sourceUrl) && (
          <button
            type="button"
            onClick={onToggleMenu}
            aria-label={`Altre azioni per ${element.name}`}
            class="top-2 right-2 absolute place-items-center grid bg-white/95 shadow-sm border border-white/80 rounded-full w-7 h-7 text-zinc-600 cursor-pointer"
          >
            <MoreHorizontal size={14} />
          </button>
        )}
        {menuOpen && (
          <div class="top-10 right-2 z-30 absolute bg-white shadow-xl p-1 border border-zinc-200 rounded-lg w-36 overflow-hidden">
            {element.kind === "image" && (
              <button type="button" onClick={onBackground} class="flex items-center gap-2 bg-transparent hover:bg-zinc-100 px-2 py-2 border-0 rounded-md w-full text-[9px] text-zinc-600 text-left cursor-pointer">
                <PaintBucket size={12} /> Usa come sfondo
              </button>
            )}
            {element.sourceUrl && (
              <a href={element.sourceUrl} target="_blank" rel="noreferrer" class="flex items-center gap-2 hover:bg-zinc-100 px-2 py-2 rounded-md text-[9px] text-zinc-600 no-underline">
                <ExternalLink size={12} /> Apri la fonte
              </a>
            )}
          </div>
        )}
      </div>
      <div class="px-2.5 py-2 min-w-0">
        <strong class="block font-semibold text-[10px] text-zinc-800 truncate">{element.name}</strong>
        <div class="flex items-center gap-1 mt-0.5 min-w-0 text-[8px] text-zinc-400">
          <span class="truncate">{element.providerLabel}</span>
          <span>·</span>
          <span class="shrink-0">{formatLabel(element)}</span>
        </div>
      </div>
    </article>
  );
}

export function ElementsLibraryV3() {
  const { canvas, canvasWidth, canvasHeight, setBackground } = useEditor();
  const [view, setView] = useState<ElementsView>("discover");
  const [searchInput, setSearchInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [category, setCategory] = useState<ElementCategory>("all");
  const [format, setFormat] = useState<ElementsFormatFilter>("all");
  const [provider, setProvider] = useState("all");
  const [color, setColor] = useState("#171717");
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [providers, setProviders] = useState<ElementProvider[]>([]);
  const [page, setPage] = useState(1);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => readArray<string>(FAVORITES_KEY));
  const [favoriteItems, setFavoriteItems] = useState<DesignElement[]>(() => readArray<DesignElement>(FAVORITE_ITEMS_KEY));
  const [recents, setRecents] = useState<DesignElement[]>(() => readArray<DesignElement>(RECENTS_KEY));

  const providerSummary = useMemo(() => summarizeElementProviders(providers), [providers]);
  const activeFilters = hasActiveElementFilters({ category, query: submittedQuery, format, provider });
  const landing = view === "discover" && !activeFilters;

  const reloadPreferences = useCallback(() => {
    setFavorites(readArray<string>(FAVORITES_KEY));
    setFavoriteItems(readArray<DesignElement>(FAVORITE_ITEMS_KEY));
    setRecents(readArray<DesignElement>(RECENTS_KEY));
  }, []);

  useEffect(() => {
    window.addEventListener("ddone:element-preferences-synced", reloadPreferences);
    return () => window.removeEventListener("ddone:element-preferences-synced", reloadPreferences);
  }, [reloadPreferences]);

  const runSearch = useCallback(async (requestedPage: number, append: boolean, signal?: AbortSignal) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const params = buildElementSearchParams({
        category,
        query: submittedQuery,
        format,
        provider,
        page: requestedPage,
        pageSize: 24,
      });
      const response = await fetch(`/api/elements-universe/search?${params}`, {
        credentials: "include",
        headers: scopedHeaders(),
        signal,
      });
      const data = await response.json() as ElementSearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Ricerca elementi non disponibile");
      setProviders(data.providers);
      setWarnings(data.warnings ?? []);
      setPage(data.page);
      setNextPage(data.nextPage);
      setElements((current) => {
        const combined = append ? [...current, ...data.items] : data.items;
        return uniqueItems(combined, 300);
      });
      setFavoriteItems((current) => {
        const refreshed = uniqueItems([
          ...data.items.filter((item) => favorites.includes(item.id)),
          ...current,
        ], 250);
        writeItems(FAVORITE_ITEMS_KEY, refreshed, 250);
        return refreshed;
      });
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        setError(caught instanceof Error ? caught.message : "Impossibile caricare gli elementi");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, submittedQuery, format, provider, favorites]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void runSearch(1, false, controller.signal), 80);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [runSearch]);

  useEffect(() => {
    if (provider === "all") return;
    if (providerSummary.enabled.some((item) => item.id === provider)) return;
    setProvider("all");
  }, [provider, providerSummary.enabled]);

  const rememberRecent = useCallback((element: DesignElement) => {
    setRecents((current) => {
      const updated = uniqueItems([element, ...current], 40);
      writeItems(RECENTS_KEY, updated, 40);
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback((element: DesignElement) => {
    setFavorites((current) => {
      const updated = current.includes(element.id)
        ? current.filter((id) => id !== element.id)
        : [element.id, ...current];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...new Set(updated)].slice(0, 1_000)));
      return updated;
    });
    setFavoriteItems((current) => {
      const updated = favorites.includes(element.id)
        ? current.filter((item) => item.id !== element.id)
        : uniqueItems([element, ...current], 250);
      writeItems(FAVORITE_ITEMS_KEY, updated, 250);
      return updated;
    });
  }, [favorites]);

  const insertVector = useCallback(async (element: DesignElement) => {
    if (!canvas) return;
    const smart = element.format === "svg" ? await smartElementFromSource(element.id, color) : null;
    if (smart) {
      const scale = Math.min((canvasWidth * 0.58) / (smart.width || 1), (canvasHeight * 0.58) / (smart.height || 1), 1.5);
      smart.set({ scaleX: scale, scaleY: scale });
      attachSourceMetadata(smart, element);
      placeObjectWithoutOverlap(canvas, smart, canvasWidth, canvasHeight);
      canvas.add(smart);
      canvas.setActiveObject(smart);
      canvas.requestRenderAll();
      window.dispatchEvent(new CustomEvent("ddone:smart-element-created", { detail: { type: smart.ddoneSmartType } }));
      return;
    }

    const source = element.svg ?? (element.assetUrl ? await (await fetchProtected(element.assetUrl)).text() : null);
    if (!source) throw new Error("SVG non disponibile");
    const prepared = element.recolorable ? source.replaceAll("currentColor", color) : source;
    const loaded = await fabric.loadSVGFromString(prepared);
    const objects = loaded.objects.filter(Boolean) as fabric.FabricObject[];
    if (objects.length === 0) throw new Error("SVG vuoto");
    const object = fabric.util.groupSVGElements(objects, loaded.options);
    const width = object.width || 256;
    const height = object.height || 256;
    const scale = Math.min((canvasWidth * 0.42) / width, (canvasHeight * 0.42) / height, 3);
    object.set({ scaleX: scale, scaleY: scale });
    attachSourceMetadata(object, element);
    extractVectorPalette(object);
    placeObjectWithoutOverlap(canvas, object, canvasWidth, canvasHeight);
    canvas.add(object);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
  }, [canvas, canvasWidth, canvasHeight, color]);

  const insertImage = useCallback(async (element: DesignElement, asBackground = false) => {
    if (!canvas || !element.assetUrl) return;
    setImportingId(element.id);
    try {
      const stableUrl = await persistRemoteImage(element);
      if (asBackground) {
        setBackground("image", stableUrl);
        return;
      }
      const image = await fabric.FabricImage.fromURL(stableUrl, { crossOrigin: "anonymous" });
      const scale = Math.min(
        (canvasWidth * 0.65) / (image.width || 1),
        (canvasHeight * 0.65) / (image.height || 1),
        1,
      );
      image.set({ scaleX: scale, scaleY: scale });
      attachSourceMetadata(image, element, stableUrl);
      placeObjectWithoutOverlap(canvas, image, canvasWidth, canvasHeight);
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.requestRenderAll();
    } finally {
      setImportingId(null);
      setMenuId(null);
    }
  }, [canvas, canvasWidth, canvasHeight, setBackground]);

  const insertElement = useCallback(async (element: DesignElement) => {
    try {
      if (element.kind === "vector") await insertVector(element);
      else await insertImage(element);
      rememberRecent(element);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Questo elemento non può essere inserito");
    }
  }, [insertVector, insertImage, rememberRecent]);

  const resetFilters = useCallback(() => {
    setSearchInput("");
    setSubmittedQuery("");
    setCategory("all");
    setFormat("all");
    setProvider("all");
    setFilterOpen(false);
  }, []);

  const submitSearch = useCallback(() => {
    setView("discover");
    setSubmittedQuery(searchInput.trim());
  }, [searchInput]);

  const openCollection = useCallback((collection: typeof ELEMENT_COLLECTIONS[number]) => {
    setView("discover");
    setCategory(collection.category);
    setSearchInput(collection.query);
    setSubmittedQuery(collection.query);
    setFormat("all");
    setProvider("all");
  }, []);

  const displayedItems = view === "recent"
    ? recents
    : view === "favorites"
      ? favoriteItems.filter((item) => favorites.includes(item.id))
      : landing
        ? elements.slice(0, 8)
        : elements;

  const renderCards = (items: DesignElement[]) => (
    <div class="gap-2.5 grid grid-cols-2">
      {items.map((element) => (
        <ElementCard
          key={element.id}
          element={element}
          color={color}
          favorite={favorites.includes(element.id)}
          importing={importingId === element.id}
          menuOpen={menuId === element.id}
          onInsert={() => void insertElement(element)}
          onFavorite={() => toggleFavorite(element)}
          onToggleMenu={() => setMenuId((current) => current === element.id ? null : element.id)}
          onBackground={() => void insertImage(element, true)}
        />
      ))}
    </div>
  );

  return (
    <div class="flex flex-col gap-3 min-h-0" data-testid="elements-library-v3">
      <form onSubmit={(event) => { event.preventDefault(); submitSearch(); }} class="flex gap-2">
        <div class="relative flex-1 min-w-0">
          <Search size={15} class="top-3 left-3 absolute text-zinc-400" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput((event.target as HTMLInputElement).value)}
            placeholder={translations[lang].searchElementsPlaceholder}
            aria-label={translations[lang].searchElements}
            class="bg-white pr-10 pl-9 border border-zinc-200 focus:border-violet-400 rounded-xl outline-none focus:ring-2 focus:ring-violet-100 w-full h-10 text-xs transition"
          />
          {searchInput && (
            <button type="button" onClick={() => { setSearchInput(""); if (submittedQuery) setSubmittedQuery(""); }} aria-label="Cancella ricerca" class="top-2 right-2 absolute place-items-center grid bg-transparent hover:bg-zinc-100 border-0 rounded-md w-6 h-6 text-zinc-400 cursor-pointer">
              <X size={13} />
            </button>
          )}
        </div>
        <button type="submit" aria-label="Avvia ricerca elementi" class="place-items-center grid bg-violet-600 hover:bg-violet-700 shadow-sm border-0 rounded-xl w-10 h-10 text-white cursor-pointer shrink-0">
          <Search size={15} />
        </button>
        <button type="button" onClick={() => setFilterOpen((current) => !current)} aria-label="Filtri elementi" aria-expanded={filterOpen} class={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border cursor-pointer ${filterOpen || activeFilters ? "border-violet-300 bg-violet-50 text-violet-700" : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"}`}>
          <SlidersHorizontal size={15} />
          {activeFilters && <span class="top-1.5 right-1.5 absolute bg-violet-600 rounded-full w-1.5 h-1.5" />}
        </button>
      </form>

      <div role="tablist" aria-label="Viste della libreria" class="grid grid-cols-3 bg-zinc-100 p-1 rounded-xl">
        {[
          { value: "discover" as const, label: "Esplora", icon: Compass },
          { value: "recent" as const, label: "Recenti", icon: Clock3 },
          { value: "favorites" as const, label: "Preferiti", icon: Heart },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={view === item.value}
            onClick={() => { setView(item.value); setMenuId(null); }}
            class={`flex h-8 items-center justify-center gap-1.5 rounded-lg border-0 text-[9px] font-semibold cursor-pointer ${view === item.value ? "bg-white text-zinc-800 shadow-sm" : "bg-transparent text-zinc-400 hover:text-zinc-700"}`}
          >
            <item.icon size={12} fill={item.value === "favorites" && view === item.value ? "currentColor" : "none"} /> {item.label}
          </button>
        ))}
      </div>

      {filterOpen && (
        <section aria-label="Filtri elementi" class="bg-zinc-50 p-3 border border-zinc-200 rounded-xl">
          <div class="flex justify-between items-center mb-3">
            <strong class="text-[10px] text-zinc-700">Filtri</strong>
            <button type="button" onClick={resetFilters} class="flex items-center gap-1 bg-transparent border-0 text-[8px] text-zinc-500 hover:text-violet-700 cursor-pointer"><RotateCcw size={11} /> Ripristina</button>
          </div>
          <div class="gap-2 grid">
            <label class="gap-1 grid font-medium text-[8px] text-zinc-500">
              Categoria
              <select value={category} onChange={(event) => { setCategory((event.target as HTMLSelectElement).value as ElementCategory); setView("discover"); }} class="bg-white px-2 border border-zinc-200 rounded-lg outline-none h-9 text-[10px] text-zinc-700">
                {ELEMENT_CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label class="gap-1 grid font-medium text-[8px] text-zinc-500">
              Formato
              <select value={format} onChange={(event) => { setFormat((event.target as HTMLSelectElement).value as ElementsFormatFilter); setView("discover"); }} class="bg-white px-2 border border-zinc-200 rounded-lg outline-none h-9 text-[10px] text-zinc-700">
                {ELEMENT_FORMAT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label class="gap-1 grid font-medium text-[8px] text-zinc-500">
              Fonte
              <select value={provider} onChange={(event) => { setProvider((event.target as HTMLSelectElement).value); setView("discover"); }} class="bg-white px-2 border border-zinc-200 rounded-lg outline-none h-9 text-[10px] text-zinc-700">
                <option value="all">Tutte le fonti attive</option>
                {providerSummary.enabled.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label class="flex justify-between items-center bg-white px-2.5 py-2 border border-zinc-200 rounded-lg font-medium text-[8px] text-zinc-500">
              Colore iniziale degli SVG
              <input type="color" value={color} onInput={(event) => setColor((event.target as HTMLInputElement).value)} class="bg-transparent p-0 border border-zinc-200 rounded w-9 h-7 cursor-pointer" />
            </label>
          </div>
          <div class="bg-white mt-2 px-2.5 py-2 rounded-lg text-[8px] text-zinc-400 leading-relaxed">
            <span class="font-semibold text-emerald-600">{providerSummary.enabled.length} fonti attive</span>
            {providerSummary.disabled.length > 0 && <span> · Da configurare: {providerSummary.disabled.map((item) => item.label).join(", ")}</span>}
          </div>
        </section>
      )}

      {view === "discover" && landing && (
        <section>
          <div class="flex justify-between items-end mb-2">
            <div><strong class="block text-[11px] text-zinc-800">Cosa vuoi creare?</strong><span class="text-[8px] text-zinc-400">Scegli una raccolta oppure cerca direttamente.</span></div>
            <span class="text-[8px] text-zinc-400">{providerSummary.enabled.length || "–"} fonti</span>
          </div>
          <div class="gap-2 grid grid-cols-2">
            {ELEMENT_COLLECTIONS.map((collection) => {
              const Icon = COLLECTION_ICONS[collection.icon];
              return (
                <button key={collection.id} type="button" onClick={() => openCollection(collection)} class="flex items-center gap-2.5 bg-white hover:bg-violet-50/40 p-2.5 border border-zinc-200 hover:border-violet-300 rounded-xl min-h-16 text-left transition cursor-pointer">
                  <span class="place-items-center grid bg-zinc-100 rounded-lg w-9 h-9 text-violet-600 shrink-0"><Icon size={17} /></span>
                  <span class="min-w-0"><strong class="block text-[9px] text-zinc-800">{collection.label}</strong><span class="block mt-0.5 text-[7px] text-zinc-400 leading-relaxed">{collection.detail}</span></span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section class="min-h-0">
        <div class="flex justify-between items-center gap-2 mb-2">
          <div>
            <strong class="block text-[11px] text-zinc-800">
              {view === "recent" ? "Usati di recente" : view === "favorites" ? "I tuoi preferiti" : landing ? "In evidenza" : "Risultati"}
            </strong>
            <span class="text-[8px] text-zinc-400">
              {view === "recent" ? `${recents.length} elementi` : view === "favorites" ? `${displayedItems.length} salvati` : submittedQuery || ELEMENT_CATEGORY_OPTIONS.find((item) => item.value === category)?.label}
            </span>
          </div>
          {view === "discover" && activeFilters && (
            <button type="button" onClick={resetFilters} class="bg-white px-2 py-1 border border-zinc-200 hover:border-violet-300 rounded-lg text-[8px] text-zinc-500 cursor-pointer">{translations[lang].showAll}</button>
          )}
        </div>

        {loading && view === "discover" && (
          <div class="gap-2.5 grid grid-cols-2">
            {[0, 1, 2, 3].map((item) => <div key={item} class="bg-zinc-100 rounded-xl aspect-4/3 animate-pulse" />)}
          </div>
        )}
        {error && <div class="bg-red-50 mb-2 p-2 border border-red-100 rounded-lg text-[9px] text-red-600">{error}</div>}
        {warnings.length > 0 && view === "discover" && <div class="bg-amber-50 mb-2 p-2 border border-amber-100 rounded-lg text-[8px] text-amber-700 leading-relaxed">{translations[lang].unresponsiveSources}: {warnings.join(" · ")}</div>}
        {(!loading || view !== "discover") && displayedItems.length > 0 && renderCards(displayedItems)}
        {(!loading || view !== "discover") && displayedItems.length === 0 && (
          <div class="px-4 py-8 border border-zinc-200 border-dashed rounded-xl text-center">
            <Sparkles size={22} class="mx-auto text-zinc-300" />
            <strong class="block mt-2 text-[10px] text-zinc-500">Nessun elemento qui</strong>
            <span class="block mt-1 text-[8px] text-zinc-400">Cambia ricerca o torna a Esplora.</span>
          </div>
        )}
        {view === "discover" && !loading && nextPage && !landing && (
          <button type="button" disabled={loadingMore} onClick={() => void runSearch(page + 1, true)} class="bg-white disabled:opacity-50 mt-3 border border-zinc-200 hover:border-violet-300 rounded-xl w-full h-9 font-semibold text-[9px] text-zinc-600 cursor-pointer">
            {loadingMore ? <span class="inline-flex items-center gap-1.5"><LoaderCircle size={12} class="animate-spin" /> Caricamento…</span> : "Carica altri risultati"}
          </button>
        )}
      </section>
    </div>
  );
}
