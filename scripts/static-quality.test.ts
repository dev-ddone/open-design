import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDesignColor, scoreAuditIssues, type DesignAuditIssue } from "../src/client/canvas/design-audit";
import { STATIC_FORMAT_PRESETS } from "../src/client/canvas/smart-resize";

test("normalizes supported design colors", () => {
  assert.equal(normalizeDesignColor("#ABC"), "#aabbcc");
  assert.equal(normalizeDesignColor("rgb(12, 34, 56)"), "#0c2238");
  assert.equal(normalizeDesignColor("url(#gradient)"), null);
});

test("audit score weighs errors more than warnings", () => {
  const issues: DesignAuditIssue[] = [
    { id: "error", severity: "error", category: "layout", title: "Error", detail: "" },
    { id: "warning", severity: "warning", category: "brand", title: "Warning", detail: "" },
    { id: "info", severity: "info", category: "accessibility", title: "Info", detail: "" },
  ];
  assert.equal(scoreAuditIssues(issues), 82);
});

test("static presets exclude unsupported media and have unique identifiers", () => {
  assert.ok(STATIC_FORMAT_PRESETS.length >= 8);
  assert.equal(new Set(STATIC_FORMAT_PRESETS.map((preset) => preset.id)).size, STATIC_FORMAT_PRESETS.length);
  assert.ok(STATIC_FORMAT_PRESETS.every((preset) => preset.width > 0 && preset.height > 0));
  assert.ok(STATIC_FORMAT_PRESETS.every((preset) => !/video|audio|gif|3d/i.test(`${preset.id} ${preset.label} ${preset.group}`)));
});
