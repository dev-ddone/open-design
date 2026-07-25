import { useEffect, useState } from "preact/hooks";
import { Check, Image, Plus, Star, Trash2, Type } from "lucide-preact";
import { api, getActiveClientId } from "../api";
import { useEditor } from "../context";
import type { BrandKit } from "../types";

function commaList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function BrandKitPanel() {
  const { selectedObject, updateSelectedObject, setBackground, addImage } = useEditor();
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [name, setName] = useState("Client brand kit");
  const [colors, setColors] = useState("#111827, #ffffff, #6d5dfc");
  const [fonts, setFonts] = useState("Montserrat, Inter");
  const [logos, setLogos] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientId = getActiveClientId();

  const load = async () => {
    try {
      const data = await api<BrandKit[]>("GET", "/api/brand-kits");
      setKits(data.filter((kit) => kit.client_id === clientId || (!clientId && !kit.client_id)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load brand kits");
    }
  };
  useEffect(() => { void load(); }, [clientId]);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      await api<BrandKit>("POST", "/api/brand-kits", {
        name,
        client_id: clientId,
        colors: commaList(colors),
        fonts: commaList(fonts),
        logos: commaList(logos),
        text_styles: [],
        is_default: kits.length === 0,
      });
      setShowForm(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create brand kit");
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (kit: BrandKit) => {
    await api("PUT", `/api/brand-kits/${kit.id}`, { is_default: true });
    await load();
  };
  const remove = async (kit: BrandKit) => {
    if (!confirm(`Delete ${kit.name}?`)) return;
    await api("DELETE", `/api/brand-kits/${kit.id}`);
    await load();
  };
  const applyColor = (color: string) => {
    if (selectedObject) updateSelectedObject({ fill: color });
    else setBackground("color", color);
  };

  return (
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="m-0 text-[11px] text-zinc-400">{clientId ? "Brand assets for the selected client" : "Organization brand assets"}</p>
        <button onClick={() => setShowForm(!showForm)} class="w-7 h-7 grid place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500 cursor-pointer hover:text-accent hover:border-accent"><Plus size={14} /></button>
      </div>

      {showForm && (
        <div class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
          <input value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} placeholder="Kit name" class="w-full h-9 rounded-lg border border-zinc-300 px-2.5 text-xs outline-none focus:border-accent" />
          <input value={colors} onInput={(event) => setColors((event.target as HTMLInputElement).value)} placeholder="#111827, #ffffff" class="w-full h-9 rounded-lg border border-zinc-300 px-2.5 text-xs outline-none focus:border-accent" />
          <input value={fonts} onInput={(event) => setFonts((event.target as HTMLInputElement).value)} placeholder="Montserrat, Inter" class="w-full h-9 rounded-lg border border-zinc-300 px-2.5 text-xs outline-none focus:border-accent" />
          <textarea value={logos} onInput={(event) => setLogos((event.target as HTMLTextAreaElement).value)} placeholder="Logo URLs separated by commas" class="w-full min-h-16 rounded-lg border border-zinc-300 p-2.5 text-xs outline-none focus:border-accent" />
          <button disabled={saving || !name.trim()} onClick={() => void create()} class="w-full h-9 rounded-lg border-0 bg-accent text-white text-xs font-semibold cursor-pointer disabled:opacity-50">{saving ? "Saving…" : "Create kit"}</button>
        </div>
      )}

      {error && <div class="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{error}</div>}
      {kits.length === 0 && !showForm && <div class="rounded-xl border border-dashed border-zinc-300 p-5 text-center text-[11px] text-zinc-400">No brand kit for this client yet.</div>}

      {kits.map((kit) => (
        <div key={kit.id} class="rounded-xl border border-zinc-200 bg-white p-3">
          <div class="flex items-center gap-2 mb-3">
            <div class="min-w-0 flex-1">
              <p class="m-0 text-xs font-semibold text-zinc-800 truncate">{kit.name}</p>
              <p class="m-0 mt-0.5 text-[10px] text-zinc-400">{kit.is_default ? "Default kit" : "Brand kit"}</p>
            </div>
            {kit.is_default ? <Star size={14} class="text-amber-500" fill="currentColor" /> : (
              <button title="Set as default" onClick={() => void setDefault(kit)} class="w-7 h-7 grid place-items-center rounded-lg border-0 bg-zinc-100 text-zinc-400 cursor-pointer hover:text-amber-500"><Star size={13} /></button>
            )}
            <button title="Delete" onClick={() => void remove(kit)} class="w-7 h-7 grid place-items-center rounded-lg border-0 bg-zinc-100 text-zinc-400 cursor-pointer hover:text-red-500"><Trash2 size={13} /></button>
          </div>

          {kit.colors.length > 0 && (
            <div class="mb-3">
              <div class="flex items-center gap-1 mb-1.5 text-[10px] text-zinc-400"><Check size={10} /> Colors</div>
              <div class="flex flex-wrap gap-1.5">
                {kit.colors.map((color) => <button key={color} title={color} onClick={() => applyColor(color)} class="w-8 h-8 rounded-lg border border-zinc-300 cursor-pointer hover:scale-110" style={{ background: color }} />)}
              </div>
            </div>
          )}
          {kit.fonts.length > 0 && (
            <div class="mb-3">
              <div class="flex items-center gap-1 mb-1.5 text-[10px] text-zinc-400"><Type size={10} /> Fonts</div>
              <div class="flex flex-wrap gap-1">
                {kit.fonts.map((font) => <button key={font} onClick={() => selectedObject && updateSelectedObject({ fontFamily: font })} class="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600 cursor-pointer hover:border-accent" style={{ fontFamily: font }}>{font}</button>)}
              </div>
            </div>
          )}
          {kit.logos.length > 0 && (
            <div>
              <div class="flex items-center gap-1 mb-1.5 text-[10px] text-zinc-400"><Image size={10} /> Logos</div>
              <div class="grid grid-cols-3 gap-1.5">
                {kit.logos.map((logo) => <button key={logo} onClick={() => void addImage(logo)} class="aspect-square rounded-lg border border-zinc-200 bg-white p-1 cursor-pointer hover:border-accent"><img src={logo} class="w-full h-full object-contain" /></button>)}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
