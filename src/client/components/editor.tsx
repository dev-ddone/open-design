import { CanvasArea } from "./canvas-area";
import { Toolbar } from "./toolbar";
import { SelectionToolbar } from "./selection-toolbar";
import { CropPanel } from "./crop-panel";
import { LeftSidebar } from "./left-sidebar";
import { RightPanel } from "./right-panel";
import { PagesBar } from "./pages-bar";
import { EditorContextMenu } from "./editor-context-menu";
import { ElementPreferencesSync } from "./element-preferences-sync";
import { ReviewCommentPins } from "./review-comment-pins";
import { AssetPickerHost } from "./asset-picker-host";
import { CommandPalette } from "./command-palette";
import { NotificationCenter } from "./notification-center";
import { RemotePresenceOverlay } from "./remote-presence-overlay";
import { CollaborationStatusBanner } from "./collaboration-status-banner";
import { PluginManager } from "./plugin-manager";
import { StyleRecipesPanel } from "./style-recipes-panel";
import { StyleRecipesLauncher } from "./style-recipes-launcher";
import { SmartPlacementGuard } from "./smart-placement-guard";
import { AdvancedEffectsHost } from "./advanced-effects-host";
import { WebAssetsHost } from "./web-assets-host";
import { useEditorShortcuts } from "../hooks/use-editor-shortcuts";

export function Editor() {
  useEditorShortcuts();
  return (
    <div class="relative flex h-full w-full flex-col overflow-hidden">
      <ElementPreferencesSync />
      <SmartPlacementGuard />
      <Toolbar />
      <div class="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50/90 px-3" data-testid="editor-utility-dock">
        <div class="min-w-0"><strong class="block text-[9px] font-semibold text-zinc-600">Risorse rapide</strong><span class="hidden text-[7px] text-zinc-400 sm:block">Contenuti web, stili e notifiche senza coprire il canvas.</span></div>
        <div class="flex shrink-0 items-center gap-2"><WebAssetsHost /><StyleRecipesLauncher /><NotificationCenter /></div>
      </div>
      <CollaborationStatusBanner />
      <SelectionToolbar />
      <div class="flex flex-1 min-h-0 overflow-hidden">
        <LeftSidebar />
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
          <CanvasArea />
          <PagesBar />
        </div>
        <RightPanel />
      </div>
      <RemotePresenceOverlay />
      <ReviewCommentPins />
      <AssetPickerHost />
      <AdvancedEffectsHost />
      <CommandPalette />
      <PluginManager />
      <StyleRecipesPanel />
      <CropPanel />
      <EditorContextMenu />
    </div>
  );
}
