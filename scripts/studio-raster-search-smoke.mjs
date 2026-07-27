const BASE_URL = process.env.APP_URL ?? "http://127.0.0.1:3006";

const login = await fetch(`${BASE_URL}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ci-admin-password",
  }),
});
if (!login.ok) throw new Error(`Login failed: ${login.status} ${await login.text()}`);
const session = await login.json();
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
const organizationId = session.organizations?.[0]?.id;
if (!cookie || !organizationId) throw new Error("Missing authenticated Elements context");

const response = await fetch(`${BASE_URL}/api/elements-universe/search?category=graphics&page=1&page_size=48`, {
  headers: {
    Cookie: cookie,
    "X-Organization-ID": organizationId,
  },
});
if (!response.ok) throw new Error(`Elements search failed: ${response.status} ${await response.text()}`);
const result = await response.json();
if (!result.providers?.some((provider) => provider.id === "studio-raster" && provider.enabled)) {
  throw new Error("DDone PNG Studio provider is missing from Elements search");
}
if (!result.items?.some((item) => item.id === "studio-raster:glass-orb-violet" && item.format === "png")) {
  throw new Error("Bundled transparent PNG assets are missing from Elements results");
}
console.log("DDone PNG Studio provider and transparent assets verified through Elements search.");