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

export interface RemoteCursor { pageId: string; x: number; y: number; }
export interface RemoteSelection { pageId: string; objectId: string | null; }
export interface Collaborator {
  clientId: number;
  id: string;
  name: string;
  color: string;
  cursor?: RemoteCursor;
  selection?: RemoteSelection;
}
export type CollaborationPhase = "idle" | "connecting" | "connected" | "reconnecting" | "offline" | "error";

interface CollaborationState {
  connected: boolean;
  synced: boolean;
  collaborators: Collaborator[];
  phase: CollaborationPhase;
  reconnectAttempt: number;
  lastConnectedAt: string | null;
  lastSyncedAt: string | null;
  lastRemoteChangeAt: string | null;
  lastError: string | null;
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
const EMPTY_STATE: CollaborationState = {
  connected: false,
  synced: false,
  collaborators: [],
  phase: "idle",
  reconnectAttempt: 0,
  lastConnectedAt: null,
  lastSyncedAt: null,
  lastRemoteChangeAt: null,
  lastError: null,
};

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

export function useCollaboration({ designId, pages, canvasMap, user, readOnly, templateEditRules }: CollaborationOptions): CollaborationState {
  const [state, setState] = useState<CollaborationState>(EMPTY_STATE);

  useEffect(() => {
    if (!designId || !user) {
      setState(EMPTY_STATE);
      return;
    }

    let destroyed = false;
    let reconnectTimer = 0;
    let syncTimer = 0;
    let reconnectAttempt = 0;
    const document = new Y.Doc();
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const provider = new WebsocketProvider(
      `${protocol}//${window.location.host}/api/collaboration`,
      designId,
      document,
      { connect: navigator.onLine, maxBackoffTime: 30_000, resyncInterval: 15_000 },
    );
    const localColor = colorFor(user.id);
    provider.awareness.setLocalStateField("user", { id: user.id, name: user.name, color: localColor });
    setState({ ...EMPTY_STATE, phase: navigator.onLine ? "connecting" : "offline" });

    const clearReconnect = () => { if (reconnectTimer) window.clearTimeout(reconnectTimer); reconnectTimer = 0; };
    const clearSyncTimeout = () => { if (syncTimer) window.clearTimeout(syncTimer); syncTimer = 0; };
    const scheduleReconnect = (reason: string) => {
      if (destroyed) return;
      clearReconnect(); clearSyncTimeout();
      if (!navigator.onLine) {
        setState((current) => ({ ...current, connected: false, synced: false, phase: "offline", lastError: "Connessione Internet assente" }));
        return;
      }
      reconnectAttempt += 1;
      const base = Math.min(30_000, 750 * 2 ** Math.min(6, reconnectAttempt - 1));
      const delay = Math.round(base * (0.85 + Math.random() * 0.3));
      setState((current) => ({ ...current, connected: false, synced: false, phase: "reconnecting", reconnectAttempt, lastError: reason }));
      reconnectTimer = window.setTimeout(() => {
        if (!destroyed && navigator.onLine) {
          setState((current) => ({ ...current, phase: "connecting" }));
          provider.connect();
        }
      }, delay);
    };

    const refreshCollaborators = () => {
      const collaborators: Collaborator[] = [];
      for (const [clientId, awareness] of provider.awareness.getStates()) {
        const value = awareness.user as Omit<Collaborator, "clientId" | "cursor" | "selection"> | undefined;
        if (!value?.id || !value.name || value.id === user.id) continue;
        collaborators.push({ clientId, ...value, cursor: awareness.cursor as RemoteCursor | undefined, selection: awareness.selection as RemoteSelection | undefined });
      }
      setState((current) => ({ ...current, collaborators }));
    };
    const onStatus = ({ status }: { status: string }) => {
      if (status === "connected") {
        reconnectAttempt = 0; clearReconnect(); clearSyncTimeout();
        setState((current) => ({ ...current, connected: true, phase: "connected", reconnectAttempt: 0, lastConnectedAt: new Date().toISOString(), lastError: null }));
        syncTimer = window.setTimeout(() => {
          setState((current) => current.synced ? current : { ...current, phase: "error", lastError: "La connessione è attiva, ma la sincronizzazione sta impiegando troppo tempo." });
        }, 12_000);
      } else {
        scheduleReconnect("Connessione realtime interrotta");
      }
    };
    const onSync = (synced: boolean) => {
      if (synced) {
        clearSyncTimeout();
        setState((current) => ({ ...current, connected: true, synced: true, phase: "connected", lastSyncedAt: new Date().toISOString(), lastError: null }));
      } else setState((current) => ({ ...current, synced: false }));
    };
    const onConnectionError = () => scheduleReconnect("Il server realtime non è raggiungibile");
    const onConnectionClose = () => scheduleReconnect("Il canale realtime è stato chiuso");
    const onOnline = () => { reconnectAttempt = 0; clearReconnect(); setState((current) => ({ ...current, phase: "connecting", lastError: null })); provider.connect(); };
    const onOffline = () => { clearReconnect(); clearSyncTimeout(); provider.disconnect(); setState((current) => ({ ...current, connected: false, synced: false, phase: "offline", lastError: "Connessione Internet assente" })); };

    provider.on("status", onStatus);
    provider.on("sync", onSync);
    (provider as any).on("connection-error", onConnectionError);
    (provider as any).on("connection-close", onConnectionClose);
    provider.awareness.on("change", refreshCollaborators);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    refreshCollaborators();

    const attached = new Map<string, { canvas: fabric.Canvas; cleanup: () => void }>();
    const noteRemoteChange = () => setState((current) => ({ ...current, lastRemoteChangeAt: new Date().toISOString() }));

    const attachCanvas = (pageId: string, canvas: fabric.Canvas) => {
      if (attached.get(pageId)?.canvas === canvas) return;
      attached.get(pageId)?.cleanup();
      ensureCanvasObjectIds(canvas);
      const objects = document.getMap<Record<string, unknown>>(`page:${pageId}:objects`);
      const order = document.getArray<string>(`page:${pageId}:order`);
      const meta = document.getMap<unknown>(`page:${pageId}:meta`);
      let remoteOperationDepth = 0;
      let cursorFrame = 0;
      const isApplyingRemote = () => remoteOperationDepth > 0;

      const reorder = () => {
        const ids = order.toArray();
        ids.forEach((id, index) => { const object = objectById(canvas, id); if (object) (canvas as any).moveObjectTo(object, index); });
        canvas.requestRenderAll();
      };
      const applyObject = async (id: string, value: Record<string, unknown> | undefined) => {
        remoteOperationDepth += 1;
        try {
          const existing = objectById(canvas, id);
          if (!value) { if (existing) canvas.remove(existing); noteRemoteChange(); return; }
          const replacement = await enlivenObject(value);
          if (!replacement) return;
          (replacement as DDoneFabricObject).ddoneId = id;
          const index = existing ? canvas.getObjects().indexOf(existing) : Math.max(order.toArray().indexOf(id), 0);
          if (existing) canvas.remove(existing);
          canvas.insertAt(index, replacement);
          applyEditRules(canvas, templateEditRules, readOnly);
          reorder(); noteRemoteChange();
        } finally { remoteOperationDepth -= 1; }
      };
      const applyAllRemote = async () => {
        if (objects.size === 0) return;
        remoteOperationDepth += 1;
        try {
          for (const object of [...canvas.getObjects()]) canvas.remove(object);
          for (const id of order.toArray()) {
            const value = objects.get(id); if (!value) continue;
            const object = await enlivenObject(value); if (!object) continue;
            (object as DDoneFabricObject).ddoneId = id; canvas.add(object);
          }
          const background = meta.get("backgroundColor");
          if (typeof background === "string") canvas.backgroundColor = background;
          applyEditRules(canvas, templateEditRules, readOnly); canvas.requestRenderAll(); noteRemoteChange();
        } finally { remoteOperationDepth -= 1; }
      };
      const onObjects = (event: Y.YMapEvent<Record<string, unknown>>, transaction: Y.Transaction) => { if (transaction.origin === LOCAL_ORIGIN) return; for (const id of event.keysChanged) void applyObject(id, objects.get(id)); };
      const onOrder = (_event: Y.YArrayEvent<string>, transaction: Y.Transaction) => { if (transaction.origin !== LOCAL_ORIGIN) { reorder(); noteRemoteChange(); } };
      const onMeta = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction) => { if (transaction.origin === LOCAL_ORIGIN) return; const background = meta.get("backgroundColor"); if (typeof background === "string") canvas.backgroundColor = background; canvas.requestRenderAll(); noteRemoteChange(); };
      objects.observe(onObjects); order.observe(onOrder); meta.observe(onMeta);

      const publishObject = (object: fabric.FabricObject) => {
        if (readOnly || isApplyingRemote()) return;
        const id = ensureObjectId(object);
        document.transact(() => { objects.set(id, serializeObject(object)); if (!order.toArray().includes(id)) order.push([id]); }, LOCAL_ORIGIN);
      };
      const removeObject = (object: fabric.FabricObject) => {
        if (readOnly || isApplyingRemote()) return;
        const id = (object as DDoneFabricObject).ddoneId; if (!id) return;
        document.transact(() => { objects.delete(id); const index = order.toArray().indexOf(id); if (index >= 0) order.delete(index, 1); }, LOCAL_ORIGIN);
      };
      const publishMeta = () => { if (readOnly || isApplyingRemote()) return; document.transact(() => meta.set("backgroundColor", typeof canvas.backgroundColor === "string" ? canvas.backgroundColor : ""), LOCAL_ORIGIN); };
      const publishSelection = () => { const object = canvas.getActiveObject(); provider.awareness.setLocalStateField("selection", { pageId, objectId: object ? ensureObjectId(object) : null }); };
      const clearSelection = () => provider.awareness.setLocalStateField("selection", { pageId, objectId: null });
      const publishCursor = (event: any) => {
        if (cursorFrame) cancelAnimationFrame(cursorFrame);
        cursorFrame = requestAnimationFrame(() => {
          const point = typeof (canvas as any).getScenePoint === "function" ? (canvas as any).getScenePoint(event.e) : (canvas as any).getPointer(event.e);
          provider.awareness.setLocalStateField("cursor", { pageId, x: point.x, y: point.y }); cursorFrame = 0;
        });
      };
      const clearCursor = () => provider.awareness.setLocalStateField("cursor", null);
      const onObjectAdded = ({ target }: { target?: fabric.FabricObject }) => { if (target) publishObject(target); };
      const onObjectModified = ({ target }: { target?: fabric.FabricObject }) => { if (target) publishObject(target); };
      const onObjectRemoved = ({ target }: { target?: fabric.FabricObject }) => { if (target) removeObject(target); };
      const onTextChanged = ({ target }: { target?: fabric.FabricObject }) => { if (target) publishObject(target); };

      canvas.on("object:added", onObjectAdded); canvas.on("object:modified", onObjectModified); canvas.on("object:removed", onObjectRemoved); canvas.on("text:changed", onTextChanged);
      canvas.on("selection:created", publishSelection); canvas.on("selection:updated", publishSelection); canvas.on("selection:cleared", clearSelection); canvas.on("mouse:move", publishCursor); canvas.on("mouse:out", clearCursor); (canvas as any).on("ddone:background:changed", publishMeta);

      if (objects.size === 0 && !readOnly) {
        document.transact(() => {
          const ids: string[] = [];
          for (const object of canvas.getObjects()) { const id = ensureObjectId(object); objects.set(id, serializeObject(object)); ids.push(id); }
          if (ids.length) order.push(ids);
          meta.set("backgroundColor", typeof canvas.backgroundColor === "string" ? canvas.backgroundColor : "");
        }, LOCAL_ORIGIN);
      } else void applyAllRemote();
      applyEditRules(canvas, templateEditRules, readOnly);

      const cleanup = () => {
        objects.unobserve(onObjects); order.unobserve(onOrder); meta.unobserve(onMeta);
        canvas.off("object:added", onObjectAdded); canvas.off("object:modified", onObjectModified); canvas.off("object:removed", onObjectRemoved); canvas.off("text:changed", onTextChanged);
        canvas.off("selection:created", publishSelection); canvas.off("selection:updated", publishSelection); canvas.off("selection:cleared", clearSelection); canvas.off("mouse:move", publishCursor); canvas.off("mouse:out", clearCursor); (canvas as any).off("ddone:background:changed", publishMeta);
        if (cursorFrame) cancelAnimationFrame(cursorFrame);
      };
      attached.set(pageId, { canvas, cleanup });
    };

    const discoverCanvases = () => { for (const page of pages) { const canvas = canvasMap.current.get(page.id); if (canvas) attachCanvas(page.id, canvas); } };
    discoverCanvases();
    const discoveryTimer = window.setInterval(discoverCanvases, 350);

    return () => {
      destroyed = true; clearReconnect(); clearSyncTimeout(); window.clearInterval(discoveryTimer);
      provider.off("status", onStatus); provider.off("sync", onSync); (provider as any).off("connection-error", onConnectionError); (provider as any).off("connection-close", onConnectionClose); provider.awareness.off("change", refreshCollaborators);
      window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline);
      for (const entry of attached.values()) entry.cleanup(); provider.destroy(); document.destroy(); setState(EMPTY_STATE);
    };
  }, [designId, user?.id, readOnly, pages, canvasMap, JSON.stringify(templateEditRules)]);

  return state;
}