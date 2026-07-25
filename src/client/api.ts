const ORGANIZATION_STORAGE_KEY = "ddone_design_organization_id";
const CLIENT_STORAGE_KEY = "ddone_design_client_id";

export function getActiveOrganizationId(): string | null {
  return localStorage.getItem(ORGANIZATION_STORAGE_KEY);
}

export function setActiveOrganizationId(id: string | null): void {
  if (id) localStorage.setItem(ORGANIZATION_STORAGE_KEY, id);
  else localStorage.removeItem(ORGANIZATION_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("ddone:organization-changed", { detail: id }));
}

export function getActiveClientId(): string | null {
  return localStorage.getItem(CLIENT_STORAGE_KEY);
}

export function setActiveClientId(id: string | null): void {
  if (id) localStorage.setItem(CLIENT_STORAGE_KEY, id);
  else localStorage.removeItem(CLIENT_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("ddone:client-changed", { detail: id }));
}

export function scopedHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers = { ...extra };
  const organizationId = getActiveOrganizationId();
  const clientId = getActiveClientId();
  if (organizationId) headers["X-Organization-ID"] = organizationId;
  if (clientId) headers["X-Client-ID"] = clientId;
  return headers;
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = scopedHeaders();
  const opts: RequestInit = {
    method,
    headers,
    credentials: "include",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  const response = await fetch(path, opts);
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("ddone:session-expired"));
    const message = typeof data === "object" && data && "error" in data
      ? String((data as { error: unknown }).error)
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}
