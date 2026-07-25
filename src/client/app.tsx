import WebFont from "webfontloader";
import { useEffect } from "preact/hooks";
import { EditorContext } from "./context";
import { useCanvasState } from "./hooks/use-canvas";
import { useCollaboration } from "./hooks/use-collaboration";
import { useDesigns } from "./hooks/use-designs";
import { useRouter } from "./hooks/use-router";
import { AuthScreen } from "./components/auth-screen";
import { Editor } from "./components/editor";
import { Home } from "./components/home";
import { WorkspaceBar } from "./components/workspace-bar";
import { SessionProvider, useSession } from "./session";

export function App() {
  return (
    <SessionProvider>
      <SessionGate />
    </SessionProvider>
  );
}

function SessionGate() {
  const { loading, user, activeOrganization } = useSession();
  if (loading) {
    return (
      <div class="h-screen grid place-items-center bg-[#f3f4f7]">
        <div class="text-center">
          <div class="spinner !w-7 !h-7 !border-accent/20 !border-t-accent mx-auto mb-3" />
          <p class="text-xs text-zinc-400">Loading workspace…</p>
        </div>
      </div>
    );
  }
  if (!user || !activeOrganization) return <AuthScreen />;
  return <AuthenticatedApplication />;
}

function AuthenticatedApplication() {
  const { user, activeOrganization } = useSession();
  const { navigate, designId } = useRouter();
  const canvasState = useCanvasState();
  const designState = useDesigns(canvasState.getCanvasJSONForPage);
  const readOnly = designState.activeDesign?.effective_role
    ? designState.activeDesign.effective_role === "VIEWER"
    : activeOrganization?.role === "VIEWER";

  const collaboration = useCollaboration({
    designId: designId ?? null,
    pages: designState.pages,
    canvasMap: canvasState.canvasMap,
    user,
    readOnly,
    templateEditRules: designState.activeDesign?.template_edit_rules,
  });

  useEffect(() => {
    WebFont.load({
      google: {
        families: [
          "Inter:400,500,600,700",
          "Playfair Display:400,500,600,700,800,900",
          "Montserrat:400,500,600,700,800,900",
          "Poppins:400,500,600,700",
          "Roboto:400,500,700",
          "Open Sans:400,600,700",
          "Lora:400,700",
          "Raleway:400,500,600",
          "Source Sans Pro:400,600,700",
          "Merriweather:400,700",
        ],
      },
    });
  }, []);

  useEffect(() => {
    if (designId && !designState.loading && designState.activeDesign?.id !== designId) {
      void designState.loadDesign(designId);
    }
  }, [designId, designState.loading, designState.activeDesign?.id]);

  useEffect(() => {
    if (!designState.activeDesign) return;
    const { width, height } = designState.activeDesign;
    if (width && height && (width !== canvasState.canvasWidth || height !== canvasState.canvasHeight)) {
      canvasState.setCanvasSize(width, height);
    }
    canvasState.setTemplateEditRules(designState.activeDesign.template_edit_rules, readOnly);
  }, [
    designState.activeDesign?.id,
    designState.activeDesign?.width,
    designState.activeDesign?.height,
    JSON.stringify(designState.activeDesign?.template_edit_rules),
    readOnly,
  ]);

  useEffect(() => {
    if (designState.pages.length > 0 && !canvasState.activeCanvasId) {
      canvasState.setActiveCanvas(designState.pages[0].id);
    }
  }, [designState.pages, canvasState.activeCanvasId]);

  const contextValue = {
    ...canvasState,
    ...designState,
    activePageId: canvasState.activeCanvasId ?? designState.activePageId,
    navigate,
    readOnly,
    collaborationConnected: collaboration.connected,
    collaborationSynced: collaboration.synced,
    collaborators: collaboration.collaborators,
  };

  return (
    <div class="h-screen w-screen flex flex-col overflow-hidden">
      <WorkspaceBar />
      <div class="flex-1 min-h-0 overflow-auto">
        {designState.loading ? (
          <div class="h-full grid place-items-center bg-[#F3F4F7]">
            <div class="text-center">
              <div class="spinner !w-6 !h-6 !border-accent/30 !border-t-accent mb-3 mx-auto" />
              <p class="text-zinc-400 text-sm">Loading designs…</p>
            </div>
          </div>
        ) : !designId ? (
          <Home
            designs={designState.designs}
            templates={designState.templates}
            navigate={navigate}
            createDesign={designState.createDesign}
            deleteDesign={designState.deleteDesign}
            renameDesign={designState.renameDesign}
            createFromTemplate={designState.createFromTemplate}
            readOnly={readOnly}
          />
        ) : (
          <EditorContext.Provider value={contextValue}>
            <Editor />
          </EditorContext.Provider>
        )}
      </div>
    </div>
  );
}
