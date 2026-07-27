import fs from "node:fs/promises";

const [cookiesPath, loginPath] = process.argv.slice(2);
if (!cookiesPath || !loginPath) throw new Error("Usage: node scripts/element-preferences-smoke.mjs cookies.txt login.json");

const cookieFile = await fs.readFile(cookiesPath, "utf8");
const cookie = cookieFile
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split("\t"))
  .filter((parts) => parts.length >= 7)
  .map((parts) => `${parts[5]}=${parts[6]}`)
  .join("; ");
const login = JSON.parse(await fs.readFile(loginPath, "utf8"));
const organizationId = login.organizations?.[0]?.id;
if (!cookie || !organizationId) throw new Error("Unable to resolve authenticated smoke-test context");

const headers = {
  Cookie: cookie,
  "X-Organization-ID": organizationId,
  "Content-Type": "application/json",
};
const favorite = {
  id: "local-pack:structures:table-menu:svg",
  name: "Tabella menu 4×2",
  category: "tables",
  tags: ["menu", "prezzi"],
  provider: "local-structures",
  providerLabel: "DDone Structures",
  kind: "vector",
  format: "svg",
  transparent: true,
  license: "MIT",
  attributionRequired: false,
  recolorable: true,
};
const payload = {
  favoriteIds: [favorite.id],
  favoriteItems: [favorite],
  recentItems: [favorite],
  collections: [{ id: "11111111-1111-4111-8111-111111111111", name: "Menu", elementIds: [favorite.id] }],
};

const put = await fetch("http://127.0.0.1:3006/api/element-preferences", {
  method: "PUT",
  headers,
  body: JSON.stringify(payload),
});
if (!put.ok) throw new Error(`Preference PUT failed: ${put.status} ${await put.text()}`);

const get = await fetch("http://127.0.0.1:3006/api/element-preferences", { headers });
if (!get.ok) throw new Error(`Preference GET failed: ${get.status} ${await get.text()}`);
const result = await get.json();
if (result.favoriteItems?.[0]?.id !== favorite.id) throw new Error("Favorite item did not persist");
if (result.collections?.[0]?.name !== "Menu") throw new Error("Collection did not persist");
console.log("Cross-device element preference persistence verified.");
