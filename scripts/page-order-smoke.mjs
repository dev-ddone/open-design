import fs from "node:fs/promises";

const [cookiesPath, loginPath, clientPath, designPath] = process.argv.slice(2);
if (!cookiesPath || !loginPath || !clientPath || !designPath) {
  throw new Error("Usage: node scripts/page-order-smoke.mjs cookies.txt login.json client.json design.json");
}

const cookieFile = await fs.readFile(cookiesPath, "utf8");
const cookie = cookieFile
  .split(/\r?\n/)
  .map((line) => line.startsWith("#HttpOnly_") ? line.slice("#HttpOnly_".length) : line)
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split("\t"))
  .filter((parts) => parts.length >= 7)
  .map((parts) => `${parts[5]}=${parts[6]}`)
  .join("; ");
const login = JSON.parse(await fs.readFile(loginPath, "utf8"));
const client = JSON.parse(await fs.readFile(clientPath, "utf8"));
const design = JSON.parse(await fs.readFile(designPath, "utf8"));
const organizationId = login.organizations?.[0]?.id;
if (!cookie || !organizationId || !client.id || !design.id) throw new Error("Unable to resolve page-order smoke context");

const headers = {
  Cookie: cookie,
  "X-Organization-ID": organizationId,
  "X-Client-ID": client.id,
  "Content-Type": "application/json",
};
const base = "http://127.0.0.1:3006";

for (const title of ["Order Smoke Two", "Order Smoke Three"]) {
  const response = await fetch(`${base}/api/designs/${design.id}/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title, canvas_json: "{}" }),
  });
  if (!response.ok) throw new Error(`Page create failed: ${response.status} ${await response.text()}`);
}

const beforeResponse = await fetch(`${base}/api/designs/${design.id}`, { headers });
if (!beforeResponse.ok) throw new Error(`Design read failed: ${beforeResponse.status} ${await beforeResponse.text()}`);
const before = await beforeResponse.json();
if (!Array.isArray(before.pages) || before.pages.length < 3) throw new Error("Expected at least three pages");
const reversedIds = [...before.pages].reverse().map((page) => page.id);

const reorder = await fetch(`${base}/api/designs/${design.id}/pages/order`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ pageIds: reversedIds }),
});
if (!reorder.ok) throw new Error(`Page reorder failed: ${reorder.status} ${await reorder.text()}`);
const reordered = await reorder.json();
if (reordered.map((page) => page.id).join(",") !== reversedIds.join(",")) {
  throw new Error("Reorder response did not preserve submitted order");
}

const stale = await fetch(`${base}/api/designs/${design.id}/pages/order`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ pageIds: reversedIds.slice(1) }),
});
if (stale.status !== 409) throw new Error(`Incomplete page order must fail with 409, received ${stale.status}`);

const afterResponse = await fetch(`${base}/api/designs/${design.id}`, { headers });
if (!afterResponse.ok) throw new Error(`Design reread failed: ${afterResponse.status} ${await afterResponse.text()}`);
const after = await afterResponse.json();
if (after.pages.map((page) => page.id).join(",") !== reversedIds.join(",")) {
  throw new Error("Persisted page order is incorrect");
}
console.log("Atomic page ordering and stale-list protection verified.");
