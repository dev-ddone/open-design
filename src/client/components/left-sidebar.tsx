import { useState, useRef, useCallback } from "preact/hooks";
import {
  Type,
  Upload,
  Palette,
  LayoutGrid,
  Sparkles,
  Shapes,
} from "lucide-preact";
import { useEditor } from "../context";
import { useSession } from "../session";
import { TemplateCard } from "./template-card";
import { DesignList } from "./design-list";
import { ElementsLibrary } from "./elements-library";

type Section = "templates" | "elements" | "text" | "images" | "background" | "designs";

const SECTIONS: { key: Section; icon: typeof LayoutGrid; label: string; editing: boolean }[] = [
  { key: "templates", icon: Sparkles, label: "Templates", editing: true },
  { key: "elements", icon: Shapes, label: "Elements", editing: true },
  { key: "text", icon: Type, label: "Text", editing: true },
  { key: "images", icon: Upload, label: "Uploads", editing: true },
  { key: "background", icon: Palette, label: "Bg", editing: true },
  { key: "designs", icon: LayoutGrid, label: "Designs", editing: false },
];

const SECTION_TITLES: Record<Section, string> = {
  templates: "Templates",
  elements: "Elements",
  text: "Text",
  images: "Uploads",
  background: "Background",
  designs: "Designs",
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
  const { addText, addImage, setBackground, templates, loadTemplate } = useEditor();
  const { activeOrganization } = useSession();
  const canEdit = activeOrganization?.role !== "VIEWER";
  const [activeSection, setActiveSection] = useState<Section | null>(canEdit ? "templates" : "designs");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const handleSectionClick = (section: (typeof SECTIONS)[number]) => {
    if (section.editing && !canEdit) return;
    setActiveSection((previous) => (previous === section.key ? null : section.key));
  };

  const handleImageUpload = useCallback(
    async (files: FileList | null) => {
      if (!canEdit || !files?.length) return;
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const form = new FormData();
          form.append("file", file);
          const organizationId = localStorage.getItem("ddone_design_organization_id");
          const response = await fetch("/api/uploads", {
            method: "POST",
            body: form,
            credentials: "include",
            headers: organizationId ? { "X-Organization-ID": organizationId } : {},
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Upload failed");
          if (data.url) await addImage(data.url);
        }
      } catch (error) {
        console.error("Upload failed:", error);
      } finally {
        setUploading(false);
      }
    },
    [addImage, canEdit],
  );

  const handleBackgroundUpload = useCallback(
    async (files: FileList | null) => {
      if (!canEdit || !files?.length) return;
      const form = new FormData();
      form.append("file", files[0]);
      try {
        const organizationId = localStorage.getItem("ddone_design_organization_id");
        const response = await fetch("/api/uploads", {
          method: "POST",
          body: form,
          credentials: "include",
          headers: organizationId ? { "X-Organization-ID": organizationId } : {},
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Upload failed");
        if (data.url) setBackground("image", data.url);
      } catch (error) {
        console.error("Background upload failed:", error);
      }
    },
    [setBackground, canEdit],
  );

  return (
    <aside class="flex flex-row shrink-0">
      <div class="w-[70px] bg-white border-r border-zinc-200 flex flex-col items-center pt-2 gap-0.5 shrink-0">
        {SECTIONS.map((section) => {
          const disabled = section.editing && !canEdit;
          return (
            <button
              key={section.key}
              disabled={disabled}
              title={disabled ? "Viewer role cannot edit" : section.label}
              class={`flex flex-col items-center justify-center gap-0.5 w-[56px] h-[56px] rounded-lg bg-transparent border-none transition-all ${
                disabled
                  ? "text-zinc-300 cursor-not-allowed"
                  : activeSection === section.key
                    ? "text-accent bg-accent/10 cursor-pointer"
                    : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              }`}
              onClick={() => handleSectionClick(section)}
            >
              <section.icon size={20} />
              <span class="text-[10px] leading-tight">{section.label}</span>
            </button>
          );
        })}
      </div>

      <div
        class="bg-white border-r border-zinc-200 overflow-hidden transition-all duration-200 ease-in-out"
        style={{ width: activeSection ? "280px" : "0px" }}
      >
        <div class="w-[280px] h-full flex flex-col">
          {activeSection && (
            <>
              <div class="px-3 pt-3 pb-2 shrink-0 flex items-center justify-between">
                <h2 class="text-xs font-semibold text-zinc-800 uppercase tracking-wide m-0">
                  {SECTION_TITLES[activeSection]}
                </h2>
                {!canEdit && <span class="text-[9px] rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-400">VIEW ONLY</span>}
              </div>
              <div class="flex-1 overflow-y-auto px-3 pb-3">
                {activeSection === "templates" && (
                  <div>
                    <p class="text-zinc-400 text-[11px] mb-3">Apply a reusable layout</p>
                    <div class="grid grid-cols-2 gap-2">
                      {templates.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          onClick={() => canEdit && loadTemplate(template)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {activeSection === "elements" && canEdit && <ElementsLibrary />}

                {activeSection === "text" && (
                  <div class="flex flex-col gap-2">
                    <p class="text-zinc-400 text-[11px] mb-1">Click to add text</p>
                    {[
                      { preset: "heading" as const, label: "Add a heading", detail: "Montserrat Bold, 48px", className: "text-lg font-bold" },
                      { preset: "subheading" as const, label: "Add a subheading", detail: "Inter Medium, 32px", className: "text-sm font-medium" },
                      { preset: "body" as const, label: "Add body text", detail: "Inter Regular, 18px", className: "text-xs" },
                    ].map((item) => (
                      <button
                        key={item.preset}
                        class="w-full text-left p-3 rounded-lg bg-white border border-zinc-200 cursor-pointer transition-all hover:border-accent hover:bg-accent/5 group"
                        onClick={() => addText(item.preset)}
                      >
                        <span class={`${item.className} text-zinc-900 group-hover:text-accent transition-colors`}>{item.label}</span>
                        <span class="block text-[10px] text-zinc-400 mt-0.5">{item.detail}</span>
                      </button>
                    ))}
                  </div>
                )}

                {activeSection === "images" && (
                  <div>
                    <p class="text-zinc-400 text-[11px] mb-2">Upload images to your private workspace</p>
                    <div
                      class="border-2 border-dashed border-zinc-300 rounded-lg p-6 text-center cursor-pointer transition-all hover:border-accent/50 hover:bg-accent/5"
                      onClick={() => fileInputRef.current?.click()}
                      onDrop={(event) => {
                        event.preventDefault();
                        void handleImageUpload(event.dataTransfer?.files ?? null);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                    >
                      <Upload size={24} class="text-zinc-400 mx-auto mb-2" />
                      <p class="text-xs text-zinc-400">{uploading ? "Uploading…" : "Click or drag images here"}</p>
                      <p class="text-[10px] text-zinc-500 mt-1">PNG, JPG, SVG, WebP · max 25 MB</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      multiple
                      class="hidden"
                      onChange={(event) => void handleImageUpload((event.target as HTMLInputElement).files)}
                    />
                  </div>
                )}

                {activeSection === "background" && (
                  <div>
                    <p class="text-zinc-400 text-[11px] mb-2">Solid colors</p>
                    <div class="grid grid-cols-4 gap-1.5 mb-4">
                      {BG_COLORS.map((color) => (
                        <button
                          key={color}
                          class="w-full aspect-square rounded-md border border-zinc-300 cursor-pointer transition-all hover:scale-110 hover:border-accent"
                          style={{ background: color }}
                          onClick={() => setBackground("color", color)}
                        />
                      ))}
                    </div>
                    <p class="text-zinc-400 text-[11px] mb-2">Custom color</p>
                    <input
                      type="color"
                      class="w-full h-8 rounded-md border border-zinc-300 cursor-pointer bg-transparent"
                      onChange={(event) => setBackground("color", (event.target as HTMLInputElement).value)}
                    />
                    <p class="text-zinc-400 text-[11px] mb-2 mt-4">Gradient presets</p>
                    <div class="grid grid-cols-3 gap-1.5 mb-4">
                      {GRADIENT_PRESETS.map((gradient) => (
                        <button
                          key={gradient}
                          class="w-full aspect-square rounded-md border border-zinc-300 cursor-pointer transition-all hover:scale-110 hover:border-accent"
                          style={{ background: gradient }}
                          onClick={() => setBackground("gradient", gradient)}
                        />
                      ))}
                    </div>
                    <button
                      class="w-full p-3 rounded-lg bg-white border border-zinc-200 cursor-pointer text-xs text-zinc-400 hover:border-accent hover:text-zinc-800 transition-all"
                      onClick={() => bgFileRef.current?.click()}
                    >
                      <Upload size={14} class="inline mr-1.5" /> Upload background image
                    </button>
                    <input
                      ref={bgFileRef}
                      type="file"
                      accept="image/*"
                      class="hidden"
                      onChange={(event) => void handleBackgroundUpload((event.target as HTMLInputElement).files)}
                    />
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
