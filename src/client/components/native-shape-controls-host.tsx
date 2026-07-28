import { useEffect } from "preact/hooks";
import { configureNativeShapeControls } from "../canvas/native-shape-controls";
import { useEditor } from "../context";

export function NativeShapeControlsHost() {
  const { canvas, selectedObject } = useEditor();

  useEffect(() => {
    if (!canvas) return;
    const configureActive = () => {
      configureNativeShapeControls(canvas.getActiveObject() ?? selectedObject);
      canvas.requestRenderAll();
    };
    configureActive();
    canvas.on("selection:created", configureActive);
    canvas.on("selection:updated", configureActive);
    canvas.on("object:modified", configureActive);
    canvas.on("object:added", configureActive);
    return () => {
      canvas.off("selection:created", configureActive);
      canvas.off("selection:updated", configureActive);
      canvas.off("object:modified", configureActive);
      canvas.off("object:added", configureActive);
    };
  }, [canvas, selectedObject]);

  return null;
}
