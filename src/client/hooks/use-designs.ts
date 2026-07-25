import { useState, useCallback, useRef, useEffect } from "preact/hooks";
import type { Design, DesignWithPages, Template, Page } from "../types";
import { api, getActiveClientId } from "../api";

export function useDesigns(getCanvasJSONForPage: (pageId: string) => string) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeDesign, setActiveDesign] = useState<Design | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  const activePageIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  const visibleForSelectedClient = useCallback((items: Design[]) => {
    const clientId = getActiveClientId();
    return clientId ? items.filter((design) => design.client_id === clientId) : items;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [loadedDesigns, loadedTemplates] = await Promise.all([
          api<Design[]>("GET", "/api/designs"),
          api<Template[]>("GET", "/api/templates"),
        ]);
        setDesigns(visibleForSelectedClient(loadedDesigns));
        const clientId = getActiveClientId();
        setTemplates(
          loadedTemplates.filter(
            (template) => !template.client_id || !clientId || template.client_id === clientId,
          ),
        );
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [visibleForSelectedClient]);

  const saveDesign = useCallback(async () => {
    if (!activeIdRef.current) return;
    setSaving(true);
    try {
      const currentPages = pages;
      for (const page of currentPages) {
        const json = getCanvasJSONForPage(page.id);
        if (json && json !== "{}") {
          const updatedPage = await api<Page>("PUT", `/api/pages/${page.id}`, {
            canvas_json: json,
          });
          setPages((previous) =>
            previous.map((current) => (current.id === updatedPage.id ? updatedPage : current)),
          );
        }
      }
      const firstPageJson =
        currentPages.length > 0 ? getCanvasJSONForPage(currentPages[0].id) : "{}";
      const updated = await api<Design>("PUT", `/api/designs/${activeIdRef.current}`, {
        canvas_json: firstPageJson,
      });
      setDesigns((previous) =>
        previous.map((design) => (design.id === updated.id ? updated : design)),
      );
      setActiveDesign(updated);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setSaving(false);
    }
  }, [getCanvasJSONForPage, pages]);

  const createDesign = useCallback(async (): Promise<string | undefined> => {
    try {
      const design = await api<Design>("POST", "/api/designs", {
        name: "Untitled Design",
        canvas_json: "{}",
        client_id: getActiveClientId(),
      });
      setDesigns((previous) => [design, ...previous]);
      setActiveDesign(design);
      activeIdRef.current = design.id;
      return design.id;
    } catch (error) {
      console.error("Failed to create design:", error);
    }
  }, []);

  const createFromTemplate = useCallback(
    async (template: Template): Promise<string | undefined> => {
      try {
        const design = await api<Design>("POST", "/api/designs", {
          name: template.name,
          canvas_json: template.canvas_json,
          width: template.width,
          height: template.height,
          client_id: getActiveClientId(),
        });
        setDesigns((previous) => [design, ...previous]);
        return design.id;
      } catch (error) {
        console.error("Failed to create from template:", error);
      }
    },
    [],
  );

  const loadDesign = useCallback(async (id: string) => {
    try {
      const design = await api<DesignWithPages>("GET", `/api/designs/${id}`);
      setActiveDesign(design);
      activeIdRef.current = design.id;
      setPages(design.pages);
      setActivePageId(design.pages[0]?.id ?? null);
    } catch (error) {
      console.error("Failed to load design:", error);
    }
  }, []);

  const deleteDesign = useCallback(async (id: string) => {
    try {
      await api<{ ok: boolean }>("DELETE", `/api/designs/${id}`);
      setDesigns((previous) => previous.filter((design) => design.id !== id));
      if (activeIdRef.current === id) {
        setActiveDesign(null);
        activeIdRef.current = null;
      }
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  }, []);

  const renameDesign = useCallback(async (id: string, name: string) => {
    try {
      const updated = await api<Design>("PUT", `/api/designs/${id}`, { name });
      setDesigns((previous) =>
        previous.map((design) => (design.id === updated.id ? updated : design)),
      );
      if (activeIdRef.current === id) setActiveDesign(updated);
    } catch (error) {
      console.error("Failed to rename:", error);
    }
  }, []);

  const addPage = useCallback(
    async (afterPageId?: string) => {
      if (!activeIdRef.current) return;
      try {
        const input: Record<string, unknown> = {};
        if (afterPageId) {
          const afterPage = pages.find((page) => page.id === afterPageId);
          if (afterPage) input.after_sort_order = afterPage.sort_order;
        }
        const page = await api<Page>(
          "POST",
          `/api/designs/${activeIdRef.current}/pages`,
          input,
        );
        const design = await api<DesignWithPages>(
          "GET",
          `/api/designs/${activeIdRef.current}`,
        );
        setPages(design.pages);
        setActivePageId(page.id);
      } catch (error) {
        console.error("Failed to add page:", error);
      }
    },
    [pages],
  );

  const duplicatePage = useCallback(
    async (pageId: string) => {
      const json = getCanvasJSONForPage(pageId);
      if (json && json !== "{}") {
        try {
          await api<Page>("PUT", `/api/pages/${pageId}`, { canvas_json: json });
        } catch {
          // Best effort: duplication can still use the last persisted page state.
        }
      }
      try {
        const page = await api<Page>("POST", `/api/pages/${pageId}/duplicate`, {});
        if (activeIdRef.current) {
          const design = await api<DesignWithPages>(
            "GET",
            `/api/designs/${activeIdRef.current}`,
          );
          setPages(design.pages);
        }
        setActivePageId(page.id);
      } catch (error) {
        console.error("Failed to duplicate page:", error);
      }
    },
    [getCanvasJSONForPage],
  );

  const deletePage = useCallback(
    async (pageId: string) => {
      try {
        await api<{ ok: boolean }>("DELETE", `/api/pages/${pageId}`);
        const remaining = pages.filter((page) => page.id !== pageId);
        setPages(remaining);
        if (activePageIdRef.current === pageId && remaining.length > 0) {
          setActivePageId(remaining[0].id);
        }
      } catch (error) {
        console.error("Failed to delete page:", error);
      }
    },
    [pages],
  );

  const renamePage = useCallback(async (pageId: string, title: string) => {
    try {
      const updated = await api<Page>("PUT", `/api/pages/${pageId}`, { title });
      setPages((previous) =>
        previous.map((page) => (page.id === updated.id ? updated : page)),
      );
    } catch (error) {
      console.error("Failed to rename page:", error);
    }
  }, []);

  const switchToPage = useCallback((pageId: string) => {
    setActivePageId(pageId);
  }, []);

  const activePage = pages.find((page) => page.id === activePageId) ?? null;

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void saveDesign(), 2_000);
  }, [saveDesign]);

  return {
    designs,
    templates,
    activeDesign,
    setActiveDesign,
    activeIdRef,
    loading,
    saving,
    createDesign,
    createFromTemplate,
    loadDesign,
    saveDesign,
    deleteDesign,
    renameDesign,
    scheduleSave,
    pages,
    activePageId,
    activePage,
    addPage,
    duplicatePage,
    deletePage,
    renamePage,
    switchToPage,
  };
}
