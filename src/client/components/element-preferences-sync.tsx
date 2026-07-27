import { useEffect } from "preact/hooks";
import { scopedHeaders } from "../api";
import type { DesignElement } from "../types";

interface ElementCollection {
  id: string;
  name: string;
  elementIds: string[];
}

interface ElementPreferencesPayload {
  favoriteIds: string[];
  favoriteItems: DesignElement[];
  recentItems: DesignElement[];
  collections: ElementCollection[];
}

const FAVORITES_KEY = "ddone_design_element_favorites_v3";
const FAVORITE_ITEMS_KEY = "ddone_design_element_favorite_items_v1";
const RECENTS_KEY = "ddone_design_element_recents_v3";
const COLLECTIONS_KEY = "ddone_design_element_collections_v1";

function readArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function uniqueIds(values: string[], maximum = 1_000): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, maximum);
}

function uniqueItems(values: DesignElement[], maximum: number): DesignElement[] {
  return [...new Map(values.filter((item) => item?.id).map((item) => [item.id, item])).values()].slice(0, maximum);
}

function readLocalPayload(): ElementPreferencesPayload {
  const favoriteIds = uniqueIds(readArray<string>(FAVORITES_KEY));
  const recentItems = uniqueItems(readArray<DesignElement>(RECENTS_KEY), 40);
  const explicitFavoriteItems = readArray<DesignElement>(FAVORITE_ITEMS_KEY);
  return {
    favoriteIds,
    favoriteItems: uniqueItems([
      ...explicitFavoriteItems,
      ...recentItems.filter((item) => favoriteIds.includes(item.id)),
    ], 250),
    recentItems,
    collections: readArray<ElementCollection>(COLLECTIONS_KEY).slice(0, 50),
  };
}

function writeLocalPayload(payload: ElementPreferencesPayload): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(payload.favoriteIds));
  localStorage.setItem(FAVORITE_ITEMS_KEY, JSON.stringify(payload.favoriteItems));
  localStorage.setItem(RECENTS_KEY, JSON.stringify(payload.recentItems));
  localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(payload.collections));
}

function mergePayloads(remote: Partial<ElementPreferencesPayload>, local: ElementPreferencesPayload): ElementPreferencesPayload {
  const favoriteItems = uniqueItems([
    ...(remote.favoriteItems ?? []),
    ...local.favoriteItems,
    ...(remote.recentItems ?? []).filter((item) => (remote.favoriteIds ?? []).includes(item.id)),
  ], 250);
  return {
    favoriteIds: uniqueIds([
      ...(remote.favoriteIds ?? []),
      ...local.favoriteIds,
      ...favoriteItems.map((item) => item.id),
    ]),
    favoriteItems,
    recentItems: uniqueItems([...(remote.recentItems ?? []), ...local.recentItems], 40),
    collections: (remote.collections?.length ? remote.collections : local.collections).slice(0, 50),
  };
}

async function loadRemote(signal?: AbortSignal): Promise<Partial<ElementPreferencesPayload>> {
  const response = await fetch("/api/element-preferences", {
    credentials: "include",
    headers: scopedHeaders(),
    signal,
  });
  const data = await response.json() as Partial<ElementPreferencesPayload> & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Preferenze elementi non disponibili");
  return data;
}

async function saveRemote(payload: ElementPreferencesPayload): Promise<void> {
  const response = await fetch("/api/element-preferences", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...scopedHeaders() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? "Sincronizzazione preferenze non riuscita");
  }
}

/**
 * Bridges the existing local-first Elements UI with authenticated server
 * preferences. It intentionally renders nothing and keeps localStorage as an
 * offline cache. Remote changes are applied immediately and become visible the
 * next time the Elements panel is opened.
 */
export function ElementPreferencesSync() {
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let lastSerialized = "";
    let syncing = false;

    const bootstrap = async () => {
      try {
        const merged = mergePayloads(await loadRemote(controller.signal), readLocalPayload());
        writeLocalPayload(merged);
        lastSerialized = JSON.stringify(merged);
        await saveRemote(merged);
        window.dispatchEvent(new CustomEvent("ddone:element-preferences-synced"));
      } catch (error) {
        if ((error as Error).name !== "AbortError") console.warn("Element preference bootstrap failed", error);
      }
    };

    const interval = window.setInterval(() => {
      if (disposed || syncing) return;
      const payload = readLocalPayload();
      const serialized = JSON.stringify(payload);
      if (serialized === lastSerialized) return;
      syncing = true;
      void saveRemote(payload)
        .then(() => {
          lastSerialized = serialized;
          window.dispatchEvent(new CustomEvent("ddone:element-preferences-synced"));
        })
        .catch((error) => console.warn("Element preference synchronization failed", error))
        .finally(() => { syncing = false; });
    }, 900);

    void bootstrap();
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
