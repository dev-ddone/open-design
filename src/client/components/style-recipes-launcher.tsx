import { Paintbrush } from "lucide-preact";
import { useEditor } from "../context";

export function StyleRecipesLauncher() {
  const { canvas, readOnly } = useEditor();
  if (readOnly || !canvas?.getActiveObject()) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("ddone:open-style-recipes"))}
      title="Ricette di stile"
      class="absolute right-[212px] top-2 z-[72] flex h-8 items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2 text-[8px] font-semibold text-fuchsia-700 shadow-sm cursor-pointer hover:bg-fuchsia-100"
    >
      <Paintbrush size={13} /> Stili
    </button>
  );
}