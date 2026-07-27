import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { Blocks, ExternalLink, Play, Plus, Power, Settings2, Trash2, X } from "lucide-preact";
import * as fabric from "fabric";
import { api, getActiveClientId } from "../api";
import { ensureObjectId } from "../canvas-model";
import { useEditor } from "../context";
import {
  EXAMPLE_PLUGIN_MANIFEST,
  interpolatePluginValue,
  parsePluginManifest,
  pluginConfigurationDefaults,
  type InstalledPlugin,
  type PluginCommand,
  type StudioPluginManifest,
} from "../plugins/sdk";

export function PluginManager() {
  const { canvas, activeDesign, readOnly } = useEditor();
  const [open, setOpen] = useState(false);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manifestText, setManifestText] = useState(JSON.stringify(EXAMPLE_PLUGIN_MANIFEST, null, 2));
  const [configuration, setConfiguration] = useState<Record<string, unknown>>({});
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<InstalledPlugin[]>("GET", "/api/plugins");
      setPlugins(result);
      setSelectedId((current) => current && result.some((plugin) => plugin.id === current) ? current : result[0]?.id ?? null);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Plugin non disponibili");
    }
  }, []);

  useEffect(() => {
    const show = () => { setOpen(true); void load(); };
    window.addEventListener("ddone:open-plugin-manager", show);
    return () => window.removeEventListener("ddone:open-plugin-manager", show);
  }, [load]);

  const selected = useMemo(() => plugins.find((plugin) => plugin.id === selectedId) ?? null, [plugins, selectedId]);
  useEffect(() => { setConfiguration(selected?.configuration ?? {}); }, [selected?.id]);

  const install = async () => {
    setInstalling(true); setMessage(null);
    try {
      const manifest = parsePluginManifest(manifestText);
      await api("POST", "/api/plugins", {
        clientId: getActiveClientId(),
        manifest,
        configuration: pluginConfigurationDefaults(manifest),
        enabled: true,
      });
      await load();
      setMessage(`${manifest.name} installato.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Installazione non riuscita");
    } finally { setInstalling(false); }
  };

  const saveConfiguration = async () => {
    if (!selected) return;
    await api("PUT", `/api/plugins/${selected.id}`, { configuration });
    await load();
    setMessage("Configurazione salvata.");
  };
  const togglePlugin = async (plugin: InstalledPlugin) => {
    await api("PUT", `/api/plugins/${plugin.id}`, { enabled: !plugin.enabled });
    await load();
  };
  const removePlugin = async (plugin: InstalledPlugin) => {
    if (!confirm(`Disinstallare ${plugin.name}?`)) return;
    await api("DELETE", `/api/plugins/${plugin.id}`);
    await load();
  };

  const runCommand = async (plugin: InstalledPlugin, command: PluginCommand) => {
    const action = interpolatePluginValue(command.action, plugin.configuration) as PluginCommand["action"];
    try {
      if (action.type === "open-url") {
        window.open(action.url, "_blank", "noopener,noreferrer");
      } else if (action.type === "open-panel") {
        if (action.panel.startsWith("right:")) window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: action.panel.slice(6) } }));
        else if (action.panel === "assets") window.dispatchEvent(new CustomEvent("ddone:open-asset-picker", { detail: { purpose: "insert" } }));
        else window.dispatchEvent(new CustomEvent("ddone:open-tool", { detail: { tool: action.panel } }));
      } else if (action.type === "insert-element") {
        if (readOnly || !canvas) throw new Error("Il canvas non è modificabile.");
        const objects = await (fabric.util.enlivenObjects as any)([action.element]);
        const object = objects?.[0] as fabric.FabricObject | undefined;
        if (!object) throw new Error("Il plugin non ha prodotto un elemento valido.");
        ensureObjectId(object);
        if (!Number.isFinite(object.left)) object.left = canvas.getWidth() / 2;
        if (!Number.isFinite(object.top)) object.top = canvas.getHeight() / 2;
        canvas.add(object); canvas.setActiveObject(object); object.setCoords(); canvas.requestRenderAll(); canvas.fire("object:modified", { target: object } as any);
      } else if (action.type === "http-request") {
        const url = new URL(action.url, window.location.origin);
        if (url.origin !== window.location.origin && url.protocol !== "https:") throw new Error("Le integrazioni esterne devono usare HTTPS.");
        const response = await fetch(url, { method: action.method, credentials: url.origin === window.location.origin ? "include" : "omit", headers: { "Content-Type": "application/json" } });
        if (!response.ok) throw new Error(`Integrazione HTTP: ${response.status}`);
      }
      if (activeDesign) await api("POST", `/api/designs/${activeDesign.id}/governance`, { eventType: "PLUGIN_ACTION", payload: { pluginKey: plugin.plugin_key, commandId: command.id, actionType: action.type } }).catch(() => undefined);
      setMessage(`${command.title} eseguito.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Comando non riuscito");
    }
  };

  if (!open) return null;
  return (
    <div class="fixed inset-0 z-[170] grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="plugin-manager-title">
      <div class="flex h-[min(860px,92vh)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header class="flex items-center justify-between border-b border-zinc-200 px-5 py-4"><div class="flex items-center gap-3"><span class="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><Blocks size={19} /></span><div><h2 id="plugin-manager-title" class="m-0 text-sm font-semibold text-zinc-900">Plugin e integrazioni</h2><p class="mb-0 mt-1 text-[9px] text-zinc-500">Manifest dichiarativi, permessi espliciti e configurazione per workspace o cliente.</p></div></div><button onClick={() => setOpen(false)} class="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-500 cursor-pointer"><X size={16} /></button></header>
        <div class="grid min-h-0 flex-1 lg:grid-cols-[250px_1fr_360px]">
          <aside class="overflow-y-auto border-r border-zinc-200 p-3"><button onClick={() => setSelectedId(null)} class={`mb-2 flex h-10 w-full items-center gap-2 rounded-xl border px-3 text-[9px] font-semibold cursor-pointer ${selectedId === null ? "border-violet-300 bg-violet-50 text-violet-700" : "border-zinc-200 bg-white text-zinc-600"}`}><Plus size={13} /> Installa manifest</button>{plugins.map((plugin) => <button key={plugin.id} onClick={() => setSelectedId(plugin.id)} class={`mb-1 flex w-full items-center gap-3 rounded-xl border-0 p-3 text-left cursor-pointer ${selectedId === plugin.id ? "bg-violet-50" : "bg-white hover:bg-zinc-50"}`}><span class={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${plugin.enabled ? "bg-violet-600 text-white" : "bg-zinc-100 text-zinc-400"}`}><Blocks size={13} /></span><span class="min-w-0"><strong class="block truncate text-[9px] text-zinc-800">{plugin.name}</strong><span class="text-[7px] text-zinc-400">{plugin.manifest.version} · {plugin.client_id ? "cliente" : "workspace"}</span></span></button>)}</aside>

          <main class="min-h-0 overflow-y-auto p-5">
            {!selected ? <section><div class="mb-3"><strong class="text-xs text-zinc-800">Installa un plugin</strong><p class="mt-1 text-[9px] leading-relaxed text-zinc-500">Incolla un manifest schema v1. Il sistema convalida permessi e comandi prima di salvarlo.</p></div><textarea value={manifestText} onInput={(event) => setManifestText((event.target as HTMLTextAreaElement).value)} class="h-[520px] w-full resize-none rounded-xl border border-zinc-200 bg-zinc-950 p-4 font-mono text-[9px] leading-relaxed text-zinc-100 outline-none focus:border-violet-400" /><button disabled={installing} onClick={() => void install()} class="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border-0 bg-violet-600 text-[10px] font-semibold text-white cursor-pointer disabled:opacity-40"><Plus size={14} /> {installing ? "Installazione…" : "Valida e installa"}</button></section> : <section><div class="flex items-start justify-between gap-3"><div><h3 class="m-0 text-sm font-semibold text-zinc-900">{selected.name}</h3><p class="mt-1 text-[9px] text-zinc-500">{selected.manifest.description || "Nessuna descrizione."}</p><div class="mt-2 flex flex-wrap gap-1">{selected.manifest.permissions.map((permission) => <span key={permission} class="rounded-full bg-zinc-100 px-2 py-1 text-[7px] text-zinc-500">{permission}</span>)}</div></div><div class="flex gap-1"><button title={selected.enabled ? "Disabilita" : "Abilita"} onClick={() => void togglePlugin(selected)} class={`grid h-9 w-9 place-items-center rounded-lg border cursor-pointer ${selected.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-zinc-200 bg-white text-zinc-400"}`}><Power size={14} /></button><button title="Disinstalla" onClick={() => void removePlugin(selected)} class="grid h-9 w-9 place-items-center rounded-lg border border-red-100 bg-red-50 text-red-500 cursor-pointer"><Trash2 size={14} /></button></div></div>
              <div class="mt-5"><strong class="text-[10px] text-zinc-700">Comandi</strong><div class="mt-2 grid gap-2 sm:grid-cols-2">{selected.manifest.commands.map((command) => <button key={command.id} disabled={!selected.enabled} onClick={() => void runCommand(selected, command)} class="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left cursor-pointer hover:border-violet-300 disabled:opacity-40"><span class="grid h-9 w-9 place-items-center rounded-lg bg-violet-100 text-violet-700"><Play size={14} /></span><span><strong class="block text-[9px] text-zinc-800">{command.title}</strong><span class="mt-0.5 block text-[7px] text-zinc-400">{command.description || command.action.type}</span></span></button>)}</div>{selected.manifest.commands.length === 0 && <p class="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-[9px] text-zinc-400">Il plugin non dichiara comandi.</p>}</div>
              {selected.manifest.homepage && <a href={selected.manifest.homepage} target="_blank" rel="noreferrer" class="mt-5 inline-flex items-center gap-1 text-[8px] text-violet-600">Documentazione <ExternalLink size={10} /></a>}
            </section>}
          </main>

          <aside class="overflow-y-auto border-l border-zinc-200 bg-zinc-50 p-5"><div class="flex items-center gap-2"><Settings2 size={14} class="text-zinc-500" /><strong class="text-[10px] text-zinc-700">Configurazione</strong></div>{selected ? <>{selected.manifest.settings.map((setting) => <label key={setting.key} class="mt-3 block text-[8px] font-semibold text-zinc-500">{setting.label}{setting.type === "boolean" ? <input type="checkbox" checked={Boolean(configuration[setting.key])} onChange={(event) => setConfiguration({ ...configuration, [setting.key]: (event.target as HTMLInputElement).checked })} class="ml-2" /> : setting.type === "select" ? <select value={String(configuration[setting.key] ?? setting.default ?? "")} onChange={(event) => setConfiguration({ ...configuration, [setting.key]: (event.target as HTMLSelectElement).value })} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[9px]">{setting.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input type={setting.type === "number" ? "number" : "text"} value={String(configuration[setting.key] ?? setting.default ?? "")} onInput={(event) => setConfiguration({ ...configuration, [setting.key]: setting.type === "number" ? Number((event.target as HTMLInputElement).value) : (event.target as HTMLInputElement).value })} class="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[9px]" />}</label>)}<button onClick={() => void saveConfiguration()} class="mt-4 h-9 w-full rounded-lg border-0 bg-zinc-900 text-[9px] font-semibold text-white cursor-pointer">Salva configurazione</button></> : <p class="mt-3 text-[8px] leading-relaxed text-zinc-400">Seleziona un plugin per modificarne le impostazioni.</p>}{message && <p class="mt-4 rounded-lg bg-white p-3 text-[8px] leading-relaxed text-zinc-600">{message}</p>}</aside>
        </div>
      </div>
    </div>
  );
}