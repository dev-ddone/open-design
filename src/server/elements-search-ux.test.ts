import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogElement } from "./local-asset-packs.js";
import {
  normalizeLocalProviderCategory,
  parseProviderFilter,
  removeRepeatedNonPaginatedItems,
} from "./elements-search-ux.js";

function element(id: string, provider: string): CatalogElement {
  return {
    id,
    name: id,
    category: "icons",
    tags: [],
    provider,
    providerLabel: provider,
    kind: "vector",
    format: "svg",
    transparent: true,
    license: "MIT",
    attributionRequired: false,
    recolorable: true,
  };
}

test("provider filters are trimmed, deduplicated and stable", () => {
  assert.deepEqual(
    parseProviderFilter(" local-tabler,iconify,local-tabler, "),
    ["local-tabler", "iconify"],
  );
});

test("all-category local packs open on a provider-specific useful category", () => {
  assert.equal(normalizeLocalProviderCategory("local-tabler", "all"), "icons");
  assert.equal(normalizeLocalProviderCategory("local-twemoji", "all"), "emoji");
  assert.equal(normalizeLocalProviderCategory("local-structures", "all"), "all");
  assert.equal(normalizeLocalProviderCategory("local-tabler", "social"), "social");
});

test("page one keeps Iconify but later pages remove its repeated first page", () => {
  const items = [
    element("iconify:home", "iconify"),
    element("openverse:photo", "openverse"),
  ];

  assert.deepEqual(removeRepeatedNonPaginatedItems(items, 1), items);
  assert.deepEqual(
    removeRepeatedNonPaginatedItems(items, 2).map((item) => item.id),
    ["openverse:photo"],
  );
});
