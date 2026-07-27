import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import visualGoldens from "./visual-goldens";
import { openCommand, openFreshDesign } from "./helpers";

function screenshotHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function stabilizeVisualState(page: import("@playwright/test").Page): Promise<void> {
  await page.addStyleTag({
    content: `
      [data-testid="notification-center-trigger"],
      div.hidden.lg\\:flex.items-center.gap-2 {
        visibility: hidden !important;
      }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(() => document.fonts.ready);
}

test("empty editor shell is visually stable @visual", async ({ page }, testInfo) => {
  await openFreshDesign(page);
  await stabilizeVisualState(page);
  await page.waitForTimeout(250);
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach("editor-empty-actual", { body: screenshot, contentType: "image/png" });
  expect(screenshotHash(screenshot)).toBe(visualGoldens.editorEmptyChromiumLinux);
});

test("asset picker and PNG Studio grid are visually stable @visual", async ({ page }, testInfo) => {
  await openFreshDesign(page);
  await openCommand(page, "Apri asset picker");
  const dialog = page.getByRole("dialog", { name: "Libreria immagini e PNG" });
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "PNG e grafiche", exact: true }).click();
  const studioProvider = page.getByRole("button", { name: "DDone PNG Studio", exact: true });
  await expect(studioProvider).toBeVisible();
  await studioProvider.click();
  await expect(page.locator('img[src*="/api/studio-raster"]').first()).toBeVisible();
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('[role="dialog"] img[src*="/api/studio-raster"]'));
    return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0);
  });
  await stabilizeVisualState(page);
  await page.waitForTimeout(250);
  const screenshot = await dialog.screenshot();
  await testInfo.attach("asset-picker-actual", { body: screenshot, contentType: "image/png" });
  expect(screenshotHash(screenshot)).toBe(visualGoldens.assetPickerChromiumLinux);
});
