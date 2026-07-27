import { expect, test } from "@playwright/test";
import { openCommand, openFreshDesign } from "./helpers";

test("command palette opens page overview and asset library", async ({ page }) => {
  await openFreshDesign(page);

  await openCommand(page, "Panoramica pagine");
  await expect(page.getByRole("heading", { name: "Panoramica pagine" })).toBeVisible();
  await page.getByRole("button", { name: "Chiudi panoramica" }).click();

  await openCommand(page, "Apri asset picker");
  await expect(page.getByRole("heading", { name: "Libreria immagini e PNG" })).toBeVisible();
  await expect(page.getByText("DDone PNG Studio", { exact: true })).toBeVisible();
  await expect(page.locator('img[src*="/api/studio-raster/"]').first()).toBeVisible();
  await page.keyboard.press("Escape");
});

test("style recipes apply to a selected object", async ({ page }) => {
  await openFreshDesign(page);
  await openCommand(page, "Aggiungi rettangolo");
  const styles = page.getByRole("button", { name: "Stili", exact: true });
  await expect(styles).toBeVisible();
  await styles.click();
  await expect(page.getByRole("heading", { name: "Ricette di stile" })).toBeVisible();
  await page.getByRole("button", { name: /Neon/ }).first().click();
  await page.getByRole("button", { name: /Applica Neon/ }).click();
  await expect(page.getByText(/Neon applicato/)).toBeVisible();
});

test("SVG export matches the normalized golden source @golden", async ({ page }) => {
  await openFreshDesign(page);
  await openCommand(page, "Aggiungi titolo");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export/ }).click();
  await page.getByRole("button", { name: "SVG · pagina corrente" }).click();
  const preflight = page.getByRole("dialog", { name: /Controllo prima dell.export/i });
  if (await preflight.isVisible().catch(() => false)) {
    const override = preflight.getByRole("button", { name: /Esporta comunque|Conferma export/ });
    await override.click();
  }
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const normalized = Buffer.concat(chunks)
    .toString("utf8")
    .replace(/id="[^"]+"/g, 'id="dynamic"')
    .replace(/url\(#[^)]+\)/g, "url(#dynamic)")
    .replace(/\s+/g, " ")
    .trim();
  expect(normalized).toMatchSnapshot("editor-title-export.svg");
});
