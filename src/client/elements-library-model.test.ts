import assert from "node:assert/strict";
import test from "node:test";
import {
  buildElementSearchParams,
  ELEMENT_COLLECTIONS,
  hasActiveElementFilters,
  summarizeElementProviders,
} from "./elements-library-model";

test("Elements V3 exposes six understandable entry collections", () => {
  assert.equal(ELEMENT_COLLECTIONS.length, 6);
  assert.deepEqual(
    ELEMENT_COLLECTIONS.map((collection) => collection.label),
    ["Grafiche", "Foto", "Cornici e ornamenti", "Layout smart", "Sfondi e texture", "Cibo e drink"],
  );
});

test("search parameters keep provider filtering in one advanced control", () => {
  const all = buildElementSearchParams({
    category: "all",
    query: " pizza ",
    format: "all",
    provider: "all",
    page: 0,
  });
  assert.equal(all.get("q"), "pizza");
  assert.equal(all.get("page"), "1");
  assert.equal(all.has("providers"), false);

  const provider = buildElementSearchParams({
    category: "frames",
    query: "ornamento",
    format: "svg",
    provider: "wikimedia",
    page: 2,
  });
  assert.equal(provider.get("providers"), "wikimedia");
  assert.equal(provider.get("formats"), "svg");
  assert.equal(provider.get("category"), "frames");
});

test("provider summary keeps disabled API sources visible as configuration status", () => {
  const summary = summarizeElementProviders([
    { id: "openverse", label: "Openverse", description: "", enabled: true, capabilities: ["image"], attribution: "" },
    { id: "pexels", label: "Pexels", description: "", enabled: false, capabilities: ["image"], attribution: "" },
    { id: "pexels", label: "Pexels", description: "duplicate", enabled: false, capabilities: ["image"], attribution: "" },
  ]);
  assert.deepEqual(summary.enabled.map((provider) => provider.id), ["openverse"]);
  assert.deepEqual(summary.disabled.map((provider) => provider.id), ["pexels"]);
});

test("active filter state ignores the default browse state", () => {
  assert.equal(hasActiveElementFilters({ category: "all", query: "", format: "all", provider: "all" }), false);
  assert.equal(hasActiveElementFilters({ category: "frames", query: "", format: "all", provider: "all" }), true);
  assert.equal(hasActiveElementFilters({ category: "all", query: "pizza", format: "all", provider: "all" }), true);
});
