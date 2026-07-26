import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import {
  BadgeCheck,
  BarChart3,
  ChevronLeft,
  Circle,
  FileImage,
  Frame,
  GlassWater,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Images,
  LayoutDashboard,
  LoaderCircle,
  Palette,
  Pizza,
  Search,
  Shapes,
  Share2,
  Smile,
  Sparkles,
  Square,
  Table2,
  Triangle,
  Waves,
} from "lucide-preact";
import * as fabric from "fabric";
import { getActiveClientId, scopedHeaders } from "../api";
import { ensureObjectId, markSvgObject, type DDoneFabricObject } from "../canvas-model";
import { useEditor } from "../context";
import type { DesignElement, ElementCategory, ElementProvider, ElementSearchResponse } from "../types";

const CATEGORIES: Array<{
  key: ElementCategory;
  label: string;
  detail: string;
  icon: typeof Grid2X2;
  gradient: string;
}> = [
  { key: "shapes", label: "Forme", detail: "Forme vettoriali", icon: Shapes, gradient: "from-cyan-500 to-teal-400" },
  { key: "graphics", label: "Grafiche", detail: "Vettori e decorazioni", icon: Sparkles, gradient: "from-orange-500 to-amber-400" },
  { key: "photos", label: "Foto", detail: "JPG con sfondo", icon: ImageIcon, gradient: "from-sky-500 to-blue-500" },
  { key: "charts", label: "Grafici", detail: "Grafici modificabili", icon: BarChart3, gradient: "from-cyan-500 to-indigo-500" },
  { key: "modules", label: "Moduli", detail: "Card e checklist", icon: LayoutDashboard, gradient: "from-emerald-500 to-green-400" },
  { key: "tables", label: "Tabelle", detail: "Menu e listini", icon: Table2, gradient: "from-orange-500 to-red-500" },
  { key: "frames", label: "Cornici", detail: "Bordi e maschere", icon: Frame, gradient: "from-green-500 to-teal-400" },
  { key: "grids", label: "Griglie", detail: "Collage fotografici", icon: Grid2X2, gradient: "from-pink-500 to-fuchsia-500" },
  { key: "mockups", label: "Mockup", detail: "Telefono, tablet e poster", icon: FileImage, gradient: "from-teal-500 to-cyan-500" },
  { key: "icons", label: "Icone", detail: "Tabler e Iconify", icon: Sparkles, gradient: "from-indigo-500 to-violet-500" },
  { key: "illustrations", label: "Illustrazioni", detail: "Disegni e clipart", icon: Images, gradient: "from-amber-500 to-pink-500" },
  { key: "emoji", label: "Emoji", detail: "Twemoji locale", icon: Smile, gradient: "from-yellow-400 to-orange-500" },
  { key: "ornaments", label: "Ornamenti", detail: "Divisori e decori", icon: Sparkles, gradient: "from-yellow-500 to-amber-600" },
  { key: "food", label: "Cibo", detail: "Piatti e ingredienti", icon: Pizza, gradient: "from-red-500 to-orange-500" },
  { key: "cocktails", label: "Cocktail", detail: "Drink e bicchieri", icon: GlassWater, gradient: "from-cyan-500 to-purple-500" },
  { key: "backgrounds", label: "Sfondi", detail: "Texture e superfici", icon: Palette, gradient: "from-zinc-600 to-zinc-400" },
  { key: "patterns", label: "Pattern", detail: "Motivi ripetuti", icon: Waves, gradient: "from-blue-500 to-cyan-400" },
  { key: "social", label: "Social", detail: "Icone e simboli social", icon: Share2, gradient: "from-fuchsia-500 to-rose-500" },
];

const FORMAT_FILTERS = [
  { value: "all", label: "Tutti" },
  { value: "svg", label: "SVG modificabili" },
  { value: "png-transparent", label: "PNG trasparenti reali" },
  { value: "jpg", label: "JPG con sfondo" },
] as const;

type FormatFilter = typeof FORMAT_FILTERS[number]["value"];

const QUICK_SEARCHES = [
  "menu elegante",
  "tabella prezzi",
  "griglia foto",
  "cornice floreale",
  "pizza senza sfondo",
  "cocktail png",
  "icona telefono",
  "sfondo carta",
];

const FAVORITES_KEY = "ddone_design_element_favorites_v3";
const RECENTS_KEY = "ddone_design_element_recents_v3";

function readIds(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readRecentItems(): DesignElement[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item) => item && typeof item.id === "string").slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, value: string[]): void {
  localStorage.setItem(key, JSON.stringify(value.slice(0, 100)));
}

function writeRecentItems(value: DesignElement[]): void {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(value.slice(0, 12)));
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

function attachSourceMetadata(object: fabric.FabricObject, element: DesignElement): void {
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
  target.ddoneMediaUrl = element.assetUrl;
  if (element.kind === "vector" || element.format === "svg") markSvgObject(object, element.format ?? "svg");
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

function formatLabel(element: DesignElement): string {
  if (element.format === "png" && element.transparent) return "PNG · trasparente verificato";
  if (element.format === "jpg") return "JPG · con sfondo";
  if (element.format === "svg") return element.recolorable ? "SVG · colore modificabile" : "SVG · colori originali";
  if (element.format === "webp") return "WEBP";
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
      .catch(() => {
        if (!controller.signal.aborted) setUrl(null);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [element.id, element.previewUrl, element.svg, color]);

  const checkerboard = element.transparent
    ? { backgroundImage: "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e4e7 75%),linear-gradient(-45deg,transparent 75%,#e4e4e7 75%)", backgroundSize: "14px 14px", backgroundPosition: "0 0,0 7px,7px -7px,-7px 0" }
    : undefined;

  return (
    <div class="relative h-full w-full overflow-hidden rounded-md" style={checkerboard}>
      {url
        ? <img src={url} alt="" class="h-full w-full object-contain" loading="lazy" />
        : <div class="grid h-full w-full place-items-center text-zinc-400"><ImageIcon size={26} /></div>}
      <span class={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[7px] font-bold shadow ${element.format === "png" ? "bg-emerald-600 text-white" : element.format === "jpg" ? "bg-sky-600 text-white" : "bg-violet-600 text-white"}`}>
        {(element.format ?? "SVG").toUpperCase()}
      </span>
    </div>
  );
}

interface ElementCardProps {
  element: DesignElement;
  color: string;
  favorite: boolean;
  importing: boolean;
  onInsert: () => void;
  onFavorite: () => void;
  onBackground: () => void;
}

function ElementCard({ element, color, favorite, importing, onInsert, onFavorite, onBackground }: ElementCardProps) {
  return (
    <div class="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 transition hover:border-violet-400 hover:shadow-sm">
      <button
        disabled={importing}
        onClick={onInsert}
        title={`${element.name} · ${formatLabel(element)} · ${element.providerLabel}`}
        class="aspect-square w-full border-0 bg-transparent p-2 cursor-pointer disabled:opacity-50"
      >
        {importing
          ? <LoaderCircle size={20} class="mx-auto animate-spin text-violet-600" />
          : <AssetPreview element={element} color={color} />}
      </button>
      <button
        onClick={onFavorite}
        title={favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
        class="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full border border-white/80 bg-white/95 text-zinc-500 opacity-0 shadow-sm transition group-hover:opacity-100 cursor-pointer"
      >
        <Heart size={12} fill={favorite ? "currentColor" : "none"} class={favorite ? "text-rose-500" : ""} />
      </button>
      <div class="px-2 pb-2">
        <div class="truncate text-[9px] font-semibold text-zinc-700">{element.name}</div>
        <div class="truncate text-[8px] text-zinc-400">{element.providerLabel}</div>
        <div class="mt-1 truncate text-[7px] text-zinc-400">{formatLabel(element)}</div>
        {element.kind === "image" && (
          <button
            disabled={importing}
            onClick={onBackground}
            class="mt-1.5 rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-[7px] text-zinc-500 cursor-pointer hover:border-violet-300 disabled:opacity-50"
          >
            Usa come sfondo
          </button>
        )}
      </div>
    </div>
  );
}

export function ElementsLibraryV2() {
  const { canvas, canvasWidth, canvasHeight, addShape, setBackground } = useEditor();
  const [category, setCategory] = useState<ElementCategory>("all");
  const [searchInput, setSearchInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [format, setFormat] = useState<FormatFilter>("all");
  const [provider, setProvider] = useState("all");
  const [color, setColor] = useState("#171717");
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [providers, setProviders] = useState<ElementProvider[]>([]);
  const [page, setPage] = useState(1);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>(() => readIds(FAVORITES_KEY));
  const [recents, setRecents] = useState<DesignElement[]>(() => readRecentItems());
  const [showFavorites, setShowFavorites] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  const isHome = category === "all" && !submittedQuery;
  const visibleElements = useMemo(() => {
    if (!showFavorites) return elements;
    const selected = new Set(favorites);
    return elements.filter((item) => selected.has(item.id));
  }, [elements, favorites, showFavorites]);

  const runSearch = useCallback(async (requestedPage: number, append: boolean, signal?: AbortSignal) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category,
        q: submittedQuery,
        formats: format,
        page: String(requestedPage),
        page_size: "24",
      });
      if (provider !== "all") params.set("providers", provider);
      const response = await fetch(`/api/elements-universe/search?${params}`, {
        credentials: "include",
        headers: scopedHeaders(),
        signal,
      });
      const data = await response.json() as ElementSearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Ricerca elementi non disponibile");
      setProviders(data.providers.filter((item) => item.enabled));
      setWarnings(data.warnings ?? []);
      setPage(data.page);
      setNextPage(data.nextPage);
      setElements((current) => {
        const combined = append ? [...current, ...data.items] : data.items;
        return [...new Map(combined.map((item) => [item.id, item])).values()];
      });
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        setError(caught instanceof Error ? caught.message : "Impossibile caricare gli elementi");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, submittedQuery, format, provider]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void runSearch(1, false, controller.signal), 50);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [runSearch]);

  const rememberRecent = useCallback((element: DesignElement) => {
    setRecents((current) => {
      const updated = [element, ...current.filter((item) => item.id !== element.id)].slice(0, 12);
      writeRecentItems(updated);
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((current) => {
      const updated = current.includes(id)
        ? current.filter((item) => item !== id)
        : [id, ...current];
      writeIds(FAVORITES_KEY, updated);
      return updated;
    });
  }, []);

  const insertVector = useCallback(async (element: DesignElement) => {
    if (!canvas) return;
    const source = element.svg
      ?? (element.assetUrl ? await (await fetchProtected(element.assetUrl)).text() : null);
    if (!source) throw new Error("SVG non disponibile");
    const prepared = element.recolorable ? source.replaceAll("currentColor", color) : source;
    const loaded = await fabric.loadSVGFromString(prepared);
    const objects = loaded.objects.filter(Boolean) as fabric.FabricObject[];
    if (objects.length === 0) throw new Error("SVG vuoto");
    const object = fabric.util.groupSVGElements(objects, loaded.options);
    const width = object.width || 256;
    const height = object.height || 256;
    const scale = Math.min((canvasWidth * 0.42) / width, (canvasHeight * 0.42) / height, 3);
    object.set({
      left: canvasWidth / 2 - (width * scale) / 2,
      top: canvasHeight / 2 - (height * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    });
    attachSourceMetadata(object, element);
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
      image.set({
        left: canvasWidth / 2 - ((image.width || 0) * scale) / 2,
        top: canvasHeight / 2 - ((image.height || 0) * scale) / 2,
        scaleX: scale,
        scaleY: scale,
      });
      attachSourceMetadata(image, element);
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.requestRenderAll();
    } finally {
      setImportingId(null);
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

  const selectCategory = (next: ElementCategory) => {
    setCategory(next);
    setSearchInput("");
    setSubmittedQuery("");
    setFormat("all");
    setProvider("all");
    setShowFavorites(false);
  };

  const submitSearch = () => {
    setSubmittedQuery(searchInput.trim());
    setShowFavorites(false);
  };

  const renderCards = (items: DesignElement[]) => (
    <div class="grid grid-cols-3 gap-2">
      {items.map((element) => (
        <ElementCard
          key={element.id}
          element={element}
          color={color}
          favorite={favorites.includes(element.id)}
          importing={importingId === element.id}
          onInsert={() => void insertElement(element)}
          onFavorite={() => toggleFavorite(element.id)}
          onBackground={() => void insertImage(element, true)}
        />
      ))}
    </div>
  );

  return (
    <div class="flex flex-col gap-3">
      <div class="relative">
        <Search size={17} class="absolute left-3 top-3 text-zinc-400" />
        <input
          value={searchInput}
          onInput={(event) => setSearchInput((event.target as HTMLInputElement).value)}
          onKeyDown={(event) => { if (event.key === "Enter") submitSearch(); }}
          placeholder="Cerca tabelle, icone, PNG, foto…"
          class="h-11 w-full rounded-xl border border-violet-200 bg-white pl-10 pr-3 text-xs outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        />
      </div>
      <button
        onClick={submitSearch}
        class="h-9 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-xs font-semibold text-white shadow-sm cursor-pointer hover:opacity-90"
      >
        Cerca
      </button>

      {isHome ? (
        <>
          {recents.length > 0 && (
            <section>
              <div class="mb-2 flex items-center justify-between"><strong class="text-[11px] text-zinc-800">Usati di recente</strong><span class="text-[9px] text-zinc-400">{recents.length}</span></div>
              {renderCards(recents.slice(0, 6))}
            </section>
          )}
          <section>
            <strong class="mb-2 block text-[11px] text-zinc-800">Sfoglia le categorie</strong>
            <div class="grid grid-cols-3 gap-x-3 gap-y-4">
              {CATEGORIES.map((item) => (
                <button key={item.key} onClick={() => selectCategory(item.key)} class="group border-0 bg-transparent p-0 cursor-pointer text-center">
                  <span class={`mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${item.gradient} text-white shadow-md transition group-hover:-translate-y-0.5 group-hover:shadow-lg`}><item.icon size={27} /></span>
                  <span class="mt-1.5 block text-[9px] font-medium text-zinc-700">{item.label}</span>
                </button>
              ))}
            </div>
          </section>
          <div class="rounded-xl border border-emerald-100 bg-emerald-50/70 p-2.5">
            <div class="mb-1 flex items-center gap-2"><BadgeCheck size={14} class="text-emerald-600" /><strong class="text-[10px] text-zinc-800">Pack realmente inclusi</strong></div>
            <p class="m-0 text-[9px] leading-relaxed text-zinc-500">Tabler Icons e Twemoji sono installati nel progetto. I PNG vengono generati come file PNG reali con trasparenza; tabelle, grafici, griglie e mockup provengono dal pack strutturale locale.</p>
          </div>
        </>
      ) : (
        <>
          <div class="flex items-center gap-2">
            <button onClick={() => selectCategory("all")} class="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 cursor-pointer"><ChevronLeft size={15} /></button>
            <div><strong class="block text-[11px] text-zinc-800">{CATEGORIES.find((item) => item.key === category)?.label ?? "Risultati"}</strong><span class="text-[8px] text-zinc-400">{CATEGORIES.find((item) => item.key === category)?.detail ?? submittedQuery}</span></div>
          </div>

          <div class="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {FORMAT_FILTERS.map((item) => (
              <button key={item.value} onClick={() => setFormat(item.value)} class={`shrink-0 rounded-lg border px-2 py-1.5 text-[8px] font-semibold cursor-pointer ${format === item.value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-white text-zinc-500"}`}>{item.label}</button>
            ))}
          </div>

          <div class="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button onClick={() => setProvider("all")} class={`shrink-0 rounded-full border px-2.5 py-1 text-[8px] cursor-pointer ${provider === "all" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-500"}`}>Tutte le fonti</button>
            {providers.map((item) => <button key={item.id} title={item.description} onClick={() => setProvider(item.id)} class={`shrink-0 rounded-full border px-2.5 py-1 text-[8px] cursor-pointer ${provider === item.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-500"}`}>{item.label}</button>)}
          </div>

          {!submittedQuery && <div class="flex flex-wrap gap-1">{QUICK_SEARCHES.map((value) => <button key={value} onClick={() => { setSearchInput(value); setSubmittedQuery(value); }} class="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[8px] text-zinc-500 cursor-pointer hover:border-violet-300 hover:text-violet-700">{value}</button>)}</div>}

          <div class="flex items-center justify-between gap-2">
            <button onClick={() => setShowFavorites((current) => !current)} class={`h-7 rounded-md border px-2 flex items-center gap-1 text-[9px] cursor-pointer ${showFavorites ? "border-rose-300 bg-rose-50 text-rose-600" : "border-zinc-200 bg-white text-zinc-500"}`}><Heart size={11} fill={showFavorites ? "currentColor" : "none"} /> Preferiti {favorites.length || ""}</button>
            <label class="flex items-center gap-1.5 text-[8px] text-zinc-400">Colore SVG<input type="color" value={color} onInput={(event) => setColor((event.target as HTMLInputElement).value)} class="h-7 w-7 rounded border border-zinc-200 bg-transparent p-0 cursor-pointer" /></label>
          </div>

          {(category === "all" || category === "shapes") && !submittedQuery && !showFavorites && (
            <div class="grid grid-cols-4 gap-1.5">
              {[{ type: "rect" as const, label: "Rettangolo", icon: Square }, { type: "circle" as const, label: "Cerchio", icon: Circle }, { type: "triangle" as const, label: "Triangolo", icon: Triangle }, { type: "line" as const, label: "Linea", icon: Waves }].map((shape) => (
                <button key={shape.type} onClick={() => addShape(shape.type)} class="aspect-square rounded-lg border border-zinc-200 bg-zinc-50 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-violet-400 hover:bg-violet-50"><shape.icon size={20} style={{ color }} /><span class="text-[8px] text-zinc-500">{shape.label}</span></button>
              ))}
            </div>
          )}

          {loading && <div class="py-10 flex items-center justify-center gap-2 text-xs text-zinc-400"><LoaderCircle size={15} class="animate-spin" /> Caricamento del catalogo corretto…</div>}
          {error && <div class="rounded-lg border border-red-100 bg-red-50 p-2 text-[10px] text-red-600">{error}</div>}
          {warnings.length > 0 && <div class="rounded-lg border border-amber-100 bg-amber-50 p-2 text-[9px] text-amber-700">{warnings.join(" · ")}</div>}
          {!loading && renderCards(visibleElements)}
          {!loading && visibleElements.length === 0 && <div class="py-8 text-center text-xs text-zinc-400">Nessun elemento corrisponde a categoria e formato selezionati.</div>}
          {!loading && nextPage && !showFavorites && <button disabled={loadingMore} onClick={() => void runSearch(page + 1, true)} class="h-9 w-full rounded-lg border border-zinc-200 bg-white text-[10px] text-zinc-600 cursor-pointer hover:border-violet-400 disabled:opacity-50">{loadingMore ? "Caricamento…" : "Carica altri risultati"}</button>}
        </>
      )}
    </div>
  );
}
