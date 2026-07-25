import { useEffect, useState } from "preact/hooks";
import * as fabric from "fabric";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Page, TemplateEditRules } from "../types";
import type { SessionUser } from "../session";
import {
  applyEditRules,
  ensureCanvasObjectIds,
  ensureObjectId,
  serializeObject,
  type DDoneFabricObject,
} from "../canvas-model";

export interface RemoteCursor {
  pageId: string;
  x: number;
  y: number;
}

export interface RemoteSelection {
  pageId: string;
  objectId: string | null;
}

export interface Collaborator {
  clientId: number;
  id: string;
  name: string;
  color: string;
  cursor?: RemoteCursor;
  selection?: RemoteSelection;
}

interface CollaborationState {
  connected: boolean;
  synced: boolean;
  collaborators: Collaborator[];
}

interface CollaborationOptions {
  designId: string | null;
  pages: Page[];
  canvasMap: { current: Map<string, fabric.Canvas> };
  user: SessionUser | null;
  readOnly: boolean;
  templateEditRules?: TemplateEditRules;
}

const LOCAL_ORIGIN = Symbol("ddone-local-object");
const COLORS = ["#6d5dfc", "#0ea5e9", "#14b8a6", "#f97316", "#ec4899", "#84cc16"];

function colorFor(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function objectById(canvas: fabric.Canvas, id: string): fabric.FabricObject | undefined {
  return canvas.getObjects().find((object) => (object as DDoneFabricObject).ddoneId === id);
}

async function enlivenObject(value: Record<string, unknown>): Promise<fabric.FabricObject | null> {
  const objects = await (fabric.util.enlivenObjects as any)([value]);
  return (objects?.[0] as fabric.FabricObject | undefined) ?? null;
}

export function useCollaboration({
  designId,
  pages,
  canvasMap,
  user,
  readOnly,
  templateEditRules,
}: CollaborationOptions): CollaborationState {
  const [state, setState] = useState<CollaborationState>({
    connected: false,
    synced: false,
    collaborators: [],
  });

  useEffect(() => {
    if (!designId || !user) {
      setState({ connected: false, synced: false, collaborators: [] });
      return;
    }

    const document = new Y.Doc();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const provider = new WebsocketProvider(
      `${protocol}//${window.location.host}/api/collaboration`,
      designId,
      document,
      { connect: true, maxBackoffTime: 5_000 },
    );
    const localColor = colorFor(user.id);
    provider.awareness.setLocalStateField("user", { id: user.id, name: user.name, color: localColor });

    const refreshCollaborators = () => {
      const collaborators: Collaborator[] = [];
      for (const [clientId, awareness] of provider.awareness.getStates()) {
        const value = awareness.user as Omit<Collaborator, "clientId" | "cursor" | "selection"> | undefined;
        if (!value?.id || !value.name || value.id === user.id) continue;
        collaborators.push({
          clientId,
          ...value,
          cursor: awareness.cursor as RemoteCursor | undefined,
          selection: awareness.selection as RemoteSelection | undefined,
        });
      }
      setState((current) => ({ ...current, collaborators }));
    };
    const onStatus = ({ status }: { status: string }) => {
      setState((current) => ({ ...current, connected: status === "connected" }));
    };
    const onSync = (synced: boolean) => setState((current) => ({ ...current, synced }));
    provider.on("status", onStatus);
    provider.on("sync", onSync);
    provider.awareness.on("change", refreshCollaborators);
    refreshCollaborators();

    const attached = new Map<string, {
      canvas: fabric.Canvas;
      cleanup: () => void;
    }>();

    const attachCanvas = (pageId: string, canvas: fabric.Canvas) => {
      if (attached.get(pageId)?.canvas === canvas) return;
      attached.get(pageId)?.cleanup();
      ensureCanvasObjectIds(canvas);

      const objects = document.getMap<Record<string, unknown>>(`page:${pageId}:objects`);
      const order = document.getArray<string>(`page:${pageId}:order`);
      const meta = document.getMap<unknown>(`page:${pageId}:meta`);
      let applyingRemote = false;
      let cursorFrame = 0;

      const reorder = () => {
        const ids = order.toArray();
        ids.forEach((id, index) => {
          const object = objectById(canvas, id);
          if (object) (canvas as any).moveObjectTo(object, index);
        });
        canvas.requestRenderAll();
      };

      const applyObject = async (id: string, value: Record<string, unknown> | undefined) => {
        applyingRemote = true;
        try {
          const existing = objectById(canvas, id);
          if (!value) {
            if (existing) canvas.remove(existing);
            return;
          }
          const replacement = await enlivenObject(value);
          if (!replacement) return;
          (replacement as DDoneFabricObject).ddoneId = id;
          const index = existing ? canvas.getObjects().indexOf(existing) : Math.max(order.toArray().indexOf(id), 0);
          if (existing) canvas.remove(existing);
          canvas.insertAt(index, replacement);
          applyEditRules(canvas, templateEditRules, readOnly);
          reorder();
        } finally {
          applyingRemote = false;
        }
      };

      const applyAllRemote = async () => {
        if (objects.size === 0) return;
        applyingRemote = true;
        try {
          for (const object of [...canvas.getObjects()]) canvas.remove(object);
          for (const id of order.toArray()) {
            const value = objects.get(id);
            if (!value) continue;
            const object = await enlivenObject(value);
            if (!object) continue;
            (object as DDoneFabricObject).ddoneId = id;
            canvas.add(object);
          }
          const background = meta.get("backgroundColor");
          if (typeof background === "string") canvas.backgroundColor = background;
          applyEditRules(canvas, templateEditRules, readOnly);
          canvas.requestRenderAll();
        } finally {
          applyingRemote = false;
        }
      };

      const onObjects = (event: Y.YMapEvent<Record<string, unknown>>, transaction: Y.Transaction) => {
        if (transaction.origin === LOCAL_ORIGIN) return;
        for (const id of event.keysChanged) void applyObject(id, objects.get(id));
      };
      const onOrder = (_event: Y.YArrayEvent<string>, transaction: Y.Transaction) => {
        if (transaction.origin !== LOCAL_ORIGIN) reorder();
      };
      const onMeta = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => {
        if (transaction.origin === LOCAL_ORIGIN) return;
        const background = meta.get("backgroundColor");
        if (typeof background === "string") canvas.backgroundColor = background;
        canvas.requestRenderAll();
      };
      objects.observe(onObjects);
      order.observe(onOrder);
      meta.observe(onMeta);

      const publishObject = (object: fabric.FabricObject) => {
        if (readOnly || applyingRemote) return;
        const id = ensureObjectId(object);
        document.transact(() => {
          objects.set(id, serializeObject(object));
          if (!order.toArray().includes(id)) order.push([id]);
        }, LOCAL_ORIGIN);
      };
      const removeObject = (object: fabric.FabricObject) => {
        if (readOnly || applyingRemote) return;
        const id = (object as DDoneFabricObject).ddoneId;
        if (!id) return;
        document.transact(() => {
          objects.delete(id);
          const index = order.toArray().indexOf(id);
          if (index >= 0) order.delete(index, 1);
        }, LOCAL_ORIGIN);
      };
      const publishMeta = () => {
        if (readOnly || applyingRemote) return;
        document.transact(() => {
          meta.set("backgroundColor", typeof canvas.backgroundColor === "string" ? canvas.backgroundColor : "");
        }, LOCAL_ORIGIN);
      };
      const publishSelection = () => {
        const object = canvas.getActiveObject();
        provider.awareness.setLocalStateField("selection", {
          pageId,
          objectId: object ? ensureObjectId(object) : null,
        });
      };
      const clearSelection = () => {
        provider.awareness.setLocalStateField("selection", { pageId, objectId: null });
      };
      const publishCursor = (event: any) => {
        if (cursorFrame) cancelAnimationFrame(cursorFrame);
        cursorFrame = requestAnimationFrame(() => {
          const point = typeof (canvas as any).getScenePoint === "function"
            ? (canvas as any).getScenePoint(event.e)
            : (canvas as any).getPointer(event.e);
          provider.awareness.setLocalStateField("cursor", { pageId, x: point.x, y: point.y });
          cursorFrame = 0;
        });
      };
      const clearCursor = () => provider.awareness.setLocalStateField("cursor", null);

      canvas.on("object:added", ({ target }) => target && publishObject(target));
      canvas.on("object:modified", ({ target }) => target && publishObject(target));
      canvas.on("object:removed", ({ target }) => target && removeObject(target));
      canvas.on("text:changed", ({ target }) => target && publishObject(target));
      canvas.on("selection:created", publishSelection);
      canvas.on("selection:updated", publishSelection);
      canvas.on("selection:cleared", clearSelection);
      canvas.on("mouse:move", publishCursor);
      canvas.on("mouse:out", clearCursor);

      if (objects.size === 0 && !readOnly) {
        document.transact(() => {
          const ids: string[] = [];
          for (const object of canvas.getObjects()) {
            const id = ensureObjectId(object);
            objects.set(id, serializeObject(object));
            ids.push(id);
          }
          if (ids.length) order.push(ids);
          meta.set("backgroundColor", typeof canvas.backgroundColor === "string" ? canvas.backgroundColor : "");
        }, LOCAL_ORIGIN);
      } else {
        void applyAllRemote();
      }
      applyEditRules(canvas, templateEditRules, readOnly);

      const cleanup = () => {
        objects.unobserve(onObjects);
        order.unobserve(onOrder);
        meta.unobserve(onMeta);
        canvas.off("object:added");
        canvas.off("object:modified");
        canvas.off("object:removed");
        canvas.off("text:changed");
        canvas.off("selection:created", publishSelection);
        canvas.off("selection:updated", publishSelection);
        canvas.off("selection:cleared", clearSelection);
        canvas.off("mouse:move", publishCursor);
        canvas.off("mouse:out", clearCursor);
        if (cursorFrame) cancelAnimationFrame(cursorFrame);
      };
      attached.set(pageId, { canvas, cleanup });
      void publishMeta;
    };

    const discoverCanvases = () => {
      for (const page of pages) {
        const canvas = canvasMap.current.get(page.id);
        if (canvas) attachCanvas(page.id, canvas);
      }
    };
    discoverCanvases();
    const discoveryTimer = setInterval(discoverCanvases, 350);

    return () => {
      clearInterval(discoveryTimer);
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      provider.awareness.off("change", refreshCollaborators);
      for (const entry of attached.values()) entry.cleanup();
      provider.destroy();
      document.destroy();
      setState({ connected: false, synced: false, collaborators: [] });
    };
  }, [designId, user?.id, readOnly, pages, canvasMap, JSON.stringify(templateEditRules)]);

  return state;
}
