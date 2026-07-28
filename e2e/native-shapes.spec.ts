import { expect, test } from "@playwright/test";
import { openFreshDesign } from "./helpers";

test("creates and edits a persistent native circle", async ({ page }) => {
  await openFreshDesign(page);

  await page.getByRole("button", { name: "Forme", exact: true }).click();
  await expect(page.getByTestId("native-shapes-panel")).toBeVisible();

  await page.getByRole("button").filter({ hasText: "Cerchio" }).first().click();
  const inspector = page.getByTestId("native-shape-inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByLabel("Tipo forma")).toHaveValue("circle");

  await inspector.getByLabel("Modalità").selectOption("linear");
  await inspector.getByRole("button", { name: /Nodo/ }).click();
  await inspector.getByRole("button", { name: "Puntinata", exact: true }).click();
  await inspector.getByRole("button", { name: "Applica modifiche", exact: true }).click();

  await expect(inspector.getByText("Forma aggiornata e sincronizzata.", { exact: true })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
});

test("creates an editable progress ring", async ({ page }) => {
  await openFreshDesign(page);

  await page.getByRole("button", { name: "Forme", exact: true }).click();
  await page.getByRole("button").filter({ hasText: "Indicatore circolare" }).click();
  const inspector = page.getByTestId("native-shape-inspector");
  await expect(inspector).toBeVisible();

  const progress = inspector.getByLabel("Avanzamento");
  await expect(progress).toBeVisible();
  await progress.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "42";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await inspector.getByRole("button", { name: "Applica modifiche", exact: true }).click();
  await expect(inspector.getByText("Forma aggiornata e sincronizzata.", { exact: true })).toBeVisible();
});

test("creates a multi-series chart and changes its renderer", async ({ page }) => {
  await openFreshDesign(page);

  await page.getByRole("button", { name: "Forme", exact: true }).click();
  await page.getByRole("button").filter({ hasText: "Barre raggruppate" }).click();

  const chartType = page.getByLabel("Tipo grafico");
  await expect(chartType).toBeVisible();
  await expect(chartType).toHaveValue("grouped-bar");
  await chartType.selectOption("radar");
  await page.getByRole("button", { name: "Serie", exact: true }).click();
  await expect.poll(async () => page.locator("input").evaluateAll((inputs) => inputs.some((input) => (input as HTMLInputElement).value === "Serie 3"))).toBe(true);
  await page.getByRole("button", { name: "Applica modifiche", exact: true }).click();
  await expect(page.getByText("Elemento aggiornato e sincronizzato.", { exact: true })).toBeVisible();
});
