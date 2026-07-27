import assert from "node:assert/strict";
import test from "node:test";
import { EXTRA_STUDIO_RASTER_COUNT, searchExtraStudioRasterPresets } from "./studio-raster-pack-extra.js";

test("expanded PNG Studio includes a meaningful raster catalog", () => {
  assert.ok(EXTRA_STUDIO_RASTER_COUNT >= 30);
  const graphics = searchExtraStudioRasterPresets({ q: "", category: "graphics", limit: 64 });
  assert.ok(graphics.length >= 20);
  assert.ok(graphics.every((item) => item.format === "png" && item.provider === "studio-raster"));
});

test("expanded PNG Studio supports semantic searches and category isolation", () => {
  const mockups = searchExtraStudioRasterPresets({ q: "device", category: "mockups", limit: 64 });
  assert.ok(mockups.some((item) => item.name.includes("smartphone")));
  assert.ok(mockups.some((item) => item.name.includes("laptop")));
  const transparent = searchExtraStudioRasterPresets({ q: "shadow product", category: "graphics", limit: 64 });
  assert.ok(transparent.length >= 1);
  assert.ok(transparent.every((item) => item.transparent));
});
