import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import {
  AudioLines,
  BadgeCheck,
  BarChart3,
  Box,
  ChevronDown,
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
  Music2,
  Palette,
  Pause,
  Play,
  Pizza,
  Search,
  Shapes,
  Sparkles,
  Square,
  Sticker,
  Table2,
  Triangle,
  Video,
  WandSparkles,
  Waves,
} from "lucide-preact";
import * as fabric from "fabric";
import { getActiveClientId, scopedHeaders } from "../api";
import {
  ensureObjectId,
  markSvgObject,
  type DDoneFabricObject,
} from "../canvas-model";
import { useEditor } from "../context";
import type {
  DesignElement,
  ElementCategory,
  ElementProvider,
  ElementSearchResponse,
} from "../types";

const CATEGORIES: Array<{
  key: ElementCategory;
  label: string;
  detail: string;
  icon: typeof Grid2X2;
  gradient: string;
}> = [
  { key: "shapes", label: "Forme", detail: "Forme e linee", icon: Shapes, gradient: "from-cyan-500 to-teal-400" },
  { key: "graphics", label: "Grafiche", detail: "Vettori e illustrazioni", icon: Sparkles, gradient: "from-orange-500 to-amber-400" },
  { key: "animations", label: "Animazioni", detail: "GIF e sticker", icon: Sticker, gradient: "from-lime-500 to-emerald-500" },
  { key: "photos", label: "Foto", detail: "Stock e foto aperte", icon: ImageIcon, gradient: "from-sky-500 to-blue-500" },
  { key: "videos", label: "Video", detail: "Clip e poster", icon: Video, gradient: "from-fuchsia-500 to-violet-500" },
  { key: "audio", label: "Audio", detail: "Musica ed effetti", icon: Music2, gradient: "from-rose-500 to-red-400" },
  { key: "charts", label: "Grafici", detail: "Dati modificabili", icon: BarChart3, gradient: "from-cyan-500 to-indigo-500" },
  { key: "modules", label: "Moduli", detail: "Card e checklist", icon: LayoutDashboard, gradient: "from-emerald-500 to-green-400" },
  { key: "tables", label: "Tabelle", detail: "Menu e listini", icon: Table2, gradient: "from-orange-500 to-red-500" },
  { key: "frames", label: "Cornici", detail: "Bordi e maschere", icon: Frame, gradient: "from-green-500 to-teal-400" },
  { key: "grids", label: "Griglie", detail: "Collage fotografici", icon: Grid2X2, gradient: "from-pink-500 to-fuchsia-500" },
  { key: "mockups", label: "Mockup", detail: "Dispositivi e prodotti", icon: FileImage, gradient: "from-teal-500 to-cyan-500" },
  { key: "models3d", label: "3D", detail: "Modelli e anteprime", icon: Box, gradient: "from-violet-500 to-purple-500" },
  { key: "icons", label: "Icone", detail: "Iconify e SVG", icon: Sparkles, gradient: "from-indigo-500 to-violet-500" },
  { key: "illustrations", label: "Illustrazioni", detail: "Disegni e clipart", icon: Images, gradient: "from-amber-500 to-pink-500" },
  { key: "emoji", label: "Emoji", detail: "Emoji open source", icon: Sticker, gradient: "from-yellow-400 to-orange-500" },
  { key: "ornaments", label: "Ornamenti", detail: "Divisori e decori", icon: Sparkles, gradient: "from-yellow-500 to-amber-600" },
  { key: "food", label: "Cibo", detail: "Piatti e ingredienti", icon: Pizza, gradient: "from-red-500 to-orange-500" },
  { key: "cocktails", label: "Cocktail", detail: "Drink e bicchieri", icon: GlassWater, gradient: "from-cyan-500 to-purple-500" },
  { key: "backgrounds", label: "Sfondi", detail: "Texture e superfici", icon: Palette, gradient: "from-zinc-600 to-zinc-400" },
  { key: "patterns", label: "Pattern", detail: "Motivi ripetuti", icon: Waves, gradient: "from-blue-500 to-cyan-400" },
];

const QUICK_SEARCHES = [
  "menu elegante",
  "ornamento floreale",
  "pizza senza sfondo",
  "cocktail png",
  "cornice dorata",
  "sfondo carta",
  "ristorante moderno",
  "evento estivo",
];

const FORMAT_FILTERS = [
  { value: "all", label: "Tutti" },
  { value: "svg", label: "SVG" },
  { value: "png-transparent", label: "PNG trasparente" },
  { value: "jpg", label: "JPG con sfondo" },
  { value: "gif", label: "GIF" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "model", label: "3D" },
] as const;

const FAVORITES_KEY = "ddone_design_element_favorites";
const RECENT_ITEMS_KEY = "ddone_design_element_recent_items_v2";

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
    const value = JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]): void {
  localStorage.setItem(key, JSON.stringify(ids.slice(0, 100)));
}

function writeRecentItems(items: DesignElement[]): void {
  localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(items.slice(0, 16)));
}

function svgPreview(svg: string, color: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replaceAll("currentColor", color))}`;
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
      // Keep generic message for non-JSON upstream errors.
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
  target.ddonePosterUrl = element.previewUrl;
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
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
  };
  return extensions[mime.split(";", 1)[0].toLowerCase()] ?? "png";
}

async function persistRemoteImage(element: DesignElement, sourceUrl = element.assetUrl): Promise<string> {
  if (!sourceUrl) throw new Error("Anteprima remota non disponibile");
  if (element.provider === "uploads" && sourceUrl.startsWith("/api/assets/")) return sourceUrl;

  const remoteResponse = await fetchProtected(sourceUrl);
  const blob = await remoteResponse.blob();
  if (!blob.type.startsWith("image/")) throw new Error("La sorgente non ha restituito un’immagine");
  if (blob.size > 25 * 1024 * 1024) throw new Error("L’immagine supera il limite di 25 MB");

  const extension = extensionForMime(blob.type);
  const file = new File([blob], `${safeFilename(element.name)}-${safeFilename(element.provider)}.${extension}`, {
    type: blob.type.split(";", 1)[0],
  });
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
  if (!response.ok || !data.url) throw new Error(data.error ?? "Impossibile importare il media nella libreria privata");
  return data.url;
}

function formatLabel(element: DesignElement): string {
  if (element.format === "png" && element.transparent) return "PNG · trasparente";
  if (element.format === "jpg") return "JPG · sfondo";
  if (element.kind === "model") return "3D";
  if (element.kind === "video") return "VIDEO";
  if (element.kind === "audio") return "AUDIO";
  return (element.format ?? element.kind).toUpperCase();
}

function AssetPreview({ element, color }: { element: DesignElement; color: string }) {
  const [url, setUrl] = useState<string | null>(element.svg ? svgPreview(element.svg, color) : null);

  useEffect(() => {
    if (element.svg) {
      setUrl(svgPreview(element.svg, color));
      return;
    }
    if (!element.previewUrl || element.kind === "audio") {
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

  if (element.kind === "audio") {
    return <div class="grid h-full w-full place-items-center bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white"><AudioLines size={30} /><span class="absolute bottom-2 text-[8px] font-semibold">{element.duration ? `${Math.round(element.duration)} s` : "Audio"}</span></div>;
  }
  if (!url) {
    const Icon = element.kind === "model" ? Box : element.kind === "video" ? Video : ImageIcon;
    return <div class="grid h-full w-full place-items-center text-zinc-400"><Icon size={28} /></div>;
  }
  return (
    <div class="relative h-full w-full">
      <img src={url} alt="" class="h-full w-full object-contain" loading="lazy" />
      {(element.kind === "video" || element.kind === "gif") && <span class="absolute inset-0 grid place-items-center"><span class="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white shadow"><Play size={17} fill="currentColor" /></span></span>}
      {element.kind === "model" && <span class="absolute bottom-1.5 right-1.5 rounded-md bg-violet-600 px-1.5 py-1 text-[8px] font-bold text-white">3D</span>}
    </div>
  );
}

function ElementCard({
  element,
  color,
  favorite,
  importing,
  onInsert,
  onFavorite,
  onBackground,
  onPreviewAudio,
  playing,
}: {
  element: DesignElement;
  color: string;
  favorite: boolean;
  importing: boolean;
  onInsert: () => void;
  onFavorite: () => void;
  onBackground: () => void;
  onPreviewAudio: () => void;
  playing: boolean;
}) {
  return (
    <article class="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md">
      <button disabled={importing} onClick={onInsert} class="relative block aspect-square w-full border-0 bg-zinc-50 p-0 cursor-pointer disabled:opacity-50">
        {importing ? <span class="grid h-full place-items-center"><LoaderCircle size={20} class="animate-spin text-violet-600" /></span> : <AssetPreview element={element} color={color} />}
      </button>
      <button onClick={onFavorite} title={favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"} class="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full border border-white/70 bg-white/90 text-zinc-500 opacity-0 shadow-sm cursor-pointer transition group-hover:opacity-100"><Heart size={12} fill={favorite ? "currentColor" : "none"} class={favorite ? "text-rose-500" : ""} /></button>
      <div class="p-2">
        <div class="truncate text-[9px] font-semibold text-zinc-700">{element.name}</div>
        <div class="mt-0.5 flex items-center justify-between gap-1">
          <span class="truncate text-[8px] text-zinc-400">{element.providerLabel}</span>
          <span class={`shrink-0 rounded px-1 py-0.5 text-[7px] font-semibold ${element.transparent ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{formatLabel(element)}</span>
        </div>
        <div class="mt-1 flex gap-1">
          {element.kind === "audio" && <button onClick={onPreviewAudio} class="flex h-6 flex-1 items-center justify-center gap-1 rounded border border-zinc-200 bg-white text-[8px] text-zinc-600 cursor-pointer hover:border-violet-300">{playing ? <Pause size={10} /> : <Play size={10} />} {playing ? "Pausa" : "Ascolta"}</button>}
          {(element.kind === "image" || element.kind === "gif") && element.assetUrl && <button onClick={onBackground} class="h-6 flex-1 rounded border border-zinc-200 bg-white text-[8px] text-zinc-600 cursor-pointer hover:border-violet-300">Sfondo</button>}
        </div>
      </div>
    </article>
  );
}

export function ElementsLibrary() {
  const { canvas, canvasWidth, canvasHeight, addShape, setBackground } = useEditor();
  const [category, setCategory] = useState<ElementCategory>("all");
  const [searchInput, setSearchInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [format, setFormat] = useState<(typeof FORMAT_FILTERS)[number]["value"]>("all");
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
  const [recentItems, setRecentItems] = useState<DesignElement[]>(readRecentItems);
  const [showFavorites, setShowFavorites] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const isHome = category === "all" && !submittedQuery && provider === "all" && format === "all" && !showFavorites;
  const visibleElements = useMemo(() => showFavorites ? elements.filter((element) => favorites.includes(element.id)) : elements, [elements, favorites, showFavorites]);

  const runSearch = useCallback(async (requestedPage: number, append: boolean, signal?: AbortSignal) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category, q: submittedQuery, page: String(requestedPage), page_size: "30" });
      if (provider !== "all") params.set("providers", provider);
      if (format !== "all") params.set("formats", format);
      const response = await fetch(`/api/elements-universe/search?${params}`, { credentials: "include", headers: scopedHeaders(), signal });
      const data = await response.json() as ElementSearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Ricerca elementi non disponibile");
      setProviders(data.providers);
      setWarnings(data.warnings ?? []);
      setPage(data.page);
      setNextPage(data.nextPage);
      setElements((current) => {
        const combined = append ? [...current, ...data.items] : data.items;
        return [...new Map(combined.map((element) => [element.id, element])).values()];
      });
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "Impossibile caricare gli elementi");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, submittedQuery, provider, format]);

  useEffect(() => {
    const controller = new AbortController();
    void runSearch(1, false, controller.signal);
    return () => controller.abort();
  }, [runSearch]);

  useEffect(() => () => {
    audio?.pause();
  }, [audio]);

  const rememberRecent = useCallback((element: DesignElement) => {
    setRecentItems((current) => {
      const updated = [element, ...current.filter((item) => item.id !== element.id)].slice(0, 16);
      writeRecentItems(updated);
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((current) => {
      const updated = current.includes(id) ? current.filter((item) => item !== id) : [id, ...current];
      writeIds(FAVORITES_KEY, updated);
      return updated;
    });
  }, []);

  const insertVector = useCallback(async (element: DesignElement) => {
    if (!canvas) return;
    const source = element.svg ?? (element.assetUrl ? await (await fetchProtected(element.assetUrl)).text() : null);
    if (!source) throw new Error("SVG non disponibile");
    const prepared = source.replaceAll("currentColor", color);
    const loaded = await fabric.loadSVGFromString(prepared);
    const objects = loaded.objects.filter(Boolean) as fabric.FabricObject[];
    if (objects.length === 0) throw new Error("SVG vuoto");
    const object = fabric.util.groupSVGElements(objects, loaded.options);
    const width = object.width || 256;
    const height = object.height || 256;
    const scale = Math.min((canvasWidth * 0.38) / width, (canvasHeight * 0.38) / height, 2);
    object.set({ left: canvasWidth / 2 - width * scale / 2, top: canvasHeight / 2 - height * scale / 2, scaleX: scale, scaleY: scale });
    markSvgObject(object, element.format ?? "svg");
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
      const scale = Math.min((canvasWidth * 0.65) / (image.width || 1), (canvasHeight * 0.65) / (image.height || 1), 1);
      image.set({ left: canvasWidth / 2 - (image.width || 0) * scale / 2, top: canvasHeight / 2 - (image.height || 0) * scale / 2, scaleX: scale, scaleY: scale });
      attachSourceMetadata(image, { ...element, assetUrl: stableUrl });
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.requestRenderAll();
    } finally {
      setImportingId(null);
    }
  }, [canvas, canvasWidth, canvasHeight, setBackground]);

  const insertMediaCard = useCallback(async (element: DesignElement) => {
    if (!canvas) return;
    setImportingId(element.id);
    try {
      const cardWidth = Math.min(420, canvasWidth * 0.5);
      const cardHeight = element.kind === "audio" ? 130 : cardWidth * 0.68;
      const parts: fabric.FabricObject[] = [];
      const background = new fabric.Rect({ left: 0, top: 0, width: cardWidth, height: cardHeight, rx: 22, ry: 22, fill: "#18181b", stroke: "#3f3f46", strokeWidth: 2 });
      parts.push(background);

      if (element.kind !== "audio" && element.previewUrl) {
        try {
          const posterUrl = await persistRemoteImage({ ...element, kind: "image", format: "jpg", assetUrl: element.previewUrl }, element.previewUrl);
          const poster = await fabric.FabricImage.fromURL(posterUrl, { crossOrigin: "anonymous" });
          const scale = Math.min((cardWidth - 12) / (poster.width || 1), (cardHeight - 12) / (poster.height || 1));
          poster.set({ left: 6, top: 6, scaleX: scale, scaleY: scale, opacity: 0.78 });
          parts.push(poster);
        } catch {
          // A metadata card still works when a remote preview is unavailable.
        }
      }

      const iconCircle = new fabric.Circle({ left: 24, top: cardHeight / 2 - 25, radius: 25, fill: "rgba(124,58,237,.92)" });
      parts.push(iconCircle);
      if (element.kind === "audio") {
        parts.push(new fabric.Text("♫", { left: 39, top: cardHeight / 2 - 17, fontSize: 28, fill: "#ffffff", originX: "center" }));
      } else if (element.kind === "model") {
        parts.push(new fabric.Text("3D", { left: 49, top: cardHeight / 2 - 10, fontSize: 16, fontWeight: "700", fill: "#ffffff", originX: "center" }));
      } else {
        parts.push(new fabric.Triangle({ left: 43, top: cardHeight / 2 - 12, width: 22, height: 24, angle: 90, fill: "#ffffff" }));
      }
      parts.push(new fabric.Textbox(element.name, { left: 88, top: cardHeight - 58, width: cardWidth - 110, fontSize: 18, fontWeight: "700", fill: "#ffffff" }));
      parts.push(new fabric.Textbox(`${element.providerLabel} · ${formatLabel(element)}`, { left: 88, top: cardHeight - 31, width: cardWidth - 110, fontSize: 11, fill: "#d4d4d8" }));

      const group = new fabric.Group(parts, { left: canvasWidth / 2 - cardWidth / 2, top: canvasHeight / 2 - cardHeight / 2 });
      attachSourceMetadata(group, element);
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
    } finally {
      setImportingId(null);
    }
  }, [canvas, canvasWidth, canvasHeight]);

  const insertElement = useCallback(async (element: DesignElement) => {
    try {
      if (element.kind === "vector") await insertVector(element);
      else if (element.kind === "image" || element.kind === "gif") await insertImage(element);
      else await insertMediaCard(element);
      rememberRecent(element);
    } catch (caught) {
      console.error("Unable to insert element", caught);
      setError(caught instanceof Error ? caught.message : "Questo elemento non può essere inserito");
    }
  }, [insertVector, insertImage, insertMediaCard, rememberRecent]);

  const previewAudio = useCallback((element: DesignElement) => {
    if (!element.assetUrl) return;
    if (playingId === element.id && audio) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio?.pause();
    const next = new Audio(element.assetUrl);
    next.onended = () => setPlayingId(null);
    next.onerror = () => {
      setPlayingId(null);
      setError("Anteprima audio non disponibile");
    };
    setAudio(next);
    setPlayingId(element.id);
    void next.play();
  }, [audio, playingId]);

  const selectCategory = (next: ElementCategory) => {
    setCategory(next);
    setShowFavorites(false);
    if (next !== "all") setSubmittedQuery("");
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
          onPreviewAudio={() => previewAudio(element)}
          playing={playingId === element.id}
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
          placeholder="Descrivi il tuo elemento ideale"
          class="h-11 w-full rounded-xl border border-violet-200 bg-white pl-10 pr-3 text-xs outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        />
      </div>

      <div class="grid grid-cols-[1fr_1.25fr] gap-2">
        <div class="relative">
          <button onClick={() => setGenerateOpen((value) => !value)} class="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-[10px] font-semibold text-zinc-700 cursor-pointer hover:border-violet-300"><WandSparkles size={15} class="text-violet-600" /> Genera <ChevronDown size={12} /></button>
          {generateOpen && (
            <>
              <div class="fixed inset-0 z-30" onClick={() => setGenerateOpen(false)} />
              <div class="absolute left-0 top-full z-40 mt-1 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">
                {[{ tool: "blob", label: "Genera blob" }, { tool: "pattern", label: "Genera pattern" }, { tool: "gradient", label: "Genera gradiente" }, { tool: "qr", label: "Genera QR Code" }].map((item) => <button key={item.tool} onClick={() => { setGenerateOpen(false); window.dispatchEvent(new CustomEvent("ddone:open-tool", { detail: { tool: item.tool } })); }} class="w-full rounded-lg border-0 bg-transparent px-2.5 py-2 text-left text-[10px] text-zinc-700 cursor-pointer hover:bg-zinc-100">{item.label}</button>)}
              </div>
            </>
          )}
        </div>
        <button onClick={submitSearch} class="h-10 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-xs font-semibold text-white shadow-sm cursor-pointer hover:opacity-90">Cerca</button>
      </div>

      {isHome ? (
        <>
          {recentItems.length > 0 && <section><div class="mb-2 flex items-center justify-between"><h3 class="m-0 text-[11px] font-semibold text-zinc-800">Usati di recente</h3><button onClick={() => { setElements(recentItems); setSubmittedQuery("recenti"); }} class="border-0 bg-transparent text-[9px] font-semibold text-zinc-500 cursor-pointer">Mostra tutto</button></div>{renderCards(recentItems.slice(0, 3))}</section>}
          {elements.length > 0 && <section><div class="mb-2 flex items-center justify-between"><h3 class="m-0 text-[11px] font-semibold text-zinc-800">Consigliati per te</h3><button onClick={() => setSubmittedQuery("design ristorante")} class="border-0 bg-transparent text-[9px] font-semibold text-zinc-500 cursor-pointer">Mostra tutto</button></div>{renderCards(elements.slice(0, 3))}</section>}
          <section>
            <h3 class="mb-3 text-[11px] font-semibold text-zinc-800">Sfoglia le categorie</h3>
            <div class="grid grid-cols-3 gap-x-2 gap-y-4">
              {CATEGORIES.map((item) => (
                <button key={item.key} onClick={() => selectCategory(item.key)} class="group border-0 bg-transparent p-0 text-center cursor-pointer">
                  <span class={`mx-auto mb-1.5 grid aspect-square w-[72px] place-items-center rounded-[20px] bg-gradient-to-br ${item.gradient} text-white shadow-lg transition group-hover:-translate-y-1 group-hover:shadow-xl`}><item.icon size={30} /></span>
                  <strong class="block text-[9px] font-medium text-zinc-700">{item.label}</strong>
                </button>
              ))}
            </div>
          </section>
          <div class="rounded-xl border border-violet-100 bg-violet-50/60 p-2.5"><div class="mb-1 flex items-center gap-2"><BadgeCheck size={14} class="text-violet-600" /><strong class="text-[10px] text-zinc-800">Fonti e licenze tracciate</strong></div><p class="m-0 text-[9px] leading-relaxed text-zinc-500">Ogni media conserva fonte, autore e licenza. Le immagini scelte vengono importate nello storage privato del cliente.</p></div>
        </>
      ) : (
        <>
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button onClick={() => selectCategory("all")} class="shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[9px] text-zinc-500 cursor-pointer">Home</button>
            {CATEGORIES.map((item) => <button key={item.key} onClick={() => selectCategory(item.key)} class={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] cursor-pointer ${category === item.key ? "border-violet-600 bg-violet-600 text-white" : "border-zinc-200 bg-white text-zinc-500"}`}>{item.label}</button>)}
          </div>

          <div class="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {FORMAT_FILTERS.map((item) => <button key={item.value} onClick={() => setFormat(item.value)} class={`shrink-0 rounded-lg border px-2 py-1.5 text-[8px] font-semibold cursor-pointer ${format === item.value ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-white text-zinc-500"}`}>{item.label}</button>)}
          </div>

          <div class="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button onClick={() => setProvider("all")} class={`shrink-0 rounded-full px-2.5 py-1 text-[8px] border cursor-pointer ${provider === "all" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 text-zinc-500"}`}>Tutte le fonti</button>
            {providers.filter((item) => item.enabled).map((item) => <button key={item.id} title={item.description} onClick={() => setProvider(item.id)} class={`shrink-0 rounded-full px-2.5 py-1 text-[8px] border cursor-pointer ${provider === item.id ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 text-zinc-500"}`}>{item.label}</button>)}
          </div>

          {!submittedQuery && <div class="flex flex-wrap gap-1">{QUICK_SEARCHES.map((value) => <button key={value} onClick={() => { setSearchInput(value); setSubmittedQuery(value); }} class="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[8px] text-zinc-500 cursor-pointer hover:border-violet-300 hover:text-violet-700">{value}</button>)}</div>}

          <div class="flex items-center justify-between gap-2">
            <button onClick={() => setShowFavorites((current) => !current)} class={`h-7 px-2 rounded-md border flex items-center gap-1 text-[9px] cursor-pointer ${showFavorites ? "border-rose-300 bg-rose-50 text-rose-600" : "border-zinc-200 bg-white text-zinc-500"}`}><Heart size={11} fill={showFavorites ? "currentColor" : "none"} /> Preferiti {favorites.length || ""}</button>
            <label class="flex items-center gap-1.5 text-[8px] text-zinc-400">Colore SVG<input type="color" value={color} onInput={(event) => setColor((event.target as HTMLInputElement).value)} class="w-7 h-7 rounded border border-zinc-200 p-0 cursor-pointer bg-transparent" /></label>
          </div>

          {(category === "all" || category === "shapes") && !submittedQuery && !showFavorites && <div class="grid grid-cols-4 gap-1.5">{[{ type: "rect" as const, label: "Rettangolo", icon: Square }, { type: "circle" as const, label: "Cerchio", icon: Circle }, { type: "triangle" as const, label: "Triangolo", icon: Triangle }, { type: "line" as const, label: "Linea", icon: Waves }].map((shape) => <button key={shape.type} onClick={() => addShape(shape.type)} class="aspect-square rounded-lg border border-zinc-200 bg-zinc-50 cursor-pointer flex flex-col items-center justify-center gap-1 hover:border-violet-400 hover:bg-violet-50"><shape.icon size={20} style={{ color }} /><span class="text-[8px] text-zinc-500">{shape.label}</span></button>)}</div>}

          {loading && <div class="py-10 flex items-center justify-center gap-2 text-xs text-zinc-400"><LoaderCircle size={15} class="animate-spin" /> Ricerca negli archivi…</div>}
          {error && <div class="rounded-lg bg-red-50 border border-red-100 p-2 text-[10px] text-red-600">{error}</div>}
          {warnings.length > 0 && <div class="rounded-lg bg-amber-50 border border-amber-100 p-2 text-[9px] text-amber-700">{warnings.join(" · ")}</div>}
          {!loading && renderCards(visibleElements)}
          {!loading && visibleElements.length === 0 && <div class="py-8 text-center text-xs text-zinc-400">{showFavorites ? "Nessun preferito tra questi risultati" : "Nessun elemento trovato"}</div>}
          {!loading && nextPage && !showFavorites && <button disabled={loadingMore} onClick={() => void runSearch(page + 1, true)} class="w-full h-9 rounded-lg border border-zinc-200 bg-white text-[10px] text-zinc-600 cursor-pointer hover:border-violet-400 disabled:opacity-50">{loadingMore ? "Caricamento…" : "Carica altri risultati"}</button>}
        </>
      )}
    </div>
  );
}
