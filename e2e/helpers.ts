import { expect, type Page } from "@playwright/test";

export async function login(page: Page): Promise<void> {
  await page.goto("/");
  const email = page.getByPlaceholder("Email");
  if (await email.isVisible().catch(() => false)) {
    await email.fill(process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com");
    await page.getByPlaceholder("Password").fill(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ci-admin-password");
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page.getByText("What will you design today?", { exact: true })).toBeVisible();
}

export async function openFreshDesign(page: Page): Promise<void> {
  await login(page);
  await page.getByRole("button", { name: "New design", exact: true }).click();
  await page.waitForURL(/\/design\//);
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.waitForTimeout(700);
}

export async function openCommand(page: Page, title: string): Promise<void> {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  const input = page.getByPlaceholder("Cerca comandi, strumenti o scorciatoie…");
  await expect(input).toBeVisible();
  await input.fill(title);
  await page.getByRole("button", { name: new RegExp(title, "i") }).first().click();
}