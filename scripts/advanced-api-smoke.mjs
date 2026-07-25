import { readFile } from "node:fs/promises";

const BASE_URL = process.env.APP_URL ?? "http://127.0.0.1:3006";
const RUNTIME_LOG = process.env.RUNTIME_LOG ?? "runtime.log";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cookieFrom(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Expected a session cookie");
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
  const raw = await response.text();
  const data = raw && (response.headers.get("content-type") ?? "").includes("application/json")
    ? JSON.parse(raw)
    : raw;
  const expected = Array.isArray(options.expected)
    ? options.expected
    : options.expected !== undefined
      ? [options.expected]
      : [200, 201];
  if (!expected.includes(response.status)) {
    throw new Error(`${options.method ?? "GET"} ${path} returned ${response.status}: ${raw}`);
  }
  return { response, data };
}

async function tokenCount(kind) {
  const log = await readFile(RUNTIME_LOG, "utf8").catch(() => "");
  return [...log.matchAll(new RegExp(`\\?${kind}=`, "g"))].length;
}

async function waitForLoggedToken(kind, previousCount, timeoutMs = 10_000) {
  const expression = new RegExp(`\\?${kind}=([A-Za-z0-9_-]+)`, "g");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const log = await readFile(RUNTIME_LOG, "utf8").catch(() => "");
    const matches = [...log.matchAll(expression)];
    if (matches.length > previousCount) {
      return { token: matches.at(-1)[1], count: matches.length };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${kind} token`);
}

const adminLogin = await request("/api/auth/login", {
  method: "POST",
  json: { email: "admin@example.com", password: "ci-admin-password" },
  expected: 200,
});
let adminCookie = cookieFrom(adminLogin.response);
const organizationId = adminLogin.data.organizations[0].id;
assert(adminLogin.data.organizations[0].all_clients === true, "Owner must have all-client access");

const clientA = (await request("/api/clients", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  json: { name: "Advanced Client A" },
  expected: 201,
})).data;
const clientB = (await request("/api/clients", {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  json: { name: "Advanced Client B" },
  expected: 201,
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
  expected: 201,
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
  expected: 201,
})).data;

const version = (await request(`/api/designs/${designA.id}/versions`, {
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
  expected: 200,
});
const restored = (await request(`/api/designs/${designA.id}/versions/${version.id}/restore`, {
  method: "POST",
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  json: {},
  expected: 200,
})).data;
assert(restored.design.name === "Advanced Design A", "Version restore did not restore the name");
const versions = (await request(`/api/designs/${designA.id}/versions`, {
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  expected: 200,
})).data;
assert(versions.length >= 4, "Version history is incomplete");

const templateId = `advanced-template-${Date.now()}`;
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
    edit_rules: {
      mode: "regions",
      editableObjectIds: ["editable-title"],
      lockedObjectIds: ["locked-frame"],
    },
  },
  expected: 201,
})).data;
assert(template.edit_rules.mode === "regions", "Template edit rules were not stored");
const fetchedTemplate = (await request(`/api/templates/${templateId}`, {
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  expected: 200,
})).data;
assert(fetchedTemplate.edit_rules.lockedObjectIds.includes("locked-frame"), "Locked object missing");

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
assert(brandKit.client_id === clientA.id && brandKit.is_default, "Client brand kit was not stored");
const brandKits = (await request("/api/brand-kits", {
  cookie: adminCookie,
  organizationId,
  clientId: clientA.id,
  expected: 200,
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
assert(String(directMember.data.error).includes("email invitations"), "Legacy member endpoint is not blocked");

const resetBefore = await tokenCount("reset");
await request("/api/auth/forgot-password", {
  method: "POST",
  json: { email: "admin@example.com" },
  expected: 200,
});
const reset = await waitForLoggedToken("reset", resetBefore);
const resetInfo = (await request(`/api/auth/reset-password/${reset.token}`, { expected: 200 })).data;
assert(resetInfo.email === "admin@example.com", "Reset token belongs to the wrong user");
const resetSession = await request("/api/auth/reset-password", {
  method: "POST",
  json: { token: reset.token, password: "ci-admin-password-updated" },
  expected: 200,
});
adminCookie = cookieFrom(resetSession.response);
await request("/api/auth/login", {
  method: "POST",
  json: { email: "admin@example.com", password: "ci-admin-password-updated" },
  expected: 200,
});
await request("/api/auth/reset-password", {
  method: "POST",
  json: { token: reset.token, password: "cannot-reuse-token" },
  expected: 404,
});

let inviteCount = await tokenCount("invite");
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
const invitationInfo = (await request(`/api/invitations/${firstInvite.token}`, { expected: 200 })).data;
assert(invitationInfo.clients.length === 1 && invitationInfo.clients[0].id === clientA.id, "Invitation scope is wrong");
const accepted = await request(`/api/invitations/${firstInvite.token}/accept`, {
  method: "POST",
  json: { name: "Scoped User", password: "scoped-password" },
  expected: 200,
});
let scopedCookie = cookieFrom(accepted.response);
assert(accepted.data.organizations[0].id === organizationId, "Invitation joined the wrong organization");
assert(accepted.data.organizations[0].all_clients === false, "Scoped member received all clients");

let scopedClients = (await request("/api/clients", {
  cookie: scopedCookie,
  organizationId,
  expected: 200,
})).data;
assert(scopedClients.length === 1 && scopedClients[0].id === clientA.id, "Scoped client list is wrong");
assert(scopedClients[0].access_role === "VIEWER", "Client viewer role is missing");
await request(`/api/designs/${designA.id}`, {
  cookie: scopedCookie,
  organizationId,
  clientId: clientA.id,
  expected: 200,
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
const acceptedExisting = await request(`/api/invitations/${secondInvite.token}/accept`, {
  method: "POST",
  cookie: scopedCookie,
  json: {},
  expected: 200,
});
scopedCookie = cookieFrom(acceptedExisting.response);
scopedClients = (await request("/api/clients", {
  cookie: scopedCookie,
  organizationId,
  expected: 200,
})).data;
assert(scopedClients.length === 2, "Additional invitation removed previous client access");
assert(scopedClients.find((client) => client.id === clientA.id)?.access_role === "VIEWER", "Client A role changed");
assert(scopedClients.find((client) => client.id === clientB.id)?.access_role === "EDITOR", "Client B editor role missing");
await request(`/api/designs/${designB.id}`, {
  method: "PUT",
  cookie: scopedCookie,
  organizationId,
  clientId: clientB.id,
  json: { name: "Edited through client B ACL" },
  expected: 200,
});

const members = (await request("/api/organization/members", {
  cookie: adminCookie,
  organizationId,
  expected: 200,
})).data;
const scopedMember = members.find((member) => member.email === "scoped@example.com");
assert(scopedMember, "Invited member is missing from workspace members");
await request(`/api/organization/members/${scopedMember.id}/access`, {
  method: "PUT",
  cookie: adminCookie,
  organizationId,
  json: {
    role: "EDITOR",
    all_clients: false,
    clients: [{ client_id: clientB.id, role: "VIEWER" }],
  },
  expected: 200,
});
scopedClients = (await request("/api/clients", {
  cookie: scopedCookie,
  organizationId,
  expected: 200,
})).data;
assert(scopedClients.length === 1 && scopedClients[0].id === clientB.id, "ACL update did not replace client scope");
await request(`/api/designs/${designB.id}`, {
  method: "PUT",
  cookie: scopedCookie,
  organizationId,
  clientId: clientB.id,
  json: { name: "Client viewer must not update" },
  expected: 403,
});

console.log("Advanced email, invitation, ACL, version, template, brand kit and SVG workflows verified.");
