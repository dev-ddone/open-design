import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Command, CornerDownLeft, Keyboard, Search, X } from "lucide-preact";
import { useEditor } from "../context";

interface EditorCommand {
  id: string;
  title: string;
  description: string;
  shortcut?: string;
  keywords: string;
  readOnly?: boolean;
  run: () => void;
}

export function CommandPalette() {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<EditorCommand[]>(() => [
    { id: "save", title: "Salva progetto", description: "Salva pagine e crea una versione", shortcut: "Ctrl/⌘ S", keywords: "save salva versione", run: () => void editor.saveDesign() },
    { id: "undo", title: "Annulla", description: "Torna alla modifica precedente", shortcut: "Ctrl/⌘ Z", keywords: "undo annulla", run: editor.undo },
    { id: "redo", title: "Ripeti", description: "Ripristina la modifica annullata", shortcut: "Ctrl/⌘ ⇧ Z", keywords: "redo ripeti", run: editor.redo },
    { id: "heading", title: "Aggiungi titolo", description: "Inserisce un titolo sul canvas", keywords: "testo titolo heading", run: () => editor.addText("heading") },
    { id: "body", title: "Aggiungi testo", description: "Inserisce un paragrafo", keywords: "testo body paragrafo", run: () => editor.addText("body") },
    { id: "rectangle", title: "Aggiungi rettangolo", description: "Inserisce una forma rettangolare", keywords: "forma rettangolo shape", run: () => editor.addShape("rect") },
    { id: "elements", title: "Apri Elementi", description: "Cerca immagini, PNG, vettori e moduli", keywords: "elementi immagini png foto", run: () => window.dispatchEvent(new CustomEvent("ddone:open-left-panel", { detail: { section: "elements" } })) },
    { id: "assets", title: "Apri asset picker", description: "Scegli foto, upload, loghi e sfondi", keywords: "asset foto png immagini upload logo", run: () => window.dispatchEvent(new CustomEvent("ddone:open-asset-picker", { detail: { purpose: "insert" } })) },
    { id: "layers", title: "Apri Livelli", description: "Mostra struttura e ordine degli oggetti", keywords: "layers livelli struttura", readOnly: true, run: () => window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: "layers" } })) },
    { id: "review", title: "Apri Revisione", description: "Commenti, assegnazioni e approvazioni", keywords: "review revisione commenti approva", readOnly: true, run: () => window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: "review" } })) },
    { id: "audit", title: "Controlla design", description: "Esegue audit di layout, brand e dati", keywords: "audit controllo qualità brand", run: () => window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: "audit" } })) },
    { id: "data", title: "Template e dati", description: "Campi semantici, CSV e XLSX", keywords: "xlsx excel csv dati template", run: () => window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: "data" } })) },
    { id: "resize", title: "Smart Resize", description: "Genera formati e campagne", keywords: "resize ridimensiona campagna formati", run: () => window.dispatchEvent(new CustomEvent("ddone:open-right-panel", { detail: { tab: "resize" } })) },
    { id: "pages", title: "Panoramica pagine", description: "Cerca, apri e riordina le pagine", keywords: "pagine griglia overview", readOnly: true, run: () => window.dispatchEvent(new Event("ddone:open-pages-overview")) },
    { id: "notifications", title: "Notifiche", description: "Menzioni, assegnazioni e revisioni", keywords: "notifiche mention inbox", readOnly: true, run: () => window.dispatchEvent(new Event("ddone:open-notifications")) },
    { id: "zoom-fit", title: "Adatta alla finestra", description: "Centra il documento nello spazio disponibile", shortcut: "0", keywords: "zoom fit adatta", readOnly: true, run: editor.zoomToFit },
    { id: "shortcuts", title: "Guida scorciatoie", description: "Mostra tutti i comandi da tastiera", shortcut: "?", keywords: "keyboard tastiera scorciatoie help", readOnly: true, run: () => setQuery("shortcut:") },
  ].filter((command) => !editor.readOnly || command.readOnly), [editor.readOnly, editor.activeDesign?.id]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized === "shortcut:") return commands.filter((command) => command.shortcut);
    if (!normalized) return commands;
    return commands.filter((command) => `${command.title} ${command.description} ${command.keywords} ${command.shortcut ?? ""}`.toLowerCase().includes(normalized));
  }, [commands, query]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setOpen(true); return;
      }
      if (event.key === "?" && !typing) { event.preventDefault(); setOpen(true); setQuery("shortcut:"); }
      if (!open) return;
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key === "ArrowDown") { event.preventDefault(); setSelected((value) => Math.min(filtered.length - 1, value + 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setSelected((value) => Math.max(0, value - 1)); }
      if (event.key === "Enter" && filtered[selected]) { event.preventDefault(); filtered[selected].run(); setOpen(false); }
    };
    const show = () => setOpen(true);
    window.addEventListener("keydown", keydown);
    window.addEventListener("ddone:open-command-palette", show);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("ddone:open-command-palette", show); };
  }, [open, filtered, selected]);

  useEffect(() => {
    if (!open) return;
    setSelected(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, query]);

  if (!open) return null;
  return (
    <div class="fixed inset-0 z-[150] flex items-start justify-center bg-black/35 px-4 pt-[10vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div class="w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Comandi e scorciatoie">
        <div class="flex items-center gap-3 border-b border-zinc-200 px-4"><Search size={17} class="text-zinc-400" /><input ref={inputRef} value={query} onInput={(event) => setQuery((event.target as HTMLInputElement).value)} placeholder="Cerca comandi, strumenti o scorciatoie…" class="h-14 flex-1 border-0 bg-transparent text-sm outline-none" /><kbd class="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[8px] text-zinc-500">ESC</kbd><button onClick={() => setOpen(false)} class="grid h-8 w-8 place-items-center rounded-lg border-0 bg-transparent text-zinc-400 cursor-pointer"><X size={15} /></button></div>
        <div class="max-h-[60vh] overflow-y-auto p-2">
          {filtered.map((command, index) => <button key={command.id} onMouseEnter={() => setSelected(index)} onClick={() => { command.run(); setOpen(false); }} class={`flex w-full items-center gap-3 rounded-xl border-0 p-3 text-left cursor-pointer ${selected === index ? "bg-violet-50" : "bg-white"}`}><span class={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${selected === index ? "bg-violet-600 text-white" : "bg-zinc-100 text-zinc-500"}`}>{command.shortcut ? <Keyboard size={15} /> : <Command size={15} />}</span><span class="min-w-0 flex-1"><strong class="block text-[10px] text-zinc-800">{command.title}</strong><span class="mt-0.5 block text-[8px] text-zinc-400">{command.description}</span></span>{command.shortcut && <kbd class="rounded border border-zinc-200 bg-white px-2 py-1 text-[8px] text-zinc-500">{command.shortcut}</kbd>}{selected === index && <CornerDownLeft size={12} class="text-violet-500" />}</button>)}
          {filtered.length === 0 && <p class="p-10 text-center text-[10px] text-zinc-400">Nessun comando trovato.</p>}
        </div>
        <footer class="flex items-center justify-between border-t border-zinc-100 px-4 py-2 text-[7px] text-zinc-400"><span>↑↓ naviga · Invio esegue · ESC chiude</span><span>Ctrl/⌘ K</span></footer>
      </div>
    </div>
  );
}