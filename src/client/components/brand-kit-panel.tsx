import { useEffect, useMemo, useState } from "preact/hooks";
import { Check, Image, Palette, Plus, RefreshCw, Sparkles, Star, Trash2, Type } from "lucide-preact";
import { api, getActiveClientId } from "../api";
import { mergeBrandMigrationStats, migrateCanvasJsonToBrand, type BrandMigrationOptions, type BrandMigrationStats } from "../brand/brand-migration";
import { useEditor } from "../context";
import type { AssetSelection } from "./asset-picker-host";
import type { BrandKit, DesignWithPages, Page } from "../types";

function commaList(value: string): string[] { return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean); }
const DEFAULT_OPTIONS: BrandMigrationOptions = { replaceColors: true, replaceFonts: true, replaceLogos: true, preserveNeutralColors: true };

export function BrandKitPanel() {
  const { selectedObject, updateSelectedObject, setBackground, addImage, activeDesign, createVersion, loadDesign } = useEditor();
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [name, setName] = useState("Client brand kit");
  const [colors, setColors] = useState("#111827, #ffffff, #6d5dfc");
  const [fonts, setFonts] = useState("Montserrat, Inter");
  const [logos, setLogos] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [migrationKit, setMigrationKit] = useState<BrandKit | null>(null);
  const [options, setOptions] = useState<BrandMigrationOptions>(DEFAULT_OPTIONS);
  const [preview, setPreview] = useState<BrandMigrationStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientId = getActiveClientId();

  const load = async () => {
    try {
      const data = await api<BrandKit[]>("GET", "/api/brand-kits");
      const scoped = data.filter((kit) => kit.client_id === clientId || (!clientId && !kit.client_id));
      setKits(scoped);
      setMigrationKit((current) => current && scoped.some((kit) => kit.id === current.id) ? current : scoped.find((kit) => kit.is_default) ?? scoped[0] ?? null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Impossibile caricare i brand kit"); }
  };
  useEffect(() => { void load(); }, [clientId]);

  const create = async () => {
    setSaving(true); setError(null);
    try {
      await api<BrandKit>("POST", "/api/brand-kits", { name, client_id: clientId, colors: commaList(colors), fonts: commaList(fonts), logos: commaList(logos), text_styles: [], is_default: kits.length === 0 });
      setShowForm(false); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Impossibile creare il kit"); }
    finally { setSaving(false); }
  };
  const setDefault = async (kit: BrandKit) => { await api("PUT", `/api/brand-kits/${kit.id}`, { is_default: true }); await load(); };
  const remove = async (kit: BrandKit) => { if (!confirm(`Eliminare ${kit.name}?`)) return; await api("DELETE", `/api/brand-kits/${kit.id}`); await load(); };
  const applyColor = (color: string) => { if (selectedObject) updateSelectedObject({ fill: color }); else setBackground("color", color); };
  const addLogoFromPicker = () => window.dispatchEvent(new CustomEvent("ddone:open-asset-picker", { detail: { purpose: "callback", fieldType: "logo", onSelect: (selection: AssetSelection) => setLogos((current) => [...commaList(current), selection.url].join(", ")) } }));

  const calculateMigration = async (kit: BrandKit): Promise<{ design: DesignWithPages; results: ReturnType<typeof migrateCanvasJsonToBrand>[] }> => {
    if (!activeDesign) throw new Error("Apri un progetto prima di migrare il brand.");
    const design = await api<DesignWithPages>("GET", `/api/designs/${activeDesign.id}`);
    const results = design.pages.map((page) => migrateCanvasJsonToBrand(page.canvas_json, kit, options));
    return { design, results };
  };

  const previewMigration = async () => {
    if (!migrationKit) return;
    setMigrating(true); setError(null);
    try { const { results } = await calculateMigration(migrationKit); setPreview(mergeBrandMigrationStats(results.map((result) => result.stats))); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Anteprima non disponibile"); }
    finally { setMigrating(false); }
  };

  const applyMigration = async () => {
    if (!migrationKit || !activeDesign) return;
    setMigrating(true); setError(null);
    try {
      const { design, results } = await calculateMigration(migrationKit);
      await createVersion(`Before brand migration: ${migrationKit.name}`, "manual");
      for (let index = 0; index < design.pages.length; index += 1) {
        await api<Page>("PUT", `/api/pages/${design.pages[index].id}`, { canvas_json: results[index].canvasJson });
      }
      const stats = mergeBrandMigrationStats(results.map((result) => result.stats));
      await api("POST", `/api/designs/${design.id}/governance`, {
        eventType: "BRAND_MIGRATION",
        payload: { brandKitId: migrationKit.id, brandKitName: migrationKit.name, options, stats },
      });
      await loadDesign(design.id);
      setPreview(stats);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Migrazione non riuscita"); }
    finally { setMigrating(false); }
  };

  const totalAssets = useMemo(() => kits.reduce((total, kit) => total + kit.colors.length + kit.fonts.length + kit.logos.length, 0), [kits]);

  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between"><div><p class="m-0 text-[11px] text-zinc-400">{clientId ? "Brand del cliente selezionato" : "Brand dell’organizzazione"}</p><span class="text-[8px] text-zinc-300">{kits.length} kit · {totalAssets} risorse</span></div><button onClick={() => setShowForm(!showForm)} class="grid h-8 w-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 cursor-pointer hover:border-accent hover:text-accent"><Plus size={14} /></button></div>

      {showForm && <div class="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3"><input value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} placeholder="Nome kit" class="h-9 w-full rounded-lg border border-zinc-300 px-2.5 text-xs outline-none focus:border-accent" /><input value={colors} onInput={(event) => setColors((event.target as HTMLInputElement).value)} placeholder="#111827, #ffffff" class="h-9 w-full rounded-lg border border-zinc-300 px-2.5 text-xs outline-none focus:border-accent" /><input value={fonts} onInput={(event) => setFonts((event.target as HTMLInputElement).value)} placeholder="Montserrat, Inter" class="h-9 w-full rounded-lg border border-zinc-300 px-2.5 text-xs outline-none focus:border-accent" /><textarea value={logos} onInput={(event) => setLogos((event.target as HTMLTextAreaElement).value)} placeholder="URL logo separati da virgola" class="min-h-16 w-full rounded-lg border border-zinc-300 p-2.5 text-xs outline-none focus:border-accent" /><button onClick={addLogoFromPicker} class="flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-violet-200 bg-white text-[9px] font-semibold text-violet-700 cursor-pointer"><Image size={12} /> Aggiungi logo dalla libreria</button><button disabled={saving || !name.trim()} onClick={() => void create()} class="h-9 w-full rounded-lg border-0 bg-accent text-xs font-semibold text-white cursor-pointer disabled:opacity-50">{saving ? "Salvataggio…" : "Crea kit"}</button></div>}

      {error && <div class="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{error}</div>}
      {kits.length === 0 && !showForm && <div class="rounded-xl border border-dashed border-zinc-300 p-5 text-center text-[11px] text-zinc-400">Nessun brand kit per questo cliente.</div>}

      {kits.map((kit) => <div key={kit.id} class="rounded-xl border border-zinc-200 bg-white p-3"><div class="mb-3 flex items-center gap-2"><div class="min-w-0 flex-1"><p class="m-0 truncate text-xs font-semibold text-zinc-800">{kit.name}</p><p class="m-0 mt-0.5 text-[10px] text-zinc-400">{kit.is_default ? "Kit predefinito" : "Brand kit"}</p></div>{kit.is_default ? <Star size={14} class="text-amber-500" fill="currentColor" /> : <button title="Imposta predefinito" onClick={() => void setDefault(kit)} class="grid h-7 w-7 place-items-center rounded-lg border-0 bg-zinc-100 text-zinc-400 cursor-pointer hover:text-amber-500"><Star size={13} /></button>}<button title="Elimina" onClick={() => void remove(kit)} class="grid h-7 w-7 place-items-center rounded-lg border-0 bg-zinc-100 text-zinc-400 cursor-pointer hover:text-red-500"><Trash2 size={13} /></button></div>
        {kit.colors.length > 0 && <div class="mb-3"><div class="mb-1.5 flex items-center gap-1 text-[10px] text-zinc-400"><Check size={10} /> Colori</div><div class="flex flex-wrap gap-1.5">{kit.colors.map((color) => <button key={color} title={color} onClick={() => applyColor(color)} class="h-8 w-8 rounded-lg border border-zinc-300 cursor-pointer hover:scale-110" style={{ background: color }} />)}</div></div>}
        {kit.fonts.length > 0 && <div class="mb-3"><div class="mb-1.5 flex items-center gap-1 text-[10px] text-zinc-400"><Type size={10} /> Font</div><div class="flex flex-wrap gap-1">{kit.fonts.map((font) => <button key={font} onClick={() => selectedObject && updateSelectedObject({ fontFamily: font })} class="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600 cursor-pointer hover:border-accent" style={{ fontFamily: font }}>{font}</button>)}</div></div>}
        {kit.logos.length > 0 && <div><div class="mb-1.5 flex items-center gap-1 text-[10px] text-zinc-400"><Image size={10} /> Loghi</div><div class="grid grid-cols-3 gap-1.5">{kit.logos.map((logo) => <button key={logo} onClick={() => void addImage(logo)} class="aspect-square rounded-lg border border-zinc-200 bg-white p-1 cursor-pointer hover:border-accent"><img src={logo} class="h-full w-full object-contain" /></button>)}</div></div>}
      </div>)}

      {kits.length > 0 && <section class="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3"><div class="mb-2 flex items-center gap-2"><Sparkles size={14} class="text-violet-600" /><strong class="text-[10px] text-zinc-800">Migra tutto il documento</strong></div><p class="mb-3 text-[8px] leading-relaxed text-zinc-500">Sostituisce colori, font e loghi su tutte le pagine, inclusi gradienti e smart elements. Prima crea una versione di sicurezza.</p><select value={migrationKit?.id ?? ""} onChange={(event) => { setMigrationKit(kits.find((kit) => kit.id === (event.target as HTMLSelectElement).value) ?? null); setPreview(null); }} class="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-[9px]">{kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>)}</select><div class="mt-3 grid grid-cols-2 gap-2 text-[8px] text-zinc-600"><label class="flex gap-2"><input type="checkbox" checked={options.replaceColors} onChange={(event) => setOptions({ ...options, replaceColors: (event.target as HTMLInputElement).checked })} /> Colori</label><label class="flex gap-2"><input type="checkbox" checked={options.replaceFonts} onChange={(event) => setOptions({ ...options, replaceFonts: (event.target as HTMLInputElement).checked })} /> Font</label><label class="flex gap-2"><input type="checkbox" checked={options.replaceLogos} onChange={(event) => setOptions({ ...options, replaceLogos: (event.target as HTMLInputElement).checked })} /> Loghi semantici</label><label class="flex gap-2"><input type="checkbox" checked={options.preserveNeutralColors} onChange={(event) => setOptions({ ...options, preserveNeutralColors: (event.target as HTMLInputElement).checked })} /> Mantieni neutri</label></div><div class="mt-3 grid grid-cols-2 gap-2"><button disabled={migrating || !activeDesign} onClick={() => void previewMigration()} class="flex h-9 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-white text-[8px] font-semibold text-violet-700 cursor-pointer disabled:opacity-40"><RefreshCw size={12} class={migrating ? "animate-spin" : ""} /> Anteprima</button><button disabled={migrating || !activeDesign || !migrationKit} onClick={() => void applyMigration()} class="flex h-9 items-center justify-center gap-2 rounded-lg border-0 bg-violet-600 text-[8px] font-semibold text-white cursor-pointer disabled:opacity-40"><Palette size={12} /> Applica brand</button></div>{preview && <div class="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-white p-2 text-[8px] text-zinc-500"><span><strong class="text-zinc-800">{preview.colorsChanged}</strong> colori</span><span><strong class="text-zinc-800">{preview.fontsChanged}</strong> font</span><span><strong class="text-zinc-800">{preview.logosChanged}</strong> loghi</span><span><strong class="text-zinc-800">{preview.smartElementsChanged}</strong> smart elements</span></div>}</section>}
    </div>
  );
}