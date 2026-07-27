import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDesignColor, scoreAuditIssues, type DesignAuditIssue } from "../src/client/canvas/design-audit";
import { buildResizeVariantPlan, STATIC_FORMAT_PRESETS } from "../src/client/canvas/smart-resize";
import {
  applyTemplateRecordToCanvasJson,
  normalizeTemplateFieldKey,
  parseCsv,
} from "../src/client/canvas/template-fields";
import { clampCommentAnchor, extractCommentMentions } from "../src/client/review-comments";

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

test("builds deterministic multi-format resize plans", () => {
  const plan = buildResizeVariantPlan(["presentation", "instagram-story", "presentation", "missing"]);
  assert.deepEqual(plan.map((preset) => preset.id), ["instagram-story", "presentation"]);
});

test("extracts unique review mentions and clamps pin coordinates", () => {
  assert.deepEqual(extractCommentMentions("Ciao @Mario, verifica con @mario e @anna@example.com"), ["mario", "anna@example.com"]);
  assert.equal(clampCommentAnchor(-0.5), 0);
  assert.equal(clampCommentAnchor(1.5), 1);
  assert.equal(clampCommentAnchor(Number.NaN), null);
});

test("normalizes semantic field keys", () => {
  assert.equal(normalizeTemplateFieldKey(" Nome Prodotto "), "nome_prodotto");
  assert.equal(normalizeTemplateFieldKey("Prezzo (€)"), "prezzo");
});

test("parses quoted comma CSV and semicolon CSV", () => {
  const comma = parseCsv('Nome prodotto,Prezzo,Descrizione\nPizza,8.00,"Pomodoro, mozzarella"');
  assert.deepEqual(comma.headers, ["nome_prodotto", "prezzo", "descrizione"]);
  assert.equal(comma.records[0].descrizione, "Pomodoro, mozzarella");

  const semicolon = parseCsv("Nome;Prezzo\nMargherita;8,50");
  assert.deepEqual(semicolon.headers, ["nome", "prezzo"]);
  assert.equal(semicolon.records[0].prezzo, "8,50");
});

test("applies data records to serialized text and image fields", () => {
  const source = JSON.stringify({
    version: "6.0.0",
    objects: [
      { type: "textbox", text: "Old", ddoneFieldKey: "title", ddoneFieldType: "text" },
      { type: "image", src: "/old.jpg", ddoneFieldKey: "photo", ddoneFieldType: "image" },
      { type: "group", objects: [{ type: "textbox", text: "0", ddoneFieldKey: "price", ddoneFieldType: "price" }] },
    ],
  });
  const result = applyTemplateRecordToCanvasJson(source, {
    title: "New title",
    photo: "/new.jpg",
    price: "12.00",
  });
  const parsed = JSON.parse(result.canvasJson);
  assert.equal(result.applied, 3);
  assert.equal(parsed.objects[0].text, "New title");
  assert.equal(parsed.objects[1].src, "/new.jpg");
  assert.equal(parsed.objects[2].objects[0].text, "12.00");
});
