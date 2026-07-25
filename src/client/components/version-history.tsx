import { useEffect, useState } from "preact/hooks";
import { Clock3, Plus, RotateCcw, X } from "lucide-preact";
import { useEditor } from "../context";

export function VersionHistory({ onClose }: { onClose: () => void }) {
  const {
    activeDesign,
    versions,
    versionsLoading,
    loadVersions,
    createVersion,
    restoreVersion,
    readOnly,
  } = useEditor();
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void loadVersions(activeDesign?.id); }, [activeDesign?.id]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      await createVersion(label.trim() || "Manual snapshot", "manual");
      setLabel("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create version");
    } finally {
      setCreating(false);
    }
  };

  const restore = async (id: string) => {
    if (!confirm("Restore this version? A safety snapshot of the current design will be created first.")) return;
    setRestoring(id);
    setError(null);
    try {
      await restoreVersion(id);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to restore version");
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div class="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm grid place-items-center p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section class="w-full max-w-2xl max-h-[82vh] bg-white rounded-2xl shadow-2xl border border-zinc-200 flex flex-col overflow-hidden">
        <header class="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <div>
            <h2 class="m-0 text-base font-semibold text-zinc-900">Version history</h2>
            <p class="m-0 mt-1 text-xs text-zinc-400">Persistent snapshots for {activeDesign?.name}</p>
          </div>
          <button class="w-8 h-8 grid place-items-center rounded-lg border-0 bg-zinc-100 text-zinc-500 cursor-pointer" onClick={onClose}><X size={16} /></button>
        </header>

        {!readOnly && (
          <div class="grid grid-cols-[1fr_auto] gap-2 p-4 border-b border-zinc-100 bg-zinc-50">
            <input
              value={label}
              onInput={(event) => setLabel((event.target as HTMLInputElement).value)}
              placeholder="Snapshot label, for example Client approved"
              class="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-accent"
            />
            <button disabled={creating} onClick={() => void create()} class="h-10 inline-flex items-center gap-1.5 rounded-lg border-0 bg-accent text-white px-4 text-xs font-semibold cursor-pointer disabled:opacity-60">
              <Plus size={14} /> {creating ? "Creating…" : "Create snapshot"}
            </button>
          </div>
        )}

        {error && <div class="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

        <div class="flex-1 overflow-y-auto p-4">
          {versionsLoading ? (
            <div class="py-12 text-center text-xs text-zinc-400">Loading versions…</div>
          ) : versions.length === 0 ? (
            <div class="py-12 text-center text-xs text-zinc-400">No versions have been created yet.</div>
          ) : (
            <div class="border border-zinc-200 rounded-xl overflow-hidden">
              {versions.map((version, index) => (
                <div key={version.id} class={`flex items-center gap-3 px-4 py-3 ${index ? "border-t border-zinc-100" : ""}`}>
                  <span class="w-9 h-9 rounded-full bg-accent/10 text-accent grid place-items-center shrink-0"><Clock3 size={16} /></span>
                  <div class="min-w-0 flex-1">
                    <p class="m-0 text-sm font-medium text-zinc-800 truncate">{version.label || version.source}</p>
                    <p class="m-0 mt-0.5 text-[11px] text-zinc-400">
                      {new Date(version.created_at).toLocaleString()} · {version.created_by_name || "System"} · {version.source}
                    </p>
                  </div>
                  {!readOnly && (
                    <button
                      disabled={restoring === version.id}
                      onClick={() => void restore(version.id)}
                      class="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-600 cursor-pointer hover:border-accent hover:text-accent disabled:opacity-50"
                    >
                      <RotateCcw size={12} /> {restoring === version.id ? "Restoring…" : "Restore"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
