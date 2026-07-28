import { expect, type Page } from "@playwright/test";

export async function login(page: Page): Promise<void> {
  await page.goto("/");
  const email = page.getByLabel("Email", { exact: true });
  if (await email.isVisible().catch(() => false)) {
    await email.fill(process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByLabel("Password", { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ci-admin-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "My Designs", exact: true })).toBeVisible();
}

export async function openFreshDesign(page: Page): Promise<void> {
  await login(page);
  await page.getByRole("button", { name: "New Design", exact: true }).click();
  await page.waitForURL(/\/design\//);
  const canvas = page.locator("canvas").first();
  try {
    await canvas.waitFor({ state: "visible", timeout: 2_500 });
  } catch {
    const addPage = page.getByRole("button", { name: /Add page|Aggiungi pagina/i }).first();
    await expect(addPage).toBeVisible();
    await addPage.click();
    await expect(canvas).toBeVisible();
  }
  await page.waitForTimeout(500);
}

export async function openCommand(page: Page, title: string): Promise<void> {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  const input = page.getByPlaceholder("Cerca comandi, strumenti o scorciatoie…");
  await expect(input).toBeVisible();
  await input.fill(title);
  const command = page.getByRole("button").filter({ hasText: title }).first();
  await expect(command).toBeVisible();
  await command.click();
}
