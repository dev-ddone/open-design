import { config } from "./config.js";

const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);

export interface WikimediaFetchOptions {
  apiUrl: string;
  userAgent: string;
  requestTimeoutMs: number;
  retries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  logger?: Pick<Console, "info" | "warn">;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after")?.trim();
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 3_000);
    }
    const date = Date.parse(header);
    if (Number.isFinite(date)) {
      return Math.min(Math.max(date - Date.now(), 0), 3_000);
    }
  }
  return Math.min(250 * 2 ** attempt, 2_000);
}

function retryableNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  return ["AbortError", "TimeoutError"].includes(error.name)
    || /fetch failed|network|socket|timeout|timed out|econnreset|enotfound|eai_again/i.test(error.message);
}

/**
 * Applies Wikimedia's API identification policy to every Commons request and
 * retries short-lived upstream failures without affecting other providers.
 *
 * The manager is intentionally installed after the Openverse wrapper, so each
 * provider keeps its own authentication/identification logic while sharing the
 * same global fetch chain.
 */
export class WikimediaFetchManager {
  private readonly apiOrigin: string;
  private readonly apiPathname: string;
  private readonly userAgent: string;
  private readonly requestTimeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly logger: Pick<Console, "info" | "warn">;
  private warnedUntil = 0;

  constructor(options: WikimediaFetchOptions) {
    const apiUrl = new URL(options.apiUrl);
    this.apiOrigin = apiUrl.origin;
    this.apiPathname = apiUrl.pathname;
    this.userAgent = options.userAgent.trim();
    this.requestTimeoutMs = Math.max(10_000, options.requestTimeoutMs);
    this.retries = Math.max(0, Math.min(options.retries ?? 2, 3));
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? defaultSleep;
    this.logger = options.logger ?? console;
    if (!this.userAgent || !/[<(].+[>)]/.test(this.userAgent)) {
      throw new Error("Wikimedia User-Agent must include contact information");
    }
  }

  private isWikimediaHost(hostname: string): boolean {
    return hostname === "wikimedia.org"
      || hostname.endsWith(".wikimedia.org")
      || hostname === "wikimediausercontent.com"
      || hostname.endsWith(".wikimediausercontent.com");
  }

  private isApiRequest(url: URL): boolean {
    return url.origin === this.apiOrigin && url.pathname === this.apiPathname;
  }

  private prepareRequest(request: Request): Request {
    const url = new URL(request.url);
    if (this.isApiRequest(url) && !url.searchParams.has("maxlag")) {
      // Ask MediaWiki to fail fast while its replication lag is high. A 503 is
      // then retried below instead of leaving the provider hanging until timeout.
      url.searchParams.set("maxlag", "5");
    }

    const headers = new Headers(request.headers);
    headers.set("User-Agent", this.userAgent);
    headers.set("Api-User-Agent", this.userAgent);
    if (!headers.has("Accept-Language")) headers.set("Accept-Language", "it,en;q=0.8");

    return new Request(url, {
      method: request.method,
      headers,
      redirect: request.redirect,
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
  }

  private warnOnce(message: string): void {
    if (this.warnedUntil > Date.now()) return;
    this.warnedUntil = Date.now() + 60_000;
    this.logger.warn(message);
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (!this.isWikimediaHost(url.hostname)) return this.fetchImpl(request);

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.fetchImpl(this.prepareRequest(request));
        if (!TRANSIENT_STATUS_CODES.has(response.status) || attempt === this.retries) {
          if (response.ok) this.warnedUntil = 0;
          return response;
        }

        this.warnOnce(
          `Wikimedia returned ${response.status}; retrying the request with compliant client identification`,
        );
        await this.sleep(retryAfterMilliseconds(response, attempt));
      } catch (error) {
        lastError = error;
        if (!retryableNetworkError(error) || attempt === this.retries) throw error;
        const message = error instanceof Error ? error.message : "unknown network error";
        this.warnOnce(`Wikimedia request failed transiently; retrying: ${message}`);
        await this.sleep(Math.min(250 * 2 ** attempt, 2_000));
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Wikimedia request failed");
  }
}

const INSTALLATION_KEY = "__ddoneWikimediaCompliantFetch" as const;
type WikimediaGlobal = typeof globalThis & {
  [INSTALLATION_KEY]?: WikimediaFetchManager;
};

export function installWikimediaCompliantFetch(): WikimediaFetchManager {
  const target = globalThis as WikimediaGlobal;
  if (target[INSTALLATION_KEY]) return target[INSTALLATION_KEY];

  const manager = new WikimediaFetchManager({
    apiUrl: config.elements.wikimediaApiUrl,
    userAgent: `DDone-Design/2.3 (https://ddone.it; ${config.appUrl}) Node.js`,
    requestTimeoutMs: Math.max(config.elements.requestTimeoutMs, 15_000),
  });
  target[INSTALLATION_KEY] = manager;
  globalThis.fetch = manager.fetch.bind(manager) as typeof fetch;
  console.info("Wikimedia client identification and retry policy enabled");
  return manager;
}
