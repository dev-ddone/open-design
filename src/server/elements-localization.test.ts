import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import type { AppVariables } from "./auth.js";
import localization, { expandItalianQuery } from "./elements-localization.js";

test("expands Italian pizza searches for web providers", () => {
  const result = expandItalianQuery("pizze scontornate", "food");
  assert.match(result, /italian/);
  assert.match(result, /pizza/);
  assert.match(result, /isolated/);
  assert.match(result, /food/);
});

test("adds ornamental frame vocabulary and category hints", () => {
  const result = expandItalianQuery("cornice barocca con angoli floreali", "frames");
  assert.match(result, /decorative/);
  assert.match(result, /baroque/);
  assert.match(result, /corner/);
  assert.match(result, /floral/);
  assert.match(result, /vector/);
});

test("leaves unrelated generic searches unchanged", () => {
  assert.equal(expandItalianQuery("abstract blue", "all"), "abstract blue");
});

test("localized search redirect stays on the browser public origin", async () => {
  const app = new Hono<{ Variables: AppVariables }>();
  app.route("/", localization);
  app.get("/api/elements-universe/search", (c) => c.json({ ok: true }));

  const response = await app.request("http://app:3006/api/elements-universe/search?q=Pizza&category=food", {
    redirect: "manual",
  });

  assert.equal(response.status, 307);
  const location = response.headers.get("location");
  assert.ok(location);
  assert.match(location, /^\/api\/elements-universe\/search\?/);
  assert.match(location, /q=italian\+pizza\+food/);
  assert.match(location, /_localized=1/);
  assert.doesNotMatch(location, /app:3006|localhost|https?:\/\//);
});
