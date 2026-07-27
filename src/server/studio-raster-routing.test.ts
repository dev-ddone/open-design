import assert from "node:assert/strict";
import test from "node:test";
import platformApp from "./platform-app.js";

for (const path of [
  "/api/studio-raster/glass-orb-violet.png",
  "/api/studio-raster-extra/phone-mockup.png",
]) {
  test(`bundled raster route serves ${path}`, async () => {
    const response = await platformApp.request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.ok(bytes.length > 4_000);
    assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  });
}
