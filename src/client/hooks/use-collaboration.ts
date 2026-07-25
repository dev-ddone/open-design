import { useEffect, useState } from "preact/hooks";
import type * as fabric from "fabric";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Page } from "../types";
import type { SessionUser } from "../session";

export interface Collaborator {
  clientId: number;
  id: string;
  name: string;
  color: string;
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
}

const LOCAL_ORIGIN = Symbol("ddone-local-canvas");
const COLORS = ["#6d5dfc", "#0ea5e9", "#14b8a6", "#f97316", "#ec4899", "#84cc16"];

function colorFor(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return COLORS[hash % COLORS.length];
}

export function useCollaboration({
  designId,
  pages,
  canvasMap,
  user,
  readOnly,
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
    const pageStates = document.getMap<string>("page-canvas-json");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const provider = new WebsocketProvider(
      `${protocol}//${window.location.host}/api/collaboration`,
      designId,
      document,
      { connect: true, maxBackoffTime: 5_000 },
    );

    provider.awareness.setLocalStateField("user", {
      id: user.id,
      name: user.name,
      color: colorFor(user.id),
    });

    const refreshCollaborators = () => {
      const collaborators: Collaborator[] = [];
      for (const [clientId, awareness] of provider.awareness.getStates()) {
        const value = awareness.user as Omit<Collaborator, "clientId"> | undefined;
        if (value?.id && value.name) collaborators.push({ clientId, ...value });
      }
      setState((current) => ({ ...current, collaborators }));
    };

    const onStatus = ({ status }: { status: string }) => {
      setState((current) => ({ ...current, connected: status === "connected" }));
    };
    const onSync = (synced: boolean) => {
      setState((current) => ({ ...current, synced }));
    };
    provider.on("status", onStatus);
    provider.on("sync", onSync);
    provider.awareness.on("change", refreshCollaborators);
    refreshCollaborators();

    const suppress = new Set<string>();
    const attached = new Map<
      string,
      { canvas: fabric.Canvas; update: () => void; timer: ReturnType<typeof setTimeout> | null }
    >();

    const applyRemoteState = async (pageId: string, value: string | undefined) => {
      if (!value) return;
      const canvas = canvasMap.current.get(pageId);
      if (!canvas) return;
      const local = JSON.stringify(canvas.toJSON());
      if (local === value) return;
      suppress.add(pageId);
      try {
        await canvas.loadFromJSON(JSON.parse(value));
        if (readOnly) {
          canvas.selection = false;
          for (const object of canvas.getObjects()) object.set({ selectable: false, evented: false });
        }
        canvas.requestRenderAll();
      } catch (error) {
        console.error(`Unable to apply collaborative state for page ${pageId}`, error);
      } finally {
        setTimeout(() => suppress.delete(pageId), 0);
      }
    };

    const onMapChange = (event: Y.YMapEvent<string>, transaction: Y.Transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;
      for (const pageId of event.keysChanged) {
        void applyRemoteState(pageId, pageStates.get(pageId));
      }
    };
    pageStates.observe(onMapChange);

    const attachCanvas = (pageId: string, canvas: fabric.Canvas) => {
      if (attached.get(pageId)?.canvas === canvas) return;
      if (readOnly) {
        canvas.selection = false;
        for (const object of canvas.getObjects()) object.set({ selectable: false, evented: false });
      }

      const entry = {
        canvas,
        timer: null as ReturnType<typeof setTimeout> | null,
        update: () => undefined,
      };
      entry.update = () => {
        if (readOnly || suppress.has(pageId)) return;
        if (entry.timer) clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          const value = JSON.stringify(canvas.toJSON());
          document.transact(() => pageStates.set(pageId, value), LOCAL_ORIGIN);
          entry.timer = null;
        }, 120);
      };
      canvas.on("object:added", entry.update);
      canvas.on("object:modified", entry.update);
      canvas.on("object:removed", entry.update);
      canvas.on("text:changed", entry.update);
      attached.set(pageId, entry);

      const remote = pageStates.get(pageId);
      if (remote) void applyRemoteState(pageId, remote);
      else if (!readOnly) {
        const local = JSON.stringify(canvas.toJSON());
        if (local !== "{}") document.transact(() => pageStates.set(pageId, local), LOCAL_ORIGIN);
      }
    };

    const discoverCanvases = () => {
      for (const page of pages) {
        const canvas = canvasMap.current.get(page.id);
        if (canvas) attachCanvas(page.id, canvas);
      }
    };
    discoverCanvases();
    const discoveryTimer = setInterval(discoverCanvases, 400);

    return () => {
      clearInterval(discoveryTimer);
      pageStates.unobserve(onMapChange);
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      provider.awareness.off("change", refreshCollaborators);
      for (const entry of attached.values()) {
        if (entry.timer) clearTimeout(entry.timer);
        entry.canvas.off("object:added", entry.update);
        entry.canvas.off("object:modified", entry.update);
        entry.canvas.off("object:removed", entry.update);
        entry.canvas.off("text:changed", entry.update);
      }
      provider.destroy();
      document.destroy();
      setState({ connected: false, synced: false, collaborators: [] });
    };
  }, [designId, user?.id, readOnly, pages, canvasMap]);

  return state;
}
