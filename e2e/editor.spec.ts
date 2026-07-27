import { expect, test } from "@playwright/test";
import { openCommand, openFreshDesign } from "./helpers";

test("command palette opens page overview and asset library", async ({ page }) => {
  await openFreshDesign(page);

  await openCommand(page, "Panoramica pagine");
  await expect(page.getByRole("heading", { name: "Panoramica pagine" })).toBeVisible();
  await page.getByRole("button", { name: "Chiudi panoramica" }).click();

  await openCommand(page, "Apri asset picker");
  await expect(page.getByRole("heading", { name: "Libreria immagini e PNG" })).toBeVisible();
  await page.getByRole("button", { name: "PNG e grafiche", exact: true }).click();
  const studioProvider = page.getByRole("button", { name: "DDone PNG Studio", exact: true });
  await expect(studioProvider).toBeVisible();
  await studioProvider.click();
  await expect(page.locator('img[src*="/api/studio-raster"]').first()).toBeVisible();
  await page.keyboard.press("Escape");
});

test("web library exposes curated pizza and ornamental searches", async ({ page }) => {
  await openFreshDesign(page);
  await page.getByRole("button", { name: "Web", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Libreria web" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Pizze/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Cornici ornamentali/ })).toBeVisible();
  await expect(dialog.getByPlaceholder(/Pizza, cornice barocca/)).toBeVisible();
});

test("gradient and dissolve tools expose editable nodes", async ({ page }) => {
  await openFreshDesign(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ddone:open-tool", { detail: { tool: "gradient" } })));
  const gradient = page.getByRole("dialog", { name: "Gradiente avanzato" });
  await expect(gradient).toBeVisible();
  await expect(gradient.getByText(/Doppio clic sulla barra/)).toBeVisible();
  await expect(gradient.getByText("Nodo selezionato")).toBeVisible();
  await gradient.getByRole("button", { name: "Aggiungi nodo" }).click();
  await expect(gradient.getByTitle(/%/).first()).toBeVisible();
  await gradient.getByRole("button", { name: /close|chiudi/i }).click().catch(async () => page.keyboard.press("Escape"));

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ddone:open-tool", { detail: { tool: "dissolve" } })));
  const dissolve = page.getByRole("dialog", { name: "Dissolvenza avanzata" });
  await expect(dissolve).toBeVisible();
  await expect(dissolve.getByText("Nodi alpha")).toBeVisible();
  await expect(dissolve.getByText("Inizio dissolvenza")).toBeVisible();
  await expect(dissolve.getByText("Fine dissolvenza")).toBeVisible();
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

  await page.getByRole("button", { name: /Export/ }).click();
  await page.getByRole("button", { name: "SVG · pagina corrente" }).click();
  const preflight = page.getByRole("dialog", { name: /Controllo prima dell.export/i });
  await expect(preflight).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await preflight.getByRole("button", { name: /Esporta comunque|Conferma export/ }).click();
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
