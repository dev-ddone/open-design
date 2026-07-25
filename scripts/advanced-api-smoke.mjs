import { readFile } from "node:fs/promises";

const BASE_URL = process.env.APP_URL ?? "http://127.0.0.1:3006";
const RUNTIME_LOG = process.env.RUNTIME_LOG ?? "runtime.log";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Expected response to set a session cookie");
  return setCookie.split(";", 1)[0];
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.organizationId) headers.set("X-Organization-ID", options.organizationId);
  if (options.clientId) headers.set("X-Client-ID", options.clientId);
  let body;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    redirect: "manual",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();
  const data = contentType.includes("application/json") && raw ? JSON.parse(raw) : raw;
  const expected = Array.isArray(options.expected) ? options.expected : [options.expected ?? 200];
  if (!expected.includes(response.status)) {
    throw new Error(`${options.method ?? "GET"} ${path} returned ${response.status}: ${raw}`);
  }
  return { response, data };
}

async function waitForLoggedToken(kind, previousCount = 0, timeoutMs = 10_000) {
  const expression = new RegExp(`\\?${kind}=([A-Za-z0-9_-]+)`, "g");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const log = await readFile(RUNTIME_LOG, "utf8").catch(() => "");
    const matches = [...log.matchAll(expression)];
    if (matches.length > previousCount) return { token: matches.at(-1)[1], count: matches.length };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${kind} token in ${RUNTIME_LOG}`);
}

const login = await request("/api/auth/login", {
  method: "POST",
  json: { email: "admin@example.com", password: "ci-admin-password" },
});
let adminCookie = cookieFrom(login.response);
const organizationId = login.data.organizations[0].id;
assert(login.data.organizations[0].all_clients === true, "Bootstrap owner must have all-client access");

const clientA = (await request("/api/clients", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  json: { name: "Advanced Client A" },
})).data;
const clientB = (await request("/api/clients", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  json: { name: "Advanced Client B" },
})).data;

const designA = (await request("/api/designs", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  json: {
    name: "Advanced Design A",
    client_id: clientA.id,
    canvas_json: JSON.stringify({ version: "6.0.0", objects: [] }),
  },
})).data;
const designB = (await request("/api/designs", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  clientId: clientB.id,
  json: {
    name: "Advanced Design B",
    client_id: clientB.id,
    canvas_json: JSON.stringify({ version: "6.0.0", objects: [] }),
  },
})).data;

const manualVersion = (await request(`/api/designs/${designA.id}/versions`, {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  json: { label: "Approved baseline", source: "manual" },
  expected: 201,
})).data;
await request(`/api/designs/${designA.id}`, {
  method: "PUT",
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  json: { name: "Changed after snapshot" },
});
const restored = (await request(`/api/designs/${designA.id}/versions/${manualVersion.id}/restore`, {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  json: {},
})).data;
assert(restored.design.name === "Advanced Design A", "Version restore did not restore the design name");
const versions = (await request(`/api/designs/${designA.id}/versions`, {
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
})).data;
assert(versions.length >= 4, "Expected initial, manual, safety and restored versions");

const templateId = `advanced-template-${Date.now()}`;
const editRules = {
  mode: "regions",
  editableObjectIds: ["editable-title"],
  lockedObjectIds: ["locked-frame"],
};
const template = (await request("/api/templates", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  json: {
    id: templateId,
    name: "Client A locked template",
    category: "menu",
    width: 1080,
    height: 1350,
    client_id: clientA.id,
    canvas_json: JSON.stringify({
      version: "6.0.0",
      objects: [
        { type: "Textbox", ddoneId: "editable-title", templateEditable: true, text: "Menu" },
        { type: "Rect", ddoneId: "locked-frame", templateLocked: true, width: 100, height: 100 },
      ],
    }),
    edit_rules: editRules,
  },
  expected: 201,
})).data;
assert(template.edit_rules.mode === "regions", "Template edit rules were not stored");
const fetchedTemplate = (await request(`/api/templates/${templateId}`, {
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
})).data;
assert(fetchedTemplate.edit_rules.lockedObjectIds.includes("locked-frame"), "Locked template object missing");

const brandKit = (await request("/api/brand-kits", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  json: {
    name: "Client A Brand",
    client_id: clientA.id,
    colors: ["#111827", "#6d5dfc"],
    fonts: ["Montserrat", "Inter"],
    logos: ["https://example.com/logo.svg"],
    text_styles: [{ name: "Heading", fontFamily: "Montserrat", fontSize: 48 }],
    is_default: true,
  },
  expected: 201,
})).data;
assert(brandKit.is_default === true && brandKit.client_id === clientA.id, "Client brand kit was not persisted");
const brandKits = (await request("/api/brand-kits", {
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
})).data;
assert(brandKits.some((kit) => kit.id === brandKit.id), "Brand kit is not visible in its client");

const safeSvg = new FormData();
safeSvg.append("client_id", clientA.id);
safeSvg.append(
  "file",
  new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8"/></svg>'], { type: "image/svg+xml" }),
  "safe.svg",
);
const uploaded = (await request("/api/uploads", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  form: safeSvg,
  expected: 201,
})).data;
assert(uploaded.asset_id, "Safe SVG upload failed");

const unsafeSvg = new FormData();
unsafeSvg.append("client_id", clientA.id);
unsafeSvg.append(
  "file",
  new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: "image/svg+xml" }),
  "unsafe.svg",
);
await request("/api/uploads", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  form: unsafeSvg,
  expected: 400,
});

const directMember = await request("/api/organization/members", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  json: { email: "bypass@example.com", role: "EDITOR" },
  expected: 410,
});
assert(String(directMember.data.error).includes("email invitations"), "Legacy direct member endpoint was not blocked");

const resetCountBefore = [...(await readFile(RUNTIME_LOG, "utf8")).matchAll(/\?reset=/g)].length;
await request("/api/auth/forgot-password", {
  method: "POST",
  json: { email: "admin@example.com" },
});
const reset = await waitForLoggedToken("reset", resetCountBefore);
const resetInfo = (await request(`/api/auth/reset-password/${reset.token}`)).data;
assert(resetInfo.email === "admin@example.com", "Password reset token does not belong to the expected user");
const resetSession = await request("/api/auth/reset-password", {
  method: "POST",
  json: { token: reset.token, password: "ci-admin-password-updated" },
});
adminCookie = cookieFrom(resetSession.response);
await request("/api/auth/login", {
  method: "POST",
  json: { email: "admin@example.com", password: "ci-admin-password-updated" },
});
await request("/api/auth/reset-password", {
  method: "POST",
  json: { token: reset.token, password: "cannot-reuse-token" },
  expected: 404,
});

let inviteCount = [...(await readFile(RUNTIME_LOG, "utf8")).matchAll(/\?invite=/g)].length;
await request("/api/organization/invitations", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  json: {
    email: "scoped@example.com",
    role: "EDITOR",
    all_clients: false,
    clients: [{ client_id: clientA.id, role: "VIEWER" }],
  },
  expected: 201,
});
const firstInvite = await waitForLoggedToken("invite", inviteCount);
inviteCount = firstInvite.count;
const invitationInfo = (await request(`/api/invitations/${firstInvite.token}`)).data;
assert(invitationInfo.clients.length === 1 && invitationInfo.clients[0].id === clientA.id, "Invitation scope is incorrect");
const accepted = await request(`/api/invitations/${firstInvite.token}/accept`, {
  method: "POST",
  json: { name: "Scoped User", password: "scoped-password" },
});
let scopedCookie = cookieFrom(accepted.response);
const scopedOrganizationId = accepted.data.organizations[0].id;
assert(scopedOrganizationId === organizationId, "Invitation joined the wrong organization");
assert(accepted.data.organizations[0].all_clients === false, "Scoped member unexpectedly received all-client access");

let scopedClients = (await request("/api/clients", {
  cookie: scopedCookie,
  organizationId,
})).data;
assert(scopedClients.length === 1 && scopedClients[0].id === clientA.id, "Client filtering failed for scoped member");
assert(scopedClients[0].access_role === "VIEWER", "Client-specific viewer role was not returned");
await request(`/api/designs/${designA.id}`, {
  cookie: scopedCookie,
  organizationId,
  clientId: clientA.id,
});
await request(`/api/designs/${designA.id}`, {
  method: "PUT",
  cookie: scopedCookie,
  organizationId,
  clientId: clientA.id,
  json: { name: "Viewer must not update" },
  expected: 403,
});
await request(`/api/designs/${designB.id}`, {
  cookie: scopedCookie,
  organizationId,
  clientId: clientB.id,
  expected: 403,
});

await request("/api/organization/invitations", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  json: {
    email: "scoped@example.com",
    role: "EDITOR",
    all_clients: false,
    clients: [{ client_id: clientB.id, role: "EDITOR" }],
  },
  expected: 201,
});
const secondInvite = await waitForLoggedToken("invite", inviteCount);
const existingAccepted = await request(`/api/invitations/${secondInvite.token}/accept`, {
  method: "POST",
  cookie: scopedCookie,
  json: {},
});
scopedCookie = cookieFrom(existingAccepted.response);
scopedClients = (await request("/api/clients", {
  cookie: scopedCookie,
  organizationId,
})).data;
assert(scopedClients.length === 2, "Accepting an additional invitation removed existing client access");
assert(scopedClients.find((client) => client.id === clientA.id)?.access_role === "VIEWER", "Existing client role changed unexpectedly");
assert(scopedClients.find((client) => client.id === clientB.id)?.access_role === "EDITOR", "New editor role was not added");
await request(`/api/designs/${designB.id}`, {
  method: "PUT",
  cookie: scopedCookie,
  organizationId,
  clientId: clientB.id,
  json: { name: "Edited through client B ACL" },
});

const members = (await request("/api/organization/members", {
  cookie: adminCookie,
  organizationId,
})).data;
const scopedMember = members.find((member) => member.email === "scoped@example.com");
assert(scopedMember, "Invited member missing from workspace member list");
await request(`/api/organization/members/${scopedMember.id}/access`, {
  method: "PUT",
  cookie: adminCookie,
  organizationId,
  json: {
    role: "EDITOR",
    all_clients: false,
    clients: [{ client_id: clientB.id, role: "VIEWER" }],
  },
});
scopedClients = (await request("/api/clients", {
  cookie: scopedCookie,
  organizationId,
})).data;
assert(scopedClients.length === 1 && scopedClients[0].id === clientB.id, "Member ACL update did not replace client scope");
await request(`/api/designs/${designB.id}`, {
  method: "PUT",
  cookie: scopedCookie,
  organizationId,
  clientId: clientB.id,
  json: { name: "Client viewer must not update" },
  expected: 403,
});

console.log("Advanced account, invitation, ACL, version, template, brand kit and SVG workflows verified.");
