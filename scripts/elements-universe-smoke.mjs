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
assert(typeof ornament.license === "string" && ornament.license.length > 0, "Element license metadata is missing");
assert(ornament.attributionRequired === false, "Built-in MIT ornament should not require attribution");
assert(typeof ornament.svg === "string" && ornament.svg.includes("<svg"), "Built-in SVG content is missing");

const uploads = await getJson(
  "/api/elements-universe/search?providers=uploads&category=all&q=safe&page=1&page_size=12",
  headers,
);
assert(Array.isArray(uploads.items), "Private asset search response is invalid");
assert(uploads.items.some((item) => item.provider === "uploads" && item.assetUrl?.startsWith("/api/assets/")), "Previously uploaded SVG is not visible in the private provider");

const empty = await getJson(
  "/api/elements-universe/search?providers=builtin&category=ornaments&q=definitely-no-such-ddone-element&page=1&page_size=12",
  headers,
);
assert(Array.isArray(empty.items) && empty.items.length === 0, "Empty searches must return an empty result list");
assert(empty.nextPage === null, "Empty searches must not advertise another page");

console.log("Federated Elements providers, Italian query expansion, licenses and private assets verified.");
