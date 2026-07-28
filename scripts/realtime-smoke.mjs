import { readFile } from "node:fs/promises";
import WebSocket from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const [cookieFile = "cookies.txt", designFile = "design.json"] = process.argv.slice(2);

function parseCookieJar(contents) {
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.startsWith("#HttpOnly_") ? rawLine.slice("#HttpOnly_".length) : rawLine;
    if (!line || line.startsWith("#")) continue;
    const fields = line.split("\t");
    if (fields.length >= 7 && fields[5] === "ddone_design_session") {
      return `${fields[5]}=${fields[6]}`;
    }
  }
  throw new Error("Session cookie not found in cookie jar");
}

function waitFor(provider, event, predicate = () => true, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      provider.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const listener = (value) => {
      if (!predicate(value)) return;
      clearTimeout(timeout);
      provider.off(event, listener);
      resolve(value);
    };
    provider.on(event, listener);
  });
}

async function waitUntil(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for synchronized state");
}

const cookie = parseCookieJar(await readFile(cookieFile, "utf8"));
const design = JSON.parse(await readFile(designFile, "utf8"));

class AuthenticatedWebSocket extends WebSocket {
  constructor(address, protocols) {
    super(address, protocols, { headers: { Cookie: cookie } });
  }
}

function createProvider(document) {
  return new WebsocketProvider(
    "ws://127.0.0.1:3006/api/collaboration",
    design.id,
    document,
    {
      WebSocketPolyfill: AuthenticatedWebSocket,
      connect: true,
      maxBackoffTime: 1_000,
    },
  );
}

const first = new Y.Doc();
const second = new Y.Doc();
const firstProvider = createProvider(first);
const secondProvider = createProvider(second);

await Promise.all([
  waitFor(firstProvider, "sync", (synced) => synced === true),
  waitFor(secondProvider, "sync", (synced) => synced === true),
]);

const pageId = "smoke-page";
const firstObjects = first.getMap(`page:${pageId}:objects`);
const secondObjects = second.getMap(`page:${pageId}:objects`);
const firstOrder = first.getArray(`page:${pageId}:order`);
const secondOrder = second.getArray(`page:${pageId}:order`);
const firstMeta = first.getMap(`page:${pageId}:meta`);
const secondMeta = second.getMap(`page:${pageId}:meta`);
const objectA = { type: "Rect", ddoneId: "object-a", left: 10, top: 20, width: 100, height: 80 };
const objectB = { type: "Textbox", ddoneId: "object-b", left: 200, top: 100, text: "Concurrent" };

first.transact(() => {
  firstObjects.set("object-a", objectA);
  firstOrder.push(["object-a"]);
  firstMeta.set("backgroundColor", "#ffffff");
});
second.transact(() => {
  secondObjects.set("object-b", objectB);
  secondOrder.push(["object-b"]);
});

await waitUntil(() =>
  firstObjects.has("object-b")
  && secondObjects.has("object-a")
  && firstOrder.toArray().includes("object-b")
  && secondOrder.toArray().includes("object-a")
  && secondMeta.get("backgroundColor") === "#ffffff",
);

firstProvider.awareness.setLocalStateField("user", {
  id: "first-user",
  name: "First user",
  color: "#6d5dfc",
});
firstProvider.awareness.setLocalStateField("cursor", { pageId, x: 123, y: 456 });
await waitUntil(() =>
  [...secondProvider.awareness.getStates().values()].some(
    (state) => state.user?.id === "first-user" && state.cursor?.x === 123 && state.cursor?.y === 456,
  ),
);

firstProvider.destroy();
secondProvider.destroy();
first.destroy();
second.destroy();

await new Promise((resolve) => setTimeout(resolve, 1_200));

const reconnected = new Y.Doc();
const reconnectProvider = createProvider(reconnected);
await waitFor(reconnectProvider, "sync", (synced) => synced === true);
const restoredObjects = reconnected.getMap(`page:${pageId}:objects`);
const restoredOrder = reconnected.getArray(`page:${pageId}:order`);
await waitUntil(() =>
  restoredObjects.has("object-a")
  && restoredObjects.has("object-b")
  && restoredOrder.toArray().includes("object-a")
  && restoredOrder.toArray().includes("object-b"),
);

reconnectProvider.destroy();
reconnected.destroy();
console.log("Object-level CRDT state, awareness cursors and persisted reconnect state verified.");
