import type { Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { createYjsServer, type IWebSocket } from "yjs-server";
import { canAccessDesign, tokenFromCookieHeader, verifySessionToken } from "./auth.js";
import { one, pool } from "./db.js";

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function persistDocument(room: string, doc: Y.Doc): Promise<void> {
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  await pool.query(
    `INSERT INTO collaboration_documents(room, state, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (room)
     DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [room, state],
  );
}

function schedulePersistence(room: string, doc: Y.Doc): void {
  const previous = saveTimers.get(room);
  if (previous) clearTimeout(previous);
  saveTimers.set(
    room,
    setTimeout(() => {
      saveTimers.delete(room);
      persistDocument(room, doc).catch((error) =>
        console.error(`Unable to persist collaboration room ${room}`, error),
      );
    }, 750),
  );
}

const collaborationServer = createYjsServer({
  createDoc: () => new Y.Doc(),
  docNameFromRequest: (request) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/api\/collaboration\/([0-9a-f-]+)$/i);
    return match ? `design:${match[1]}` : undefined;
  },
  docStorage: {
    loadDoc: async (room, doc) => {
      const stored = await one<{ state: Buffer }>(
        "SELECT state FROM collaboration_documents WHERE room = $1",
        [room],
      );
      if (stored?.state) Y.applyUpdate(doc, new Uint8Array(stored.state));
    },
    onUpdate: async (room, _update, doc) => {
      schedulePersistence(room, doc);
    },
    storeDoc: async (room, doc) => {
      const timer = saveTimers.get(room);
      if (timer) clearTimeout(timer);
      saveTimers.delete(room);
      await persistDocument(room, doc);
    },
  },
  pingTimeoutMs: 30_000,
});

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  socket.write(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${message}`,
  );
  socket.destroy();
}

export function installCollaborationServer(server: Server): () => void {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    clientTracking: true,
    maxPayload: 10 * 1024 * 1024,
  });

  server.on("upgrade", async (request, socket, head) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const match = url.pathname.match(/^\/api\/collaboration\/([0-9a-f-]+)$/i);
      if (!match) return rejectUpgrade(socket, 404, "Not Found");

      const token = tokenFromCookieHeader(request.headers.cookie);
      const user = token ? await verifySessionToken(token) : null;
      if (!user) return rejectUpgrade(socket, 401, "Unauthorized");

      const designId = match[1];
      const access = await canAccessDesign(user.id, designId, "VIEWER");
      if (!access) return rejectUpgrade(socket, 403, "Forbidden");

      wss.handleUpgrade(request, socket, head, (webSocket) => {
        collaborationServer.handleConnection(webSocket as unknown as IWebSocket, request);
      });
    } catch (error) {
      console.error("WebSocket upgrade failed", error);
      rejectUpgrade(socket, 500, "Internal Server Error");
    }
  });

  return () => {
    collaborationServer.close(1001, 1_000);
    wss.close();
  };
}
