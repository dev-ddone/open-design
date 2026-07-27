import { expect, test } from "@playwright/test";
import { openCommand, openFreshDesign } from "./helpers";

test("command palette opens page overview and asset library", async ({ page }) => {
  await openFreshDesign(page);

  await openCommand(page, "Panoramica pagine");
  await expect(page.getByRole("heading", { name: "Panoramica pagine" })).toBeVisible();
  await page.getByRole("button", { name: "Chiudi panoramica" }).click();

  await openCommand(page, "Apri asset picker");
  await expect(page.getByRole("heading", { name: "Libreria immagini e PNG" })).toBeVisible();
  await expect(page.getByText("DDone PNG Studio")).toBeVisible();
  await page.getByRole("button", { name: "Chiudi" }).click().catch(async () => {
    await page.keyboard.press("Escape");
  });
});

test("style recipes apply to a selected object", async ({ page }) => {
  await openFreshDesign(page);
  await openCommand(page, "Aggiungi rettangolo");
  await expect(page.getByRole("button", { name: /Stili/ })).toBeVisible();
  await page.getByRole("button", { name: /Stili/ }).click();
  await expect(page.getByRole("heading", { name: "Ricette di stile" })).toBeVisible();
  await page.getByRole("button", { name: /Neon/ }).click();
  await page.getByRole("button", { name: /Applica Neon/ }).click();
  await expect(page.getByText(/Neon applicato/)).toBeVisible();
});

test("SVG export matches the normalized golden source", async ({ page }) => {
  await openFreshDesign(page);
  await openCommand(page, "Aggiungi titolo");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export/ }).click();
  await page.getByRole("button", { name: "SVG · pagina corrente" }).click();
  const preflight = page.getByRole("dialog", { name: "Controllo prima dell'export" });
  if (await preflight.isVisible().catch(() => false)) {
    await preflight.getByRole("button", { name: "Esporta comunque" }).click();
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