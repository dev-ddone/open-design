import { useEffect } from "preact/hooks";
import { groupActiveSelection, ungroupActiveObject } from "../canvas/grouping";
import { useEditor } from "../context";

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

export function useEditorShortcuts(): void {
  const {
    canvas,
    readOnly,
    cropState,
    cancelCrop,
    deleteSelected,
    duplicateSelected,
    undo,
    redo,
  } = useEditor();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (readOnly || isTypingTarget(event.target)) return;
      const modifier = event.ctrlKey || event.metaKey;

      if (cropState.active && event.key === "Escape") {
        event.preventDefault();
        cancelCrop();
        return;
      }

      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicateSelected();
        return;
      }
      if (!canvas) return;

      if (modifier && event.key.toLowerCase() === "g") {
        event.preventDefault();
        event.shiftKey ? ungroupActiveObject(canvas) : groupActiveSelection(canvas);
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (event.key === "Escape") {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        return;
      }

      const direction = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key);
      if (!direction) return;
      const active = canvas.getActiveObject();
      if (!active || !active.selectable) return;
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") active.set("left", (active.left ?? 0) - amount);
      if (event.key === "ArrowRight") active.set("left", (active.left ?? 0) + amount);
      if (event.key === "ArrowUp") active.set("top", (active.top ?? 0) - amount);
      if (event.key === "ArrowDown") active.set("top", (active.top ?? 0) + amount);
      active.setCoords();
      canvas.requestRenderAll();
      canvas.fire("object:modified", { target: active } as any);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canvas, readOnly, cropState.active, cancelCrop, deleteSelected, duplicateSelected, undo, redo]);
}
