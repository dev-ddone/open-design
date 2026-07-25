import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { OpenverseAuthManager } from "../src/server/openverse-auth.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

let tokenRequests = 0;
let imageRequests = 0;
let rejectFirstToken = false;
const authorizations: Array<string | undefined> = [];

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "POST" && url.pathname === "/v1/auth_tokens/token/") {
    tokenRequests += 1;
    const form = new URLSearchParams(await body(request));
    if (
      form.get("grant_type") !== "client_credentials"
      || form.get("client_id") !== "test-client"
      || form.get("client_secret") !== "test-secret"
    ) {
      json(response, 401, { detail: "invalid client" });
      return;
    }
    json(response, 200, {
      access_token: `token-${tokenRequests}`,
      expires_in: 36_000,
      token_type: "Bearer",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/images/") {
    imageRequests += 1;
    const authorization = request.headers.authorization;
    authorizations.push(authorization);
    if (rejectFirstToken && authorization === "Bearer token-1") {
      json(response, 401, { detail: "expired token" });
      return;
    }
    json(response, 200, { results: [], authorization: authorization ?? null });
    return;
  }

  json(response, 404, { detail: "not found" });
});

server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address !== "string", "Fake Openverse server did not start");
const apiUrl = `http://127.0.0.1:${address.port}`;

try {
  const manager = new OpenverseAuthManager({
    apiUrl,
    clientId: "test-client",
    clientSecret: "test-secret",
    requestTimeoutMs: 2_000,
    logger: { info: () => undefined, warn: () => undefined },
  });
  assert(manager.mode === "oauth2-auto", "OAuth2 mode was not selected");

  const [first, second] = await Promise.all([
    manager.fetch(`${apiUrl}/v1/images/?q=first`),
    manager.fetch(`${apiUrl}/v1/images/?q=second`),
  ]);
  assert(first.ok && second.ok, "Concurrent authenticated Openverse requests failed");
  assert(tokenRequests === 1, "Concurrent requests must share one token acquisition");
  assert(
    authorizations.slice(0, 2).every((value) => value === "Bearer token-1"),
    "The acquired token was not attached to concurrent requests",
  );

  rejectFirstToken = true;
  const refreshed = await manager.fetch(`${apiUrl}/v1/images/?q=refresh`);
  assert(refreshed.ok, "A 401 response was not recovered through token refresh");
  assert(tokenRequests === 2, "A 401 response must request exactly one replacement token");
  assert(
    authorizations.at(-2) === "Bearer token-1" && authorizations.at(-1) === "Bearer token-2",
    "The original request was not replayed with the replacement token",
  );

  const anonymousManager = new OpenverseAuthManager({
    apiUrl,
    clientId: "invalid-client",
    clientSecret: "invalid-secret",
    requestTimeoutMs: 2_000,
    failureBackoffMs: 5_000,
    logger: { info: () => undefined, warn: () => undefined },
  });
  const anonymousFallback = await anonymousManager.fetch(`${apiUrl}/v1/images/?q=fallback`);
  assert(anonymousFallback.ok, "Failed OAuth2 credentials must fall back to anonymous Openverse access");
  assert(authorizations.at(-1) === undefined, "Anonymous fallback unexpectedly sent an Authorization header");

  assert(imageRequests === 5, "Unexpected number of fake Openverse image requests");
  console.log("Openverse OAuth2 token sharing, automatic 401 refresh and anonymous fallback verified.");
} finally {
  server.close();
  await once(server, "close");
}
