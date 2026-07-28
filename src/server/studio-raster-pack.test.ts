import assert from "node:assert/strict";
import test from "node:test";
import { searchStudioRasterPresets } from "./studio-raster-pack.js";

test("PNG Studio exposes transparent graphics and raster backgrounds", () => {
  const graphics = searchStudioRasterPresets({ q: "", category: "graphics", limit: 100 });
  const backgrounds = searchStudioRasterPresets({ q: "", category: "backgrounds", limit: 100 });
  assert.ok(graphics.length >= 8);
  assert.ok(graphics.some((item) => item.transparent && item.format === "png"));
  assert.ok(backgrounds.length >= 2);
  assert.ok(backgrounds.every((item) => item.kind === "image" && item.assetUrl?.endsWith(".png")));
});

test("PNG Studio search supports Italian and English tags", () => {
  assert.ok(searchStudioRasterPresets({ q: "ombra", category: "graphics", limit: 20 }).some((item) => /Ombra/i.test(item.name)));
  assert.ok(searchStudioRasterPresets({ q: "watercolor", category: "graphics", limit: 20 }).some((item) => /acquerello/i.test(item.name)));
});