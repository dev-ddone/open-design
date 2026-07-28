import assert from "node:assert/strict";
import test from "node:test";
import { expandItalianQuery } from "./elements-localization.js";

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
