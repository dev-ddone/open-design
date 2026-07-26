import { useEffect } from "preact/hooks";
import * as fabric from "fabric";
import { ensureObjectId } from "../canvas-model";
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
        if (event.shiftKey) {
          const active = canvas.getActiveObject();
          if (!(active instanceof fabric.Group)) return;
          const objects = active.removeAll();
          const transform = active.calcTransformMatrix();
          canvas.remove(active);
          for (const object of objects) {
            fabric.util.addTransformToObject(object, transform);
            ensureObjectId(object);
            canvas.add(object);
          }
          canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
          canvas.requestRenderAll();
          canvas.fire("object:modified", { target: canvas.getActiveObject() } as any);
          return;
        }
        const selected = canvas.getActiveObjects();
        if (selected.length < 2) return;
        const selection = canvas.getActiveObject();
        if (!(selection instanceof fabric.ActiveSelection)) return;
        const group = new fabric.Group(selected, {
          left: selection.left,
          top: selection.top,
          originX: selection.originX,
          originY: selection.originY,
        });
        selected.forEach((object) => canvas.remove(object));
        ensureObjectId(group);
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.requestRenderAll();
        canvas.fire("object:modified", { target: group } as any);
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
