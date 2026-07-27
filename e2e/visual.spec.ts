import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import visualGoldens from "./visual-goldens.json";
import { openCommand, openFreshDesign } from "./helpers";

function screenshotHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

test("empty editor shell is visually stable @visual", async ({ page }, testInfo) => {
  await openFreshDesign(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const screenshot = await page.screenshot({
    fullPage: true,
    mask: [
      page.locator("[title='Notifiche']"),
      page.locator("text=Sincronizzato"),
    ],
  });
  await testInfo.attach("editor-empty-actual", { body: screenshot, contentType: "image/png" });
  expect(screenshotHash(screenshot)).toBe(visualGoldens.editorEmptyChromiumLinux);
});

test("asset picker and PNG Studio grid are visually stable @visual", async ({ page }, testInfo) => {
  await openFreshDesign(page);
  await openCommand(page, "Apri asset picker");
  const dialog = page.getByRole("dialog", { name: "Libreria immagini e PNG" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(900);
  const screenshot = await dialog.screenshot();
  await testInfo.attach("asset-picker-actual", { body: screenshot, contentType: "image/png" });
  expect(screenshotHash(screenshot)).toBe(visualGoldens.assetPickerChromiumLinux);
});
