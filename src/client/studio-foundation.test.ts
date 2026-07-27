import assert from "node:assert/strict";
import test from "node:test";
import { migrateCanvasJsonToBrand } from "./brand/brand-migration";
import { safeExportName } from "./export/batch-zip";
import { parsePluginManifest, pluginConfigurationDefaults, EXAMPLE_PLUGIN_MANIFEST } from "./plugins/sdk";
import { clampCommentAnchor, clampCommentRegion, extractCommentMentions } from "./review-comments";
import { applyColumnMapping, mappedRecordCompleteness, scoreColumnMatch, sheetFromRows, suggestColumnMapping } from "./data/spreadsheet-import";
import type { BrandKit } from "./types";

test("spreadsheet rows receive unique semantic headers and records", () => {
  const sheet = sheetFromRows("Prodotti", [
    ["Nome prodotto", "Prezzo", "Prezzo"],
    ["Pizza", 8.5, 9],
    ["", "", ""],
  ]);
  assert.deepEqual(sheet.headers, ["nome_prodotto", "prezzo", "prezzo_2"]);
  assert.equal(sheet.records.length, 1);
  assert.equal(sheet.records[0].nome_prodotto, "Pizza");
});

test("column mapping prefers exact and semantic matches", () => {
  const targets = [
    { key: "nome_prodotto", label: "Nome prodotto" },
    { key: "prezzo", label: "Prezzo (€)" },
  ];
  const mapping = suggestColumnMapping(["nome_prodotto", "prezzo_euro", "descrizione"], targets);
  assert.equal(mapping.nome_prodotto, "nome_prodotto");
  assert.equal(mapping.prezzo, "prezzo_euro");
  assert.ok(scoreColumnMatch("prezzo_euro", targets[1]) >= 35);
  const records = applyColumnMapping([{ nome_prodotto: "Pizza", prezzo_euro: "8,50" }], mapping);
  assert.deepEqual(records[0], { nome_prodotto: "Pizza", prezzo: "8,50" });
  assert.deepEqual(mappedRecordCompleteness(records[0], ["nome_prodotto", "prezzo"]), { complete: true, missing: [] });
});

test("brand migration updates colors fonts semantic logos and smart data", () => {
  const kit: BrandKit = {
    id: "kit",
    organization_id: "org",
    client_id: null,
    name: "Nuovo brand",
    colors: ["#6d5dfc", "#111827"],
    fonts: ["Montserrat"],
    logos: ["/logo-new.svg"],
    text_styles: [],
    is_default: true,
    created_at: "2026-07-27T00:00:00Z",
    updated_at: "2026-07-27T00:00:00Z",
  };
  const source = JSON.stringify({
    version: "6.0.0",
    objects: [
      { type: "textbox", fill: "#ff0000", fontFamily: "Arial", text: "Titolo" },
      { type: "image", src: "/old.svg", ddoneFieldType: "logo", ddoneFieldKey: "logo" },
      { type: "group", ddoneSmartData: JSON.stringify({ type: "module", variant: "x", accentColor: "#00ff00", textColor: "#222222" }) },
    ],
  });
  const result = migrateCanvasJsonToBrand(source, kit, { replaceColors: true, replaceFonts: true, replaceLogos: true, preserveNeutralColors: false });
  const parsed = JSON.parse(result.canvasJson);
  assert.equal(parsed.objects[0].fontFamily, "Montserrat");
  assert.equal(parsed.objects[1].src, "/logo-new.svg");
  assert.ok(result.stats.colorsChanged >= 1);
  assert.equal(result.stats.fontsChanged, 1);
  assert.equal(result.stats.logosChanged, 1);
  assert.equal(result.stats.smartElementsChanged, 1);
});

test("plugin manifest enforces declared permissions", () => {
  const parsed = parsePluginManifest(EXAMPLE_PLUGIN_MANIFEST);
  assert.equal(parsed.key, "ddone.example.badge");
  assert.deepEqual(pluginConfigurationDefaults(parsed), { label: "NUOVO" });
  assert.throws(() => parsePluginManifest({
    ...EXAMPLE_PLUGIN_MANIFEST,
    permissions: [],
  }), /canvas:write/);
});

test("review anchors and mentions are normalized", () => {
  assert.equal(clampCommentAnchor(4), 1);
  assert.equal(clampCommentAnchor(-2), 0);
  assert.equal(clampCommentRegion(null, 0.25), 0.25);
  assert.equal(clampCommentRegion(0.001, 0.25), 0.02);
  assert.deepEqual(extractCommentMentions("Ciao @mario e @mario, controlla con @anna.rossi"), ["mario", "anna.rossi"]);
});

test("batch export names are filesystem safe", () => {
  assert.equal(safeExportName("Menù Estate / Milano 2026"), "Menu-Estate-Milano-2026");
  assert.equal(safeExportName("***"), "design");
});