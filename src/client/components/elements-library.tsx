import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import {
  Circle,
  Frame,
  GlassWater,
  Grid2X2,
  Image as ImageIcon,
  Pizza,
  Search,
  Share2,
  Sparkles,
  Square,
  Triangle,
} from "lucide-preact";
import * as fabric from "fabric";
import { api } from "../api";
import { useEditor } from "../context";
import type { DesignElement } from "../types";

const CATEGORIES = [
  { key: "all", label: "All", icon: Grid2X2 },
  { key: "shapes", label: "Shapes", icon: Square },
  { key: "icons", label: "Icons", icon: Sparkles },
  { key: "ornaments", label: "Ornaments", icon: Sparkles },
  { key: "frames", label: "Frames", icon: Frame },
  { key: "food", label: "Food", icon: Pizza },
  { key: "cocktails", label: "Cocktails", icon: GlassWater },
  { key: "backgrounds", label: "Backgrounds", icon: ImageIcon },
  { key: "social", label: "Social", icon: Share2 },
] as const;

type Category = (typeof CATEGORIES)[number]["key"];

function svgPreview(svg: string, color: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg.replaceAll("currentColor", color),
  )}`;
}

export function ElementsLibrary() {
  const { canvas, canvasWidth, canvasHeight, addShape } = useEditor();
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [color, setColor] = useState("#171717");
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => search.trim(), [search]);

  useEffect(() => {
    if (category === "shapes") {
      setElements([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ category, q: query });
        const result = await api<DesignElement[]>("GET", `/api/elements/search?${params}`);
        if (!controller.signal.aborted) setElements(result);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Unable to load elements");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [category, query]);

  const insertElement = useCallback(
    async (element: DesignElement) => {
      if (!canvas) return;
      try {
        const source = element.svg ?? (element.svgUrl ? await api<string>("GET", element.svgUrl) : null);
        if (!source) return;
        const colored = source.replaceAll("currentColor", color);
        const loaded = await fabric.loadSVGFromString(colored);
        const objects = loaded.objects.filter(Boolean) as fabric.FabricObject[];
        if (objects.length === 0) return;
        const object = fabric.util.groupSVGElements(objects, loaded.options);
        const width = object.width || 256;
        const height = object.height || 256;
        const maximumWidth = canvasWidth * 0.32;
        const maximumHeight = canvasHeight * 0.32;
        const scale = Math.min(maximumWidth / width, maximumHeight / height, 1.5);
        object.set({
          left: canvasWidth / 2 - (width * scale) / 2,
          top: canvasHeight / 2 - (height * scale) / 2,
          scaleX: scale,
          scaleY: scale,
        });
        canvas.add(object);
        canvas.setActiveObject(object);
        canvas.requestRenderAll();
      } catch (caught) {
        console.error("Unable to insert element", caught);
        setError("This element could not be inserted.");
      }
    },
    [canvas, canvasWidth, canvasHeight, color],
  );

  return (
    <div class="flex flex-col gap-3">
      <div class="relative">
        <Search size={15} class="absolute left-2.5 top-2.5 text-zinc-400" />
        <input
          value={search}
          onInput={(event) => setSearch((event.target as HTMLInputElement).value)}
          placeholder="Search icons and elements"
          class="w-full h-9 rounded-lg border border-zinc-200 bg-zinc-50 pl-8 pr-2 text-xs outline-none focus:border-accent focus:bg-white"
        />
      </div>

      <div class="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            title={item.label}
            onClick={() => setCategory(item.key)}
            class={`shrink-0 h-8 px-2 rounded-lg border cursor-pointer flex items-center gap-1.5 text-[10px] transition-colors ${
              category === item.key
                ? "border-accent bg-accent/10 text-accent"
                : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
            }`}
          >
            <item.icon size={13} />
            {item.label}
          </button>
        ))}
      </div>

      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase tracking-wide font-semibold text-zinc-400">
          {CATEGORIES.find((item) => item.key === category)?.label}
        </span>
        <label class="flex items-center gap-1.5 text-[10px] text-zinc-400">
          Color
          <input
            type="color"
            value={color}
            onInput={(event) => setColor((event.target as HTMLInputElement).value)}
            class="w-6 h-6 rounded border border-zinc-200 p-0 cursor-pointer bg-transparent"
          />
        </label>
      </div>

      {(category === "all" || category === "shapes") && !query && (
        <div class="grid grid-cols-3 gap-2">
          {[
            { type: "rect" as const, label: "Rectangle", icon: Square },
            { type: "circle" as const, label: "Circle", icon: Circle },
            { type: "triangle" as const, label: "Triangle", icon: Triangle },
          ].map((shape) => (
            <button
              key={shape.type}
              onClick={() => addShape(shape.type)}
              class="aspect-square rounded-lg border border-zinc-200 bg-zinc-50 cursor-pointer flex flex-col items-center justify-center gap-1 hover:border-accent hover:bg-accent/5"
            >
              <shape.icon size={25} style={{ color }} />
              <span class="text-[9px] text-zinc-500">{shape.label}</span>
            </button>
          ))}
        </div>
      )}

      {loading && <div class="py-8 text-center text-xs text-zinc-400">Searching…</div>}
      {error && <div class="rounded-lg bg-red-50 border border-red-100 p-2 text-[11px] text-red-600">{error}</div>}

      {!loading && category !== "shapes" && (
        <div class="grid grid-cols-3 gap-2">
          {elements.map((element) => (
            <button
              key={element.id}
              title={`${element.name} · ${element.license}`}
              onClick={() => void insertElement(element)}
              class="aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 cursor-pointer flex flex-col items-center justify-center gap-1.5 p-2 hover:border-accent hover:bg-accent/5"
            >
              {element.svg ? (
                <img
                  src={svgPreview(element.svg, color)}
                  alt=""
                  class="w-11 h-11 object-contain"
                />
              ) : (
                <div class="w-11 h-11 grid place-items-center rounded bg-white border border-zinc-100 text-[9px] text-zinc-400 text-center leading-tight">
                  SVG
                </div>
              )}
              <span class="w-full truncate text-[9px] text-zinc-500">{element.name}</span>
            </button>
          ))}
        </div>
      )}

      {!loading && category !== "shapes" && elements.length === 0 && query && (
        <div class="py-8 text-center text-xs text-zinc-400">No elements found</div>
      )}
      {category === "icons" && !query && (
        <p class="text-[10px] text-zinc-400 leading-relaxed m-0">
          Search at least two characters to browse the allowlisted Iconify collections.
        </p>
      )}
    </div>
  );
}
