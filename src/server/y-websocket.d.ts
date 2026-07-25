declare module "y-websocket/bin/utils.js" {
  import type { IncomingMessage } from "node:http";
  import type { WebSocket } from "ws";
  import type * as Y from "yjs";

  export function setupWSConnection(
    connection: WebSocket,
    request: IncomingMessage,
    options?: { docName?: string; gc?: boolean },
  ): void;

  export function setPersistence(persistence: {
    bindState(room: string, document: Y.Doc): Promise<void>;
    writeState(room: string, document: Y.Doc): Promise<void>;
  }): void;
}
