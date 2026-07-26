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

function hasPngSignature(bytes) {
  const expected = [137, 80, 78, 71, 13, 10, 26, 10];
  return bytes.length >= expected.length && expected.every((value, index) => bytes[index] === value);
}

function pngDeclaresAlpha(bytes) {
  if (!hasPngSignature(bytes)) return false;
  let offset = 8;
  let colorType;
  while (offset + 12 <= bytes.length) {
    const length = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const dataOffset = offset + 8;
    if (type === "IHDR" && length >= 10) colorType = bytes[dataOffset + 9];
    if (type === "tRNS") return true;
    if (type === "IEND") break;
    offset += length + 12;
  }
  return colorType === 4 || colorType === 6;
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
for (const providerId of ["local-structures", "local-tabler", "local-twemoji", "uploads", "iconify", "openverse", "wikimedia", "pexels", "pixabay"]) {
  assert(registry.providers.some((provider) => provider.id === providerId), `Provider registry is missing ${providerId}`);
}
for (const unsupportedProvider of ["giphy", "freesound", "jamendo", "sketchfab"]) {
  assert(!registry.providers.some((provider) => provider.id === unsupportedProvider), `Unsupported provider ${unsupportedProvider} must not be exposed`);
}
for (const category of ["shapes", "graphics", "photos", "charts", "tables", "modules", "grids", "mockups", "icons", "illustrations", "emoji", "ornaments", "food", "cocktails", "backgrounds", "patterns", "social"]) {
  assert(registry.categories.includes(category), `Category registry is missing ${category}`);
}
for (const unsupportedCategory of ["animations", "videos", "audio", "models3d"]) {
  assert(!registry.categories.includes(unsupportedCategory), `Unsupported category ${unsupportedCategory} must not be exposed`);
}
assert(JSON.stringify(registry.formats) === JSON.stringify(["all", "svg", "png-transparent", "jpg"]), "Supported format registry is incorrect");

const localizationResponse = await fetch(
  `${BASE_URL}/api/elements-universe/search?providers=openverse&category=frames&q=${encodeURIComponent("cornice dorata floreale")}`,
  { headers, redirect: "manual" },
);
assert(localizationResponse.status === 307, "Italian search terms must be expanded through a temporary redirect");
const localizationTarget = new URL(localizationResponse.headers.get("location"), BASE_URL);
assert(localizationTarget.searchParams.get("_localized") === "1", "Localized request marker is missing");
const translatedQuery = localizationTarget.searchParams.get("q") ?? "";
assert(translatedQuery.includes("frame") && translatedQuery.includes("gold") && translatedQuery.includes("floral"), "Italian search translation is incomplete");

const structuralIds = new Map();
for (const structuralCategory of ["charts", "tables", "modules", "grids", "mockups", "shapes"]) {
  const result = await getJson(
    `/api/elements-universe/search?providers=local-structures&category=${structuralCategory}&formats=svg&page=1&page_size=24`,
    headers,
  );
  assert(result.items.length > 0, `${structuralCategory} returned no local pack elements`);
  assert(result.items.every((item) => item.category === structuralCategory), `${structuralCategory} leaked results from another category`);
  assert(result.items.every((item) => item.provider === "local-structures"), `${structuralCategory} must come from the structural pack`);
  assert(result.items.every((item) => item.kind === "vector" && item.format === "svg"), `${structuralCategory} must contain editable SVG vectors`);
  assert(result.items.every((item) => item.transparent === true && item.recolorable === true), `${structuralCategory} must remain transparent and recolorable`);
  structuralIds.set(structuralCategory, new Set(result.items.map((item) => item.id)));
}

assert(structuralIds.get("tables").size >= 5, "The table pack must contain several real table layouts");
assert([...structuralIds.get("tables")].every((id) => !structuralIds.get("charts").has(id)), "Tables and charts must not share the same catalog items");
assert([...structuralIds.get("grids")].every((id) => !structuralIds.get("mockups").has(id)), "Grids and mockups must not share the same catalog items");

const tables = await getJson(
  "/api/elements-universe/search?providers=local-structures&category=tables&formats=svg&q=menu&page=1&page_size=24",
  headers,
);
assert(tables.items.length >= 2, "Searching for menu tables returned too few table templates");
assert(tables.items.every((item) => item.category === "tables"), "Table search returned non-table items");
assert(tables.items.some((item) => /menu/i.test(item.name)), "Table search did not find menu tables");

const tableSvgResponse = await fetch(`${BASE_URL}${tables.items[0].assetUrl}`, { headers });
assert(tableSvgResponse.ok, `Local table SVG returned ${tableSvgResponse.status}`);
assert((tableSvgResponse.headers.get("content-type") ?? "").includes("image/svg+xml"), "Local table response is not SVG");
const tableSvg = await tableSvgResponse.text();
assert(tableSvg.includes("<svg") && tableSvg.includes("currentColor"), "Local table SVG is not recolorable");

const transparentPngs = await getJson(
  "/api/elements-universe/search?providers=local-twemoji&category=food&formats=png-transparent&q=pizza&page=1&page_size=12",
  headers,
);
assert(transparentPngs.items.length > 0, "Bundled Twemoji did not return a transparent PNG");
assert(transparentPngs.items.every((item) => item.format === "png" && item.transparent === true), "PNG transparency filter returned incorrectly labelled items");
const pngResponse = await fetch(`${BASE_URL}${transparentPngs.items[0].assetUrl}`, { headers });
assert(pngResponse.ok, `Bundled PNG returned ${pngResponse.status}`);
assert((pngResponse.headers.get("content-type") ?? "") === "image/png", "Bundled PNG has the wrong Content-Type");
const pngBytes = new Uint8Array(await pngResponse.arrayBuffer());
assert(hasPngSignature(pngBytes), "Bundled PNG does not contain real PNG bytes");
assert(pngDeclaresAlpha(pngBytes), "Bundled PNG does not declare an alpha channel");

const jpgTables = await getJson(
  "/api/elements-universe/search?providers=local-structures&category=tables&formats=jpg&page=1&page_size=12",
  headers,
);
assert(Array.isArray(jpgTables.items) && jpgTables.items.length === 0, "JPG filter must exclude structural SVG and PNG assets");
assert(jpgTables.nextPage === null, "Empty format-filtered result must not advertise another page");

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
  "/api/elements-universe/search?providers=uploads&category=illustrations&formats=svg&q=Persistent&page=1&page_size=12",
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

const gifForm = new FormData();
gifForm.append("file", new Blob([new Uint8Array([71, 73, 70, 56, 57, 97])], { type: "image/gif" }), "unsupported.gif");
gifForm.append("client_id", client.id);
const gifResponse = await fetch(`${BASE_URL}/api/uploads`, { method: "POST", headers, body: gifForm });
assert(gifResponse.status === 400, "Unsupported GIF uploads must be rejected");

console.log("Strict Elements categories, bundled packs, real transparent PNG bytes, format filters and persistent image imports verified.");
