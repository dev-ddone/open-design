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

function createProvider(doc) {
  return new WebsocketProvider(
    "ws://127.0.0.1:3006/api/collaboration",
    design.id,
    doc,
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

const value = JSON.stringify({ version: 1, marker: crypto.randomUUID() });
first.getMap("page-canvas-json").set("smoke-page", value);
await waitUntil(() => second.getMap("page-canvas-json").get("smoke-page") === value);

firstProvider.destroy();
secondProvider.destroy();
first.destroy();
second.destroy();

await new Promise((resolve) => setTimeout(resolve, 1_200));

const reconnected = new Y.Doc();
const reconnectProvider = createProvider(reconnected);
await waitFor(reconnectProvider, "sync", (synced) => synced === true);
await waitUntil(() => reconnected.getMap("page-canvas-json").get("smoke-page") === value);

reconnectProvider.destroy();
reconnected.destroy();
console.log("Realtime collaboration synchronized and restored persisted state.");
