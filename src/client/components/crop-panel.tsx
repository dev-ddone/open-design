import { Check, Crop, Image as ImageIcon, RotateCcw, X } from "lucide-preact";
import { useEditor, type CropAspect } from "../context";

const ASPECTS: Array<{ value: CropAspect; label: string; detail: string }> = [
  { value: "free", label: "Libera", detail: "Ritaglio manuale" },
  { value: "original", label: "Originale", detail: "Proporzioni sorgente" },
  { value: "1:1", label: "1:1", detail: "Quadrato" },
  { value: "4:5", label: "4:5", detail: "Post verticale" },
  { value: "16:9", label: "16:9", detail: "Orizzontale" },
];

function Range({
  label,
  value,
  min,
  max,
  step,
  onInput,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onInput: (value: number) => void;
}) {
  return (
    <label class="block">
      <div class="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span>{label}</span>
        <span class="font-mono text-zinc-400">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(event) => onInput(Number((event.target as HTMLInputElement).value))}
        class="w-full accent-violet-600"
      />
    </label>
  );
}

export function CropPanel() {
  const { cropState, updateCrop, applyCrop, cancelCrop } = useEditor();
  if (!cropState.active) return null;

  return (
    <aside class="absolute left-[70px] top-[44px] bottom-0 z-50 flex w-[330px] flex-col border-r border-zinc-200 bg-white shadow-2xl">
      <header class="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div class="flex items-center gap-2">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-600"><Crop size={17} /></span>
          <div>
            <h2 class="m-0 text-sm font-semibold text-zinc-900">Ritaglia immagine</h2>
            <p class="m-0 text-[10px] text-zinc-400">Doppio clic sull’immagine per riaprire</p>
          </div>
        </div>
        <button onClick={cancelCrop} class="grid h-8 w-8 place-items-center rounded-lg border-0 bg-transparent text-zinc-400 cursor-pointer hover:bg-zinc-100 hover:text-zinc-800"><X size={17} /></button>
      </header>

      <div class="flex-1 overflow-y-auto p-4">
        <button
          onClick={() => updateCrop({ aspect: "original", zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 })}
          class="mb-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-xs font-semibold text-white cursor-pointer hover:opacity-90"
        >
          <ImageIcon size={15} /> Ritaglio intelligente
        </button>

        <h3 class="mb-2 text-[11px] font-semibold text-zinc-700">Proporzioni</h3>
        <div class="grid grid-cols-3 gap-2">
          {ASPECTS.map((aspect) => (
            <button
              key={aspect.value}
              onClick={() => updateCrop({ aspect: aspect.value, zoom: 1, offsetX: 0, offsetY: 0 })}
              title={aspect.detail}
              class={`min-h-20 rounded-xl border p-2 text-center cursor-pointer transition ${
                cropState.aspect === aspect.value
                  ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300"
              }`}
            >
              <span class={`mx-auto mb-2 block border-2 ${
                aspect.value === "1:1" ? "h-6 w-6" : aspect.value === "4:5" ? "h-7 w-5" : aspect.value === "16:9" ? "h-4 w-8" : "h-6 w-8 border-dashed"
              } rounded border-current`} />
              <span class="block text-[10px] font-semibold">{aspect.label}</span>
            </button>
          ))}
        </div>

        <div class="my-5 h-px bg-zinc-200" />
        <div class="flex flex-col gap-4">
          <Range label="Zoom" value={cropState.zoom} min={1} max={4} step={0.05} onInput={(zoom) => updateCrop({ zoom })} />
          <Range label="Posizione orizzontale" value={cropState.offsetX} min={-1} max={1} step={0.02} onInput={(offsetX) => updateCrop({ offsetX })} />
          <Range label="Posizione verticale" value={cropState.offsetY} min={-1} max={1} step={0.02} onInput={(offsetY) => updateCrop({ offsetY })} />
          <Range label="Rotazione" value={cropState.rotation} min={-180} max={180} step={1} onInput={(rotation) => updateCrop({ rotation })} />
        </div>

        <button
          onClick={() => updateCrop({ aspect: "free", zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 })}
          class="mt-5 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white text-[10px] font-medium text-zinc-600 cursor-pointer hover:bg-zinc-50"
        >
          <RotateCcw size={13} /> Reimposta controlli
        </button>
      </div>

      <footer class="grid grid-cols-2 gap-2 border-t border-zinc-200 p-4">
        <button onClick={cancelCrop} class="h-10 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 cursor-pointer hover:bg-zinc-50">Annulla</button>
        <button onClick={applyCrop} class="flex h-10 items-center justify-center gap-2 rounded-lg border-0 bg-violet-600 text-xs font-semibold text-white cursor-pointer hover:bg-violet-700"><Check size={15} /> Fatto</button>
      </footer>
    </aside>
  );
}
