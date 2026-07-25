import { config } from "./config.js";

interface OpenverseTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
}

interface StoredToken {
  accessToken: string;
  refreshAt: number;
}

export interface OpenverseAuthOptions {
  apiUrl: string;
  clientId?: string;
  clientSecret?: string;
  manualToken?: string;
  requestTimeoutMs: number;
  failureBackoffMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: Pick<Console, "info" | "warn">;
}

export type OpenverseAuthMode = "oauth2-auto" | "manual-token" | "anonymous";

/**
 * Adds Openverse authentication to server-side requests.
 *
 * OAuth2 client credentials take precedence over a manually supplied token.
 * Tokens are cached only in memory, refreshed before expiration and requested
 * through a single shared promise so concurrent searches do not create a token
 * stampede. Authentication failures temporarily fall back to the manual token
 * or anonymous access instead of taking the Elements library offline.
 */
export class OpenverseAuthManager {
  private readonly apiOrigin: string;
  private readonly tokenUrl: URL;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly manualToken?: string;
  private readonly requestTimeoutMs: number;
  private readonly failureBackoffMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly logger: Pick<Console, "info" | "warn">;

  private token?: StoredToken;
  private tokenRequest?: Promise<StoredToken>;
  private retryTokenAfter = 0;
  private warnedUntil = 0;

  constructor(options: OpenverseAuthOptions) {
    const apiUrl = new URL(options.apiUrl);
    this.apiOrigin = apiUrl.origin;
    this.tokenUrl = new URL("/v1/auth_tokens/token/", apiUrl);
    this.clientId = options.clientId?.trim() || undefined;
    this.clientSecret = options.clientSecret?.trim() || undefined;
    this.manualToken = options.manualToken?.trim() || undefined;
    this.requestTimeoutMs = Math.max(1_000, options.requestTimeoutMs);
    this.failureBackoffMs = Math.max(1_000, options.failureBackoffMs ?? 60_000);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? console;

    if (Boolean(this.clientId) !== Boolean(this.clientSecret)) {
      throw new Error("OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET must be configured together");
    }
  }

  get mode(): OpenverseAuthMode {
    if (this.clientId && this.clientSecret) return "oauth2-auto";
    if (this.manualToken) return "manual-token";
    return "anonymous";
  }

  invalidateToken(): void {
    this.token = undefined;
    this.retryTokenAfter = 0;
  }

  private isOpenverseRequest(request: Request): boolean {
    const url = new URL(request.url);
    return url.origin === this.apiOrigin && url.pathname !== this.tokenUrl.pathname;
  }

  private async requestAccessToken(): Promise<StoredToken> {
    const response = await this.fetchImpl(this.tokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "DDone-Design/2.2 openverse-oauth",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
      }),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Openverse token endpoint returned ${response.status}`);
    }

    const data = await response.json() as OpenverseTokenResponse;
    const accessToken = typeof data.access_token === "string" ? data.access_token.trim() : "";
    const expiresIn = Number(data.expires_in);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error("Openverse token endpoint returned an invalid response");
    }

    // Refresh at least 30 seconds early and at most five minutes early.
    const refreshSkewSeconds = Math.min(300, Math.max(30, Math.floor(expiresIn * 0.1)));
    const usableSeconds = Math.max(1, Math.floor(expiresIn - refreshSkewSeconds));
    return {
      accessToken,
      refreshAt: this.now() + usableSeconds * 1_000,
    };
  }

  private async automaticToken(forceRefresh = false): Promise<string> {
    if (!this.clientId || !this.clientSecret) throw new Error("Openverse OAuth2 credentials are not configured");
    if (!forceRefresh && this.token && this.token.refreshAt > this.now()) {
      return this.token.accessToken;
    }
    if (!forceRefresh && this.retryTokenAfter > this.now()) {
      throw new Error("Openverse token acquisition is temporarily backed off");
    }
    if (this.tokenRequest) return (await this.tokenRequest).accessToken;

    this.tokenRequest = this.requestAccessToken()
      .then((token) => {
        this.token = token;
        this.retryTokenAfter = 0;
        this.warnedUntil = 0;
        return token;
      })
      .catch((error) => {
        this.token = undefined;
        this.retryTokenAfter = this.now() + this.failureBackoffMs;
        throw error;
      })
      .finally(() => {
        this.tokenRequest = undefined;
      });

    return (await this.tokenRequest).accessToken;
  }

  private warnAuthenticationFallback(error: unknown): void {
    if (this.warnedUntil > this.now()) return;
    this.warnedUntil = this.now() + this.failureBackoffMs;
    const fallback = this.manualToken ? "the configured manual token" : "anonymous Openverse access";
    const message = error instanceof Error ? error.message : "unknown authentication error";
    this.logger.warn(`Openverse automatic authentication failed; using ${fallback}: ${message}`);
  }

  private async authorization(forceRefresh = false): Promise<string | undefined> {
    if (this.clientId && this.clientSecret) {
      try {
        return `Bearer ${await this.automaticToken(forceRefresh)}`;
      } catch (error) {
        this.warnAuthenticationFallback(error);
      }
    }
    return this.manualToken ? `Bearer ${this.manualToken}` : undefined;
  }

  private requestWithAuthorization(request: Request, authorization?: string): Request {
    const headers = new Headers(request.headers);
    if (authorization) headers.set("Authorization", authorization);
    else headers.delete("Authorization");
    return new Request(request.clone(), { headers });
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    if (!this.isOpenverseRequest(request)) return this.fetchImpl(request);

    const authorization = await this.authorization(false);
    let response = await this.fetchImpl(this.requestWithAuthorization(request, authorization));
    if (response.status !== 401) return response;

    // A 401 usually means the in-memory token was revoked or expired earlier
    // than advertised. Refresh once and replay the original request.
    if (this.clientId && this.clientSecret) {
      this.invalidateToken();
      const refreshedAuthorization = await this.authorization(true);
      response = await this.fetchImpl(this.requestWithAuthorization(request, refreshedAuthorization));
      return response;
    }

    // A stale manually supplied token should not make otherwise-supported
    // anonymous Openverse requests unavailable.
    if (this.manualToken) {
      return this.fetchImpl(this.requestWithAuthorization(request));
    }
    return response;
  }
}

const INSTALLATION_KEY = Symbol.for("ddone.openverse.authenticatedFetch");
type OpenverseGlobal = typeof globalThis & {
  [INSTALLATION_KEY]?: OpenverseAuthManager;
};

export function installOpenverseAuthenticatedFetch(): OpenverseAuthManager {
  const target = globalThis as OpenverseGlobal;
  if (target[INSTALLATION_KEY]) return target[INSTALLATION_KEY];

  const manager = new OpenverseAuthManager({
    apiUrl: config.elements.openverseApiUrl,
    clientId: config.elements.openverseClientId,
    clientSecret: config.elements.openverseClientSecret,
    manualToken: config.elements.openverseToken,
    requestTimeoutMs: config.elements.requestTimeoutMs,
  });
  target[INSTALLATION_KEY] = manager;

  if (manager.mode !== "anonymous") {
    globalThis.fetch = manager.fetch.bind(manager) as typeof fetch;
  }
  console.info(`Openverse authentication mode: ${manager.mode}`);
  return manager;
}
