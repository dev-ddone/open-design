import { readFile } from "node:fs/promises";

const [cookieFile = "cookies.txt", loginFile = "login.json", clientFile = "client.json"] = process.argv.slice(2);
const BASE_URL = process.env.APP_URL ?? "http://127.0.0.1:3006";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCookieJar(contents) {
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.startsWith("#HttpOnly_") ? rawLine.slice("#HttpOnly_".length) : rawLine;
    if (!line || line.startsWith("#")) continue;
    const fields = line.split("\t");
    if (fields.length >= 7 && fields[5] === "ddone_design_session") {
      return `${fields[5]}=${fields[6]}`;
    }
  }
  throw new Error("Session cookie not found in cookie jar");
}

async function getJson(path, headers) {
  const response = await fetch(`${BASE_URL}${path}`, { headers });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new Error(`GET ${path} returned ${response.status}: ${raw}`);
  return data;
}

const cookie = parseCookieJar(await readFile(cookieFile, "utf8"));
const login = JSON.parse(await readFile(loginFile, "utf8"));
const client = JSON.parse(await readFile(clientFile, "utf8"));
const organizationId = login.organizations[0].id;
const headers = {
  Cookie: cookie,
  "X-Organization-ID": organizationId,
  "X-Client-ID": client.id,
};

const registry = await getJson("/api/elements-universe/providers", headers);
assert(Array.isArray(registry.providers), "Provider registry is missing");
assert(registry.providers.some((provider) => provider.id === "builtin" && provider.enabled), "Built-in provider must be enabled");
assert(registry.providers.some((provider) => provider.id === "iconify"), "Iconify provider metadata is missing");
assert(registry.providers.some((provider) => provider.id === "openverse"), "Openverse provider metadata is missing");
assert(registry.providers.some((provider) => provider.id === "wikimedia"), "Wikimedia provider metadata is missing");
assert(registry.providers.some((provider) => provider.id === "pexels"), "Pexels provider metadata is missing");
assert(registry.providers.some((provider) => provider.id === "pixabay"), "Pixabay provider metadata is missing");
assert(registry.providers.some((provider) => provider.id === "freesound"), "Freesound provider metadata is missing");
assert(registry.providers.some((provider) => provider.id === "jamendo"), "Jamendo provider metadata is missing");
assert(registry.providers.some((provider) => provider.id === "sketchfab"), "Sketchfab provider metadata is missing");
for (const category of ["shapes", "graphics", "animations", "videos", "audio", "charts", "tables", "modules", "grids", "mockups", "models3d"]) {
  assert(registry.categories.includes(category), `Category registry is missing ${category}`);
}

const localizationResponse = await fetch(
  `${BASE_URL}/api/elements-universe/search?providers=openverse&category=frames&q=${encodeURIComponent("cornice dorata floreale")}`,
  { headers, redirect: "manual" },
);
assert(localizationResponse.status === 307, "Italian search terms must be expanded through a temporary redirect");
const localizationTarget = new URL(localizationResponse.headers.get("location"), BASE_URL);
assert(localizationTarget.searchParams.get("_localized") === "1", "Localized request marker is missing");
const translatedQuery = localizationTarget.searchParams.get("q") ?? "";
assert(translatedQuery.includes("frame") && translatedQuery.includes("gold") && translatedQuery.includes("floral"), "Italian search translation is incomplete");
assert(!translatedQuery.includes("cornice"), "Italian terms must be replaced instead of overconstraining global search");

const builtins = await getJson(
  "/api/elements-universe/search?providers=builtin&category=ornaments&q=floral&page=1&page_size=12",
  headers,
);
assert(Array.isArray(builtins.items) && builtins.items.length > 0, "Built-in federated search returned no ornaments");
const ornament = builtins.items.find((item) => item.provider === "builtin");
assert(ornament?.kind === "vector", "Built-in ornament must be vector data");
assert(ornament?.format === "svg", "Built-in ornament must expose SVG format metadata");
assert(ornament?.transparent === true, "Built-in ornament must expose transparency metadata");
assert(typeof ornament.license === "string" && ornament.license.length > 0, "Element license metadata is missing");
assert(ornament.attributionRequired === false, "Built-in MIT ornament should not require attribution");
assert(typeof ornament.svg === "string" && ornament.svg.includes("<svg"), "Built-in SVG content is missing");

for (const generatedCategory of ["charts", "tables", "modules", "grids", "mockups", "shapes"]) {
  const generated = await getJson(
    `/api/elements-universe/search?providers=builtin&category=${generatedCategory}&page=1&page_size=12`,
    headers,
  );
  assert(generated.items.length > 0, `Generated ${generatedCategory} category returned no elements`);
  assert(generated.items.every((item) => item.kind === "vector" && item.format === "svg"), `${generatedCategory} must contain editable SVG vectors`);
  assert(generated.items.every((item) => item.transparent === true && item.recolorable === true), `${generatedCategory} must be transparent and recolorable`);
}

const svgCharts = await getJson(
  "/api/elements-universe/search?providers=builtin&category=charts&formats=svg&page=1&page_size=12",
  headers,
);
assert(svgCharts.items.length > 0 && svgCharts.items.every((item) => item.format === "svg"), "SVG format filter did not retain vector charts");

const jpgCharts = await getJson(
  "/api/elements-universe/search?providers=builtin&category=charts&formats=jpg&page=1&page_size=12",
  headers,
);
assert(Array.isArray(jpgCharts.items) && jpgCharts.items.length === 0, "JPG filter must exclude generated SVG charts");
assert(jpgCharts.nextPage === null, "An empty format-filtered result must not advertise another page");

const uploads = await getJson(
  "/api/elements-universe/search?providers=uploads&category=all&q=safe&page=1&page_size=12",
  headers,
);
assert(Array.isArray(uploads.items), "Private asset search response is invalid");
assert(uploads.items.some((item) => item.provider === "uploads" && item.assetUrl?.startsWith("/api/assets/")), "Previously uploaded SVG is not visible in the private provider");

const importedSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#6d5dfc"/></svg>';
const importForm = new FormData();
importForm.append("file", new Blob([importedSvg], { type: "image/svg+xml" }), "persistent-remote.svg");
importForm.append("client_id", client.id);
importForm.append("display_name", "Persistent Remote Asset");
importForm.append("category", "illustrations");
importForm.append("tags", JSON.stringify(["persistent", "remote", "license-test"]));
importForm.append("license", "CC BY 4.0");
importForm.append("author", "DDone CI Author");
importForm.append("source_url", "https://example.com/open-asset-source");
importForm.append("attribution_required", "true");

const importedResponse = await fetch(`${BASE_URL}/api/uploads`, {
  method: "POST",
  headers,
  body: importForm,
});
const importedRaw = await importedResponse.text();
const imported = importedRaw ? JSON.parse(importedRaw) : null;
assert(importedResponse.status === 201, `Persistent asset import returned ${importedResponse.status}: ${importedRaw}`);
assert(imported?.url?.startsWith("/api/assets/"), "Persistent import did not return a stable asset URL");
assert(imported.license === "CC BY 4.0", "Imported asset license was not persisted");
assert(imported.author === "DDone CI Author", "Imported asset author was not persisted");
assert(imported.source_url === "https://example.com/open-asset-source", "Imported asset source URL was not persisted");
assert(imported.attribution_required === true, "Imported asset attribution flag was not persisted");

const cookieOnlyContent = await fetch(`${BASE_URL}${imported.url}`, {
  headers: { Cookie: cookie },
});
assert(cookieOnlyContent.ok, `Stable asset URL is not browser-loadable with the session cookie (${cookieOnlyContent.status})`);
assert((cookieOnlyContent.headers.get("content-type") ?? "").includes("image/svg+xml"), "Stable asset content type is incorrect");
assert((await cookieOnlyContent.text()).includes("<svg"), "Stable asset content is missing");

const importedSearch = await getJson(
  "/api/elements-universe/search?providers=uploads&category=all&q=Persistent&page=1&page_size=12",
  headers,
);
const importedResult = importedSearch.items.find((item) => item.id === `uploads:${imported.asset_id}`);
assert(importedResult, "Persistent imported asset was not indexed by the private provider");
assert(importedResult.kind === "vector" && importedResult.format === "svg", "Private SVG metadata is incorrect");
assert(importedResult.transparent === true && importedResult.recolorable === true, "Private SVG must remain transparent and recolorable");
assert(importedResult.license === "CC BY 4.0", "Private provider lost imported license metadata");
assert(importedResult.author === "DDone CI Author", "Private provider lost imported author metadata");
assert(importedResult.sourceUrl === "https://example.com/open-asset-source", "Private provider lost imported source metadata");
assert(importedResult.attributionRequired === true, "Private provider lost imported attribution metadata");

const empty = await getJson(
  "/api/elements-universe/search?providers=builtin&category=ornaments&q=definitely-no-such-ddone-element&page=1&page_size=12",
  headers,
);
assert(Array.isArray(empty.items) && empty.items.length === 0, "Empty searches must return an empty result list");
assert(empty.nextPage === null, "Empty searches must not advertise another page");

console.log("Federated Elements providers, categories, format filters, Italian search, licenses and persistent imports verified.");
