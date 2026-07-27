import { useMemo, useState } from "preact/hooks";
import { Maximize2 } from "lucide-preact";
import { useEditor } from "../context";
import { STATIC_FORMAT_PRESETS, smartResizeCanvas, type SmartResizeMode } from "../canvas/smart-resize";

export function SmartResizePanel() {
  const { canvas, canvasWidth, canvasHeight, setCanvasSize } = useEditor();
  const [width, setWidth] = useState(canvasWidth);
  const [height, setHeight] = useState(canvasHeight);
  const [mode, setMode] = useState<SmartResizeMode>("balanced");
  const [message, setMessage] = useState<string | null>(null);
  const groups = useMemo(() => [...new Set(STATIC_FORMAT_PRESETS.map((preset) => preset.group))], []);

  const apply = () => {
    if (!canvas) {
      setMessage("Apri e seleziona una pagina prima di ridimensionare.");
      return;
    }
    const result = smartResizeCanvas(canvas, canvasWidth, canvasHeight, width, height, mode);
    setCanvasSize(result.width, result.height);
    setMessage(`${result.movedObjects} elementi riposizionati, ${result.scaledObjects} ridimensionati.`);
  };

  return (
    <aside class="flex h-full w-[300px] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <div class="border-b border-zinc-200 p-4 pt-12">
        <div class="mb-1 flex items-center gap-2">
          <Maximize2 size={16} class="text-violet-600" />
          <h2 class="m-0 text-xs font-semibold text-zinc-800">Smart Resize</h2>
        </div>
        <p class="m-0 text-[9px] leading-relaxed text-zinc-400">Adatta la pagina corrente ai formati statici mantenendo posizione relativa, proporzioni e sfondo.</p>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        {groups.map((group) => (
          <section key={group} class="mb-4">
            <strong class="mb-2 block text-[9px] text-zinc-500">{group}</strong>
            <div class="grid grid-cols-2 gap-2">
              {STATIC_FORMAT_PRESETS.filter((preset) => preset.group === group).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => { setWidth(preset.width); setHeight(preset.height); }}
                  class={`rounded-xl border p-2 text-left cursor-pointer ${width === preset.width && height === preset.height ? "border-violet-500 bg-violet-50" : "border-zinc-200 bg-white hover:border-violet-300"}`}
                >
                  <span class="block text-[9px] font-semibold text-zinc-700">{preset.label}</span>
                  <span class="text-[8px] text-zinc-400">{preset.width} × {preset.height}</span>
                </button>
              ))}
            </div>
          </section>
        ))}

        <div class="grid grid-cols-2 gap-2">
          <label class="text-[9px] font-semibold text-zinc-500">
            Larghezza
            <input type="number" min="64" max="10000" value={width} onInput={(event) => setWidth(Number((event.target as HTMLInputElement).value))} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs outline-none focus:border-violet-400" />
          </label>
          <label class="text-[9px] font-semibold text-zinc-500">
            Altezza
            <input type="number" min="64" max="10000" value={height} onInput={(event) => setHeight(Number((event.target as HTMLInputElement).value))} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-2 text-xs outline-none focus:border-violet-400" />
          </label>
        </div>

        <label class="mt-4 block text-[9px] font-semibold text-zinc-500">
          Strategia
          <select value={mode} onChange={(event) => setMode((event.target as HTMLSelectElement).value as SmartResizeMode)} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs outline-none focus:border-violet-400">
            <option value="balanced">Bilanciata: scala uniforme</option>
            <option value="position-only">Solo layout: non scala gli oggetti</option>
            <option value="stretch">Adatta X e Y indipendentemente</option>
          </select>
        </label>

        <button onClick={apply} class="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-xs font-semibold text-white cursor-pointer">
          <Maximize2 size={15} /> Applica alla pagina
        </button>
        {message && <p class="mt-2 rounded-lg bg-zinc-50 p-2 text-[9px] text-zinc-500">{message}</p>}
      </div>
    </aside>
  );
}
