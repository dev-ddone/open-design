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
import { useEditorShortcuts } from "../hooks/use-editor-shortcuts";

export function Editor() {
  useEditorShortcuts();
  return (
    <div class="relative flex h-full w-full flex-col">
      <ElementPreferencesSync />
      <Toolbar />
      <NotificationCenter />
      <SelectionToolbar />
      <div class="flex flex-1 min-h-0">
        <LeftSidebar />
        <div class="flex-1 flex flex-col min-w-0">
          <CanvasArea />
          <PagesBar />
        </div>
        <RightPanel />
      </div>
      <RemotePresenceOverlay />
      <ReviewCommentPins />
      <AssetPickerHost />
      <CommandPalette />
      <CropPanel />
      <EditorContextMenu />
    </div>
  );
}