import fs from "node:fs/promises";

const [cookiesPath, loginPath, designPath] = process.argv.slice(2);
if (!cookiesPath || !loginPath || !designPath) throw new Error("Usage: node scripts/design-review-smoke.mjs cookies.txt login.json design.json");

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
const design = JSON.parse(await fs.readFile(designPath, "utf8"));
const organizationId = login.organizations?.[0]?.id;
if (!cookie || !organizationId || !design.id) throw new Error("Unable to resolve review smoke context");

const headers = {
  Cookie: cookie,
  "X-Organization-ID": organizationId,
  "Content-Type": "application/json",
};
const endpoint = `http://127.0.0.1:3006/api/designs/${design.id}`;

const create = await fetch(`${endpoint}/comments`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    body: "@reviewer increase the title contrast",
    objectId: "smoke-title",
    anchorX: 0.25,
    anchorY: 0.4,
  }),
});
if (!create.ok) throw new Error(`Comment create failed: ${create.status} ${await create.text()}`);
const comment = await create.json();
if (!comment.id) throw new Error("Comment id missing");
if (comment.anchor_x !== 0.25 || comment.anchor_y !== 0.4) throw new Error("Comment anchor missing");
if (!comment.mentions?.includes("reviewer")) throw new Error("Comment mention missing");

const requestReview = await fetch(`${endpoint}/review`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ status: "IN_REVIEW", note: "Ready for review" }),
});
if (!requestReview.ok) throw new Error(`Review request failed: ${requestReview.status} ${await requestReview.text()}`);

const approve = await fetch(`${endpoint}/review`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ status: "APPROVED", note: "Approved in CI" }),
});
if (!approve.ok) throw new Error(`Approval failed: ${approve.status} ${await approve.text()}`);

const resolve = await fetch(`${endpoint}/comments/${comment.id}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ resolved: true, anchorX: 0.3, anchorY: 0.45 }),
});
if (!resolve.ok) throw new Error(`Comment resolve failed: ${resolve.status} ${await resolve.text()}`);

const read = await fetch(`${endpoint}/review`, { headers });
if (!read.ok) throw new Error(`Review read failed: ${read.status} ${await read.text()}`);
const result = await read.json();
if (result.review?.status !== "APPROVED") throw new Error("Review status did not persist");
const persisted = result.comments?.find((item) => item.id === comment.id);
if (!persisted?.resolved_at) throw new Error("Resolved comment did not persist");
if (persisted.anchor_x !== 0.3 || persisted.anchor_y !== 0.45) throw new Error("Moved comment anchor did not persist");
if (!persisted.mentions?.includes("reviewer")) throw new Error("Comment mentions did not persist");
console.log("Anchored comments, mentions, resolution and approval workflow verified.");
