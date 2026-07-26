import * as fabric from "fabric";
import { ensureObjectId, type DDoneFabricObject } from "../canvas-model";
import { isSmartElement } from "./smart-elements";

export function isActiveSelection(object: fabric.FabricObject | null | undefined): object is fabric.ActiveSelection {
  return object instanceof fabric.ActiveSelection;
}

export function canUngroupObject(object: fabric.FabricObject | null | undefined): object is fabric.Group {
  return object instanceof fabric.Group && !isSmartElement(object);
}

export function groupActiveSelection(canvas: fabric.Canvas): fabric.Group | null {
  const active = canvas.getActiveObject();
  if (!(active instanceof fabric.ActiveSelection)) return null;
  const selected = canvas.getActiveObjects();
  if (selected.length < 2) return null;

  const group = new fabric.Group(selected, {
    left: active.left,
    top: active.top,
    originX: active.originX,
    originY: active.originY,
    objectCaching: false,
    subTargetCheck: false,
    interactive: false,
  });
  const metadata = group as fabric.Group & DDoneFabricObject;
  metadata.ddoneName = `Gruppo (${selected.length} elementi)`;
  ensureObjectId(group);

  selected.forEach((object) => canvas.remove(object));
  canvas.add(group);
  canvas.setActiveObject(group);
  group.setCoords();
  canvas.requestRenderAll();
  canvas.fire("object:modified", { target: group } as any);
  return group;
}

export function ungroupActiveObject(canvas: fabric.Canvas): fabric.FabricObject[] | null {
  const active = canvas.getActiveObject();
  if (!canUngroupObject(active)) return null;

  const objects = active.removeAll();
  const transform = active.calcTransformMatrix();
  canvas.remove(active);
  for (const object of objects) {
    fabric.util.addTransformToObject(object, transform);
    ensureObjectId(object);
    object.set({ selectable: true, evented: true });
    canvas.add(object);
  }

  canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
  canvas.requestRenderAll();
  canvas.fire("object:modified", { target: canvas.getActiveObject() } as any);
  return objects;
}
