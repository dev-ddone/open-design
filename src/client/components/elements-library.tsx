import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import {
  BadgeCheck,
  Circle,
  Frame,
  GlassWater,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  Palette,
  Pizza,
  Search,
  Share2,
  Sparkles,
  Square,
  Sticker,
  Triangle,
  Waves,
} from "lucide-preact";
import * as fabric from "fabric";
import { getActiveClientId, scopedHeaders } from "../api";
import { ensureObjectId, type DDoneFabricObject } from "../canvas-model";
import { useEditor } from "../context";
import type {
  DesignElement,
  ElementCategory,
  ElementProvider,
  ElementSearchResponse,
} from "../types";

const CATEGORIES: Array<{ key: ElementCategory; label: string; icon: typeof Grid2X2 }> = [
  { key: "all", label: "Tutto", icon: Grid2X2 },
  { key: "icons", label: "Icone", icon: Sparkles },
  { key: "illustrations", label: "Illustrazioni", icon: Images },
  { key: "photos", label: "Foto", icon: ImageIcon },
  { key: "emoji", label: "Emoji", icon: Sticker },
  { key: "ornaments", label: "Ornamenti", icon: Sparkles },
  { key: "frames", label: "Cornici", icon: Frame },
  { key: "food", label: "Cibo", icon: Pizza },
  { key: "cocktails", label: "Cocktail", icon: GlassWater },
  { key: "backgrounds", label: "Sfondi", icon: Palette },
  { key: "patterns", label: "Pattern", icon: Waves },
  { key: "social", label: "Social", icon: Share2 },
];

const QUICK_SEARCHES = [
  "menu elegante",
  "ornamento floreale",
  "pizza",
  "cocktail",
  "caffè",
  "cornice dorata",
  "sfondo carta",
  "illustrazione ristorante",
  "social media",
  "festa estiva",
];

const FAVORITES_KEY = "ddone_design_element_favorites";
const RECENTS_KEY = "ddone_design_element_recents";

function readIds(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]): void {
  localStorage.setItem(key, JSON.stringify(ids.slice(0, 80)));
}

function svgPreview(svg: string, color: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg.replaceAll("currentColor", color),
  )}`;
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
      // Keep the generic message for non-JSON upstream errors.
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

async function persistRemoteImage(element: DesignElement): Promise<string> {
  if (!element.assetUrl) throw new Error("Immagine remota non disponibile");
  if (element.provider === "uploads" && element.assetUrl.startsWith("/api/assets/")) {
    return element.assetUrl;
  }

  const remoteResponse = await fetchProtected(element.assetUrl);
  const blob = await remoteResponse.blob();
  if (!blob.type.startsWith("image/")) throw new Error("La sorgente non ha restituito un’immagine");
  if (blob.size > 25 * 1024 * 1024) throw new Error("L’immagine supera il limite di 25 MB");

  const extension = extensionForMime(blob.type);
  const file = new File(
    [blob],
    `${safeFilename(element.name)}-${safeFilename(element.provider)}.${extension}`,
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
  if (!response.ok || !data.url) {
    throw new Error(data.error ?? "Impossibile importare l’immagine nella libreria privata");
  }
  return data.url;
}

function AssetPreview({ element, color }: { element: DesignElement; color: string }) {
  const [url, setUrl] = useState<string | null>(element.svg ? svgPreview(element.svg, color) : null);

  useEffect(() => {
    if (element.svg) {
      setUrl(svgPreview(element.svg, color));
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

  if (!url) {
    return <div class="w-full h-full grid place-items-center text-[9px] text-zinc-400">Anteprima</div>;
  }
  return <img src={url} alt="" class="w-full h-full object-contain" loading="lazy" />;
}

export function ElementsLibrary() {
  const { canvas, canvasWidth, canvasHeight, addShape, setBackground } = useEditor();
  const [category, setCategory] = useState<ElementCategory>("all");
  const [search, setSearch] = useState("");
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
  const [recents, setRecents] = useState<string[]>(() => readIds(RECENTS_KEY));
  const [showFavorites, setShowFavorites] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  const query = useMemo(() => search.trim(), [search]);
  const visibleElements = useMemo(() => {
    if (!showFavorites) return elements;
    const favoriteSet = new Set(favorites);
    return elements.filter((element) => favoriteSet.has(element.id));
  }, [elements, favorites, showFavorites]);

  const runSearch = useCallback(async (requestedPage: number, append: boolean, signal?: AbortSignal) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category,
        q: query,
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
        return [...new Map(combined.map((element) => [element.id, element])).values()];
      });
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        setError(caught instanceof Error ? caught.message : "Impossibile caricare gli elementi");
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, provider, query]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void runSearch(1, false, controller.signal), query ? 320 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [runSearch]);

  const rememberRecent = useCallback((id: string) => {
    setRecents((current) => {
      const updated = [id, ...current.filter((item) => item !== id)].slice(0, 40);
      writeIds(RECENTS_KEY, updated);
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
    const scale = Math.min((canvasWidth * 0.38) / width, (canvasHeight * 0.38) / height, 2);
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
      rememberRecent(element.id);
    } catch (caught) {
      console.error("Unable to insert element", caught);
      setError(caught instanceof Error ? caught.message : "Questo elemento non può essere inserito");
    }
  }, [insertImage, insertVector, rememberRecent]);

  return (
    <div class="flex flex-col gap-3">
      <div class="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-2.5">
        <div class="flex items-center gap-2 mb-1">
          <BadgeCheck size={14} class="text-violet-600" />
          <strong class="text-[11px] text-zinc-800">Ricerca open federata</strong>
        </div>
        <p class="m-0 text-[10px] leading-relaxed text-zinc-500">
          Icone, emoji, illustrazioni e foto aperte da più archivi. Le foto scelte vengono importate nella libreria privata; licenza e autore restano collegati all’oggetto.
        </p>
      </div>

      <div class="relative">
        <Search size={15} class="absolute left-2.5 top-2.5 text-zinc-400" />
        <input
          value={search}
          onInput={(event) => setSearch((event.target as HTMLInputElement).value)}
          placeholder="Cerca qualunque elemento…"
          class="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-2 text-xs outline-none focus:border-accent focus:bg-white"
        />
      </div>

      <div class="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            title={item.label}
            onClick={() => {
              setCategory(item.key);
              setShowFavorites(false);
            }}
            class={`shrink-0 h-8 px-2 rounded-lg border cursor-pointer flex items-center gap-1.5 text-[10px] transition-colors ${
              category === item.key && !showFavorites
                ? "border-accent bg-accent/10 text-accent"
                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
            }`}
          >
            <item.icon size={13} /> {item.label}
          </button>
        ))}
      </div>

      <div class="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setProvider("all")}
          class={`shrink-0 rounded-full px-2.5 py-1 text-[9px] border cursor-pointer ${provider === "all" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 text-zinc-500"}`}
        >
          Tutte le fonti
        </button>
        {providers.map((item) => (
          <button
            key={item.id}
            title={item.description}
            onClick={() => setProvider(item.id)}
            class={`shrink-0 rounded-full px-2.5 py-1 text-[9px] border cursor-pointer ${provider === item.id ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 text-zinc-500"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!query && (
        <div class="flex flex-wrap gap-1">
          {QUICK_SEARCHES.map((value) => (
            <button
              key={value}
              onClick={() => setSearch(value)}
              class="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[9px] text-zinc-500 cursor-pointer hover:border-accent hover:text-accent"
            >
              {value}
            </button>
          ))}
        </div>
      )}

      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <button
            onClick={() => setShowFavorites((current) => !current)}
            class={`h-7 px-2 rounded-md border flex items-center gap-1 text-[9px] cursor-pointer ${showFavorites ? "border-rose-300 bg-rose-50 text-rose-600" : "border-zinc-200 bg-white text-zinc-500"}`}
          >
            <Heart size={11} fill={showFavorites ? "currentColor" : "none"} /> Preferiti {favorites.length || ""}
          </button>
          {recents.length > 0 && <span class="text-[9px] text-zinc-400">{recents.length} recenti</span>}
        </div>
        <label class="flex items-center gap-1.5 text-[9px] text-zinc-400">
          Colore SVG
          <input
            type="color"
            value={color}
            onInput={(event) => setColor((event.target as HTMLInputElement).value)}
            class="w-6 h-6 rounded border border-zinc-200 p-0 cursor-pointer bg-transparent"
          />
        </label>
      </div>

      {(category === "all" || category === "icons") && !query && !showFavorites && (
        <div class="grid grid-cols-4 gap-1.5">
          {[
            { type: "rect" as const, label: "Rettangolo", icon: Square },
            { type: "circle" as const, label: "Cerchio", icon: Circle },
            { type: "triangle" as const, label: "Triangolo", icon: Triangle },
            { type: "line" as const, label: "Linea", icon: Waves },
          ].map((shape) => (
            <button
              key={shape.type}
              onClick={() => addShape(shape.type)}
              class="aspect-square rounded-lg border border-zinc-200 bg-zinc-50 cursor-pointer flex flex-col items-center justify-center gap-1 hover:border-accent hover:bg-accent/5"
            >
              <shape.icon size={20} style={{ color }} />
              <span class="text-[8px] text-zinc-500">{shape.label}</span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div class="py-10 flex items-center justify-center gap-2 text-xs text-zinc-400">
          <LoaderCircle size={15} class="animate-spin" /> Ricerca negli archivi aperti…
        </div>
      )}
      {error && <div class="rounded-lg bg-red-50 border border-red-100 p-2 text-[10px] text-red-600">{error}</div>}
      {warnings.length > 0 && (
        <div class="rounded-lg bg-amber-50 border border-amber-100 p-2 text-[9px] text-amber-700">
          {warnings.join(" · ")}
        </div>
      )}

      {!loading && (
        <div class="grid grid-cols-3 gap-2">
          {visibleElements.map((element) => {
            const favorite = favorites.includes(element.id);
            const recent = recents.includes(element.id);
            const importing = importingId === element.id;
            return (
              <div
                key={element.id}
                class={`group relative overflow-hidden rounded-lg border bg-zinc-50 hover:border-accent hover:bg-accent/5 ${recent ? "border-violet-200" : "border-zinc-200"}`}
              >
                <button
                  disabled={importing}
                  title={`${element.name} · ${element.providerLabel} · ${element.license}`}
                  onClick={() => void insertElement(element)}
                  class="w-full aspect-square p-2 bg-transparent border-0 cursor-pointer disabled:opacity-50"
                >
                  {importing ? <LoaderCircle size={18} class="animate-spin mx-auto text-violet-600" /> : <AssetPreview element={element} color={color} />}
                </button>
                <button
                  title={favorite ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
                  onClick={() => toggleFavorite(element.id)}
                  class="absolute top-1 right-1 w-6 h-6 rounded-full border border-white/70 bg-white/90 grid place-items-center text-zinc-500 cursor-pointer opacity-0 group-hover:opacity-100"
                >
                  <Heart size={11} fill={favorite ? "currentColor" : "none"} class={favorite ? "text-rose-500" : ""} />
                </button>
                <div class="px-1.5 pb-1.5">
                  <div class="truncate text-[9px] font-medium text-zinc-600">{element.name}</div>
                  <div class="truncate text-[8px] text-zinc-400">{element.providerLabel}</div>
                  <div class="flex items-center justify-between gap-1 mt-1">
                    <span class="truncate text-[7px] text-zinc-400">{element.license}</span>
                    {element.kind === "image" && element.assetUrl && (
                      <button
                        disabled={importing}
                        title="Importa e usa come sfondo"
                        onClick={() => void insertImage(element, true)}
                        class="rounded px-1 py-0.5 border border-zinc-200 bg-white text-[7px] text-zinc-500 cursor-pointer hover:border-accent disabled:opacity-50"
                      >
                        Sfondo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && visibleElements.length === 0 && (
        <div class="py-8 text-center text-xs text-zinc-400">
          {showFavorites ? "Nessun preferito tra questi risultati" : "Nessun elemento trovato"}
        </div>
      )}

      {!loading && nextPage && !showFavorites && (
        <button
          disabled={loadingMore}
          onClick={() => void runSearch(page + 1, true)}
          class="w-full h-9 rounded-lg border border-zinc-200 bg-white text-[10px] text-zinc-600 cursor-pointer hover:border-accent disabled:opacity-50"
        >
          {loadingMore ? "Caricamento…" : "Carica altri risultati"}
        </button>
      )}

      <p class="m-0 text-[9px] leading-relaxed text-zinc-400">
        Le risorse restano soggette alla licenza indicata. Le immagini remote selezionate vengono copiate nello storage privato; autore, fonte e licenza vengono salvati sia nell’asset sia nell’oggetto del progetto.
      </p>
    </div>
  );
}
