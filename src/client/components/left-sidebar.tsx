import { useState, useRef, useCallback, useEffect } from "preact/hooks";
import {
  Type,
  Upload,
  Palette,
  LayoutGrid,
  Sparkles,
  Shapes,
  CircleDashed,
  SwatchBook,
  WandSparkles,
  FolderOpen,
} from "lucide-preact";
import { useEditor } from "../context";
import { api, getActiveClientId, scopedHeaders } from "../api";
import type { Design, Page, Template } from "../types";
import { TemplateCard } from "./template-card";
import { DesignList } from "./design-list";
import { ElementsLibraryV2 } from "./elements-library-v2";
import { NativeShapesPanel } from "./native-shapes-panel";
import { BrandKitPanel } from "./brand-kit-panel";
import { ToolsPanel } from "./tools-panel";

type Section = "templates" | "elements" | "shapes" | "tools" | "brand" | "text" | "images" | "background" | "designs";

const SECTIONS: { key: Section; icon: typeof LayoutGrid; label: string; editing: boolean }[] = [
  { key: "templates", icon: LayoutGrid, label: "Modelli", editing: true },
  { key: "elements", icon: Shapes, label: "Elementi", editing: true },
  { key: "shapes", icon: CircleDashed, label: "Forme", editing: true },
  { key: "text", icon: Type, label: "Testo", editing: true },
  { key: "brand", icon: SwatchBook, label: "Brand", editing: true },
  { key: "images", icon: Upload, label: "Caricamenti", editing: true },
  { key: "tools", icon: WandSparkles, label: "Strumenti", editing: true },
  { key: "designs", icon: FolderOpen, label: "Progetti", editing: false },
  { key: "background", icon: Palette, label: "Sfondo", editing: true },
];

const SECTION_TITLES: Record<Section, string> = {
  templates: "Modelli",
  elements: "Elementi",
  shapes: "Forme e linee",
  tools: "Strumenti",
  brand: "Brand kit",
  text: "Testo",
  images: "Caricamenti",
  background: "Sfondo",
  designs: "Progetti",
};

const GRADIENT_PRESETS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
];

const BG_COLORS = [
  "#1a1a2e", "#0f172a", "#18181b", "#1e1b4b",
  "#ffffff", "#f8fafc", "#fafaf9", "#fef3c7",
  "#2563eb", "#7c3aed", "#dc2626", "#059669",
  "#0891b2", "#d97706", "#e11d48", "#4f46e5",
];

export function LeftSidebar() {
  const {
    addText,
    addImage,
    setBackground,
    templates,
    loadTemplate,
    setTemplateEditRules,
    activeDesign,
    activePageId,
    readOnly,
  } = useEditor();
  const canEdit = !readOnly;
  const [activeSection, setActiveSection] = useState<Section | null>(canEdit ? "elements" : "designs");
  const [requestedTool, setRequestedTool] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const tool = (event as CustomEvent<{ tool?: string }>).detail?.tool;
      if (!tool || !canEdit) return;
      setRequestedTool(tool);
      setActiveSection("tools");
    };
    window.addEventListener("ddone:open-tool", handler);
    return () => window.removeEventListener("ddone:open-tool", handler);
  }, [canEdit]);

  useEffect(() => {
    const handler = () => {
      if (canEdit) setActiveSection("shapes");
    };
    window.addEventListener("ddone:open-native-shapes", handler);
    return () => window.removeEventListener("ddone:open-native-shapes", handler);
  }, [canEdit]);

  const handleSectionClick = (section: (typeof SECTIONS)[number]) => {
    if (section.editing && !canEdit) return;
    setActiveSection((previous) => (previous === section.key ? null : section.key));
    if (section.key !== "tools") setRequestedTool(null);
  };

  const applyTemplate = useCallback(async (template: Template) => {
    if (!canEdit) return;
    setApplyingTemplateId(template.id);
    try {
      if (activeDesign && activePageId) {
        const applied = await api<{ design: Design; page: Page }>(
          "POST",
          `/api/designs/${activeDesign.id}/apply-template`,
          { template_id: template.id, page_id: activePageId },
        );
        loadTemplate({ ...template, canvas_json: applied.page.canvas_json });
        setTemplateEditRules(applied.design.template_edit_rules, false);
      } else {
        loadTemplate(template);
        setTemplateEditRules(template.edit_rules, false);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to apply template");
    } finally {
      setApplyingTemplateId(null);
    }
  }, [canEdit, activeDesign?.id, activePageId, loadTemplate, setTemplateEditRules]);

  const uploadFile = useCallback(async (file: File): Promise<{ url?: string }> => {
    const form = new FormData();
    form.append("file", file);
    const clientId = getActiveClientId();
    if (clientId) form.append("client_id", clientId);
    const response = await fetch("/api/uploads", {
      method: "POST",
      body: form,
      credentials: "include",
      headers: scopedHeaders(),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Upload failed");
    return data;
  }, []);

  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!canEdit || !files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const data = await uploadFile(file);
        if (data.url) await addImage(data.url);
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [addImage, canEdit, uploadFile]);

  const handleBackgroundUpload = useCallback(async (files: FileList | null) => {
    if (!canEdit || !files?.length) return;
    try {
      const data = await uploadFile(files[0]);
      if (data.url) setBackground("image", data.url);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Background upload failed");
    }
  }, [setBackground, canEdit, uploadFile]);

  return (
    <aside class="flex flex-row shrink-0">
      <div class="w-[76px] bg-white border-r border-zinc-200 flex flex-col items-center pt-2 gap-0.5 shrink-0 overflow-y-auto">
        {SECTIONS.map((section) => {
          const disabled = section.editing && !canEdit;
          return (
            <button
              key={section.key}
              disabled={disabled}
              title={disabled ? "Accesso in sola visualizzazione" : section.label}
              class={`flex flex-col items-center justify-center gap-1 w-[64px] min-h-[58px] shrink-0 rounded-xl bg-transparent border-none transition-all ${
                disabled
                  ? "text-zinc-300 cursor-not-allowed"
                  : activeSection === section.key
                    ? "text-violet-700 bg-violet-50 cursor-pointer"
                    : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 cursor-pointer"
              }`}
              onClick={() => handleSectionClick(section)}
            >
              <section.icon size={20} />
              <span class="text-[9px] leading-tight text-center">{section.label}</span>
            </button>
          );
        })}
      </div>

      <div class="bg-white border-r border-zinc-200 overflow-hidden transition-all duration-200 ease-in-out" style={{ width: activeSection ? "350px" : "0px" }}>
        <div class="w-[350px] h-full flex flex-col">
          {activeSection && (
            <>
              <div class="px-4 pt-3 pb-2 shrink-0 flex items-center justify-between">
                <h2 class="text-sm font-semibold text-zinc-900 m-0">{SECTION_TITLES[activeSection]}</h2>
                {!canEdit && <span class="text-[9px] rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-400">VIEW ONLY</span>}
              </div>
              <div class="flex-1 overflow-y-auto px-4 pb-4">
                {activeSection === "templates" && (
                  <div>
                    <p class="text-zinc-400 text-[11px] mb-3">Applica un layout riutilizzabile. Il lavoro esistente viene prima versionato.</p>
                    <div class="grid grid-cols-2 gap-2">
                      {templates.map((template) => (
                        <div key={template.id} class={applyingTemplateId === template.id ? "opacity-50 pointer-events-none" : ""}>
                          <TemplateCard template={template} onClick={() => void applyTemplate(template)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSection === "elements" && canEdit && <ElementsLibraryV2 />}
                {activeSection === "shapes" && canEdit && <NativeShapesPanel />}
                {activeSection === "tools" && canEdit && <ToolsPanel requestedTool={requestedTool} />}
                {activeSection === "brand" && canEdit && <BrandKitPanel />}

                {activeSection === "text" && (
                  <div class="flex flex-col gap-2">
                    <p class="text-zinc-400 text-[11px] mb-1">Aggiungi un blocco di testo</p>
                    {[
                      { preset: "heading" as const, label: "Aggiungi un titolo", detail: "Montserrat Bold, 48 px", className: "text-lg font-bold" },
                      { preset: "subheading" as const, label: "Aggiungi un sottotitolo", detail: "Inter Medium, 32 px", className: "text-sm font-medium" },
                      { preset: "body" as const, label: "Aggiungi testo", detail: "Inter Regular, 18 px", className: "text-xs" },
                    ].map((item) => (
                      <button key={item.preset} disabled={!canEdit} class="w-full text-left p-3 rounded-xl bg-white border border-zinc-200 cursor-pointer transition-all hover:border-violet-300 hover:bg-violet-50/40 group disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => addText(item.preset)}>
                        <span class={`${item.className} text-zinc-900 group-hover:text-violet-700 transition-colors`}>{item.label}</span>
                        <span class="block text-[10px] text-zinc-400 mt-0.5">{item.detail}</span>
                      </button>
                    ))}
                  </div>
                )}

                {activeSection === "images" && (
                  <div>
                    <p class="text-zinc-400 text-[11px] mb-2">Carica immagini nella libreria privata del cliente</p>
                    <div class="border-2 border-dashed border-zinc-300 rounded-xl p-7 text-center cursor-pointer transition-all hover:border-violet-400 hover:bg-violet-50" onClick={() => canEdit && fileInputRef.current?.click()} onDrop={(event) => { event.preventDefault(); void handleImageUpload(event.dataTransfer?.files ?? null); }} onDragOver={(event) => event.preventDefault()}>
                      <Upload size={25} class="text-zinc-400 mx-auto mb-2" />
                      <p class="text-xs text-zinc-500">{uploading ? "Caricamento…" : "Clicca o trascina qui"}</p>
                      <p class="text-[10px] text-zinc-400 mt-1">PNG, JPG, SVG, WebP · massimo 25 MB</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple class="hidden" onChange={(event) => void handleImageUpload((event.target as HTMLInputElement).files)} />
                  </div>
                )}

                {activeSection === "background" && (
                  <div>
                    <p class="text-zinc-400 text-[11px] mb-2">Colori uniformi</p>
                    <div class="grid grid-cols-4 gap-2 mb-4">
                      {BG_COLORS.map((color) => <button key={color} class="w-full aspect-square rounded-lg border border-zinc-300 cursor-pointer transition-all hover:scale-105 hover:border-violet-400" style={{ background: color }} onClick={() => setBackground("color", color)} />)}
                    </div>
                    <p class="text-zinc-400 text-[11px] mb-2">Colore personalizzato</p>
                    <input type="color" class="w-full h-9 rounded-lg border border-zinc-300 cursor-pointer bg-transparent" onChange={(event) => setBackground("color", (event.target as HTMLInputElement).value)} />
                    <p class="text-zinc-400 text-[11px] mb-2 mt-4">Gradienti</p>
                    <div class="grid grid-cols-3 gap-2 mb-4">
                      {GRADIENT_PRESETS.map((gradient) => <button key={gradient} class="w-full aspect-square rounded-lg border border-zinc-300 cursor-pointer transition-all hover:scale-105 hover:border-violet-400" style={{ background: gradient }} onClick={() => setBackground("gradient", gradient)} />)}
                    </div>
                    <button class="w-full p-3 rounded-xl bg-white border border-zinc-200 cursor-pointer text-xs text-zinc-500 hover:border-violet-300 hover:text-zinc-800 transition-all" onClick={() => bgFileRef.current?.click()}><Upload size={14} class="inline mr-1.5" /> Carica immagine di sfondo</button>
                    <input ref={bgFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden" onChange={(event) => void handleBackgroundUpload((event.target as HTMLInputElement).files)} />
                  </div>
                )}

                {activeSection === "designs" && <DesignList />}
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
