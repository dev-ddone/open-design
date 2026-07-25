import { useEffect, useState } from "preact/hooks";
import { Lock, LockOpen, Save, X } from "lucide-preact";
import { api, getActiveClientId } from "../api";
import { useEditor } from "../context";
import type { Template } from "../types";

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function TemplateManager({ onClose }: { onClose: () => void }) {
  const {
    selectedObject,
    setSelectedTemplateLock,
    buildTemplateRules,
    getCanvasJSON,
    canvasWidth,
    canvasHeight,
    activeDesign,
    refreshLibrary,
  } = useEditor() as any;
  const [name, setName] = useState(`${activeDesign?.name ?? "Design"} template`);
  const [id, setId] = useState("");
  const [category, setCategory] = useState("custom");
  const [mode, setMode] = useState<"unlocked" | "locked" | "regions">("regions");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!id) setId(slugify(name)); }, [name]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api<Template>("POST", "/api/templates", {
        id,
        name,
        category,
        canvas_json: getCanvasJSON(),
        width: canvasWidth,
        height: canvasHeight,
        client_id: getActiveClientId(),
        edit_rules: buildTemplateRules(mode),
      });
      await refreshLibrary?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm grid place-items-center p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section class="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden">
        <header class="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div>
            <h2 class="m-0 text-base font-semibold text-zinc-900">Create reusable template</h2>
            <p class="m-0 mt-1 text-xs text-zinc-400">Choose exactly which canvas objects a user may edit.</p>
          </div>
          <button class="w-8 h-8 grid place-items-center rounded-lg border-0 bg-zinc-100 text-zinc-500 cursor-pointer" onClick={onClose}><X size={16} /></button>
        </header>

        <div class="p-5 space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <label class="text-xs font-medium text-zinc-600">Name
              <input value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} class="mt-1.5 w-full h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-accent" />
            </label>
            <label class="text-xs font-medium text-zinc-600">Identifier
              <input value={id} onInput={(event) => setId(slugify((event.target as HTMLInputElement).value))} class="mt-1.5 w-full h-10 rounded-lg border border-zinc-300 px-3 text-sm font-mono outline-none focus:border-accent" />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="text-xs font-medium text-zinc-600">Category
              <input value={category} onInput={(event) => setCategory((event.target as HTMLInputElement).value)} class="mt-1.5 w-full h-10 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-accent" />
            </label>
            <label class="text-xs font-medium text-zinc-600">Editing policy
              <select value={mode} onChange={(event) => setMode((event.target as HTMLSelectElement).value as typeof mode)} class="mt-1.5 w-full h-10 rounded-lg border border-zinc-300 px-3 text-sm bg-white outline-none focus:border-accent">
                <option value="unlocked">Everything editable</option>
                <option value="locked">Everything locked except marked editable</option>
                <option value="regions">Selective editable and locked objects</option>
              </select>
            </label>
          </div>

          <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p class="m-0 text-xs font-semibold text-zinc-700">Selected object</p>
            <p class="mt-1 mb-3 text-[11px] text-zinc-400">Select an object on the canvas, then mark it editable or locked. The state is embedded in the template JSON.</p>
            <div class="flex gap-2">
              <button disabled={!selectedObject} onClick={() => setSelectedTemplateLock(false)} class="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold cursor-pointer disabled:opacity-40"><LockOpen size={14} /> Mark editable</button>
              <button disabled={!selectedObject} onClick={() => setSelectedTemplateLock(true)} class="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold cursor-pointer disabled:opacity-40"><Lock size={14} /> Lock object</button>
            </div>
          </div>

          {error && <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          <button disabled={saving || !name.trim() || !id} onClick={() => void save()} class="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl border-0 bg-accent text-white font-semibold cursor-pointer disabled:opacity-50"><Save size={15} /> {saving ? "Saving template…" : "Save template"}</button>
        </div>
      </section>
    </div>
  );
}
