import { WikimediaFetchManager } from "../src/server/wikimedia-fetch.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const requests: Request[] = [];
let wikimediaAttempts = 0;
let unrelatedAttempts = 0;

const fakeFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  requests.push(request);
  const url = new URL(request.url);

  if (url.hostname === "commons.wikimedia.org") {
    wikimediaAttempts += 1;
    if (wikimediaAttempts === 1) {
      return new Response(JSON.stringify({ error: { code: "maxlag" } }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "0",
        },
      });
    }
    return Response.json({ batchcomplete: true, query: { pages: [] } });
  }

  unrelatedAttempts += 1;
  return Response.json({ ok: true });
};

const manager = new WikimediaFetchManager({
  apiUrl: "https://commons.wikimedia.org/w/api.php",
  userAgent: "DDone-Design/2.3 (https://ddone.it) Node.js",
  requestTimeoutMs: 10_000,
  retries: 2,
  fetchImpl: fakeFetch,
  sleep: async () => undefined,
  logger: { info: () => undefined, warn: () => undefined },
});

const response = await manager.fetch(
  "https://commons.wikimedia.org/w/api.php?action=query&generator=search&format=json",
);
assert(response.ok, "Wikimedia request did not recover after a transient 503");
assert(wikimediaAttempts === 2, "Wikimedia transient response was not retried exactly once");

const firstWikimediaRequest = requests[0];
assert(
  firstWikimediaRequest.headers.get("user-agent") === "DDone-Design/2.3 (https://ddone.it) Node.js",
  "Compliant Wikimedia User-Agent was not attached",
);
assert(
  firstWikimediaRequest.headers.get("api-user-agent") === "DDone-Design/2.3 (https://ddone.it) Node.js",
  "Api-User-Agent was not attached",
);
assert(
  new URL(firstWikimediaRequest.url).searchParams.get("maxlag") === "5",
  "MediaWiki maxlag protection was not attached",
);
assert(
  firstWikimediaRequest.headers.get("accept-language") === "it,en;q=0.8",
  "Wikimedia language preference was not attached",
);

const unrelated = await manager.fetch("https://example.com/health");
assert(unrelated.ok, "Unrelated request was blocked by the Wikimedia wrapper");
assert(unrelatedAttempts === 1, "Unrelated request was unexpectedly retried");
const unrelatedRequest = requests.at(-1);
assert(unrelatedRequest, "Unrelated request was not captured");
assert(
  unrelatedRequest.headers.get("api-user-agent") === null,
  "Wikimedia-only headers leaked to another provider",
);

let failedAttempts = 0;
const networkRetryManager = new WikimediaFetchManager({
  apiUrl: "https://commons.wikimedia.org/w/api.php",
  userAgent: "DDone-Design/2.3 (https://ddone.it) Node.js",
  requestTimeoutMs: 10_000,
  retries: 1,
  fetchImpl: (async () => {
    failedAttempts += 1;
    if (failedAttempts === 1) throw new TypeError("fetch failed");
    return Response.json({ query: { pages: [] } });
  }) as typeof fetch,
  sleep: async () => undefined,
  logger: { info: () => undefined, warn: () => undefined },
});

const recovered = await networkRetryManager.fetch(
  "https://commons.wikimedia.org/w/api.php?action=query&format=json",
);
assert(recovered.ok, "Wikimedia network failure was not retried");
assert(failedAttempts === 2, "Network retry count was incorrect");

console.log("Wikimedia identification, maxlag, transient retry and provider isolation verified.");
