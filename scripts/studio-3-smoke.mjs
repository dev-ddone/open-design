const BASE_URL = process.env.APP_URL ?? "http://127.0.0.1:3006";

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

const login = await request("/api/auth/login", {
  method: "POST",
  json: {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "ci-admin-password",
  },
  expected: 200,
});
const cookie = cookieFrom(login.response);
const organizationId = login.data.organizations[0].id;

const client = (await request("/api/clients", {
  method: "POST",
  cookie,
  organizationId,
  json: { name: `Studio 3 smoke ${Date.now()}` },
  expected: 201,
})).data;

const design = (await request("/api/designs", {
  method: "POST",
  cookie,
  organizationId,
  clientId: client.id,
  json: {
    name: "Studio 3 runtime design",
    client_id: client.id,
    canvas_json: JSON.stringify({ version: "6.0.0", objects: [] }),
  },
  expected: 201,
})).data;

const designWithPages = (await request(`/api/designs/${design.id}`, {
  cookie,
  organizationId,
  clientId: client.id,
  expected: 200,
})).data;
const page = designWithPages.pages[0];
assert(page?.id, "New design did not expose a page");

const comment = (await request(`/api/designs/${design.id}/comments`, {
  method: "POST",
  cookie,
  organizationId,
  clientId: client.id,
  json: {
    body: "Review this region @admin",
    pageId: page.id,
    anchorMode: "region",
    anchorX: 0.2,
    anchorY: 0.25,
    anchorWidth: 0.35,
    anchorHeight: 0.2,
    assignedTo: login.data.user.id,
  },
  expected: 201,
})).data;
assert(comment.anchor_mode === "region", "Region anchor mode did not persist");
assert(comment.anchor_width === 0.35 && comment.anchor_height === 0.2, "Region dimensions did not persist");

const moved = (await request(`/api/designs/${design.id}/comments/${comment.id}`, {
  method: "PATCH",
  cookie,
  organizationId,
  clientId: client.id,
  json: { anchorX: 0.4, anchorY: 0.45, objectId: null },
  expected: 200,
})).data;
assert(moved.anchor_x === 0.4 && moved.anchor_y === 0.45, "Comment movement did not persist");

await request(`/api/designs/${design.id}/review`, {
  method: "PUT",
  cookie,
  organizationId,
  clientId: client.id,
  json: { status: "IN_REVIEW", note: "Studio 3 review request" },
  expected: 200,
});
await request(`/api/designs/${design.id}/review`, {
  method: "PUT",
  cookie,
  organizationId,
  clientId: client.id,
  json: { status: "APPROVED", note: "Approved by runtime smoke" },
  expected: 200,
});

await request(`/api/designs/${design.id}/governance`, {
  method: "POST",
  cookie,
  organizationId,
  clientId: client.id,
  json: { eventType: "EXPORT_OVERRIDE", payload: { format: "svg", reason: "runtime smoke" } },
  expected: 201,
});
const governance = (await request(`/api/designs/${design.id}/governance`, {
  cookie,
  organizationId,
  clientId: client.id,
  expected: 200,
})).data;
assert(governance.some((event) => event.event_type === "EXPORT_OVERRIDE"), "Governance override event missing");
assert(governance.some((event) => event.event_type === "REVIEW_APPROVED"), "Approval governance event missing");

const manifest = {
  schemaVersion: 1,
  key: `studio.smoke.${Date.now()}`,
  name: "Studio smoke plugin",
  version: "1.0.0",
  permissions: ["canvas:write"],
  settings: [{ key: "label", label: "Label", type: "text", default: "SMOKE" }],
  commands: [{
    id: "badge",
    title: "Insert badge",
    action: { type: "insert-element", element: { type: "rect", width: 100, height: 40, fill: "#6d5dfc" } },
  }],
};
const plugin = (await request("/api/plugins", {
  method: "POST",
  cookie,
  organizationId,
  clientId: client.id,
  json: { clientId: client.id, manifest, configuration: { label: "CI" }, enabled: true },
  expected: 201,
})).data;
assert(plugin.plugin_key === manifest.key, "Plugin manifest did not persist");

const plugins = (await request("/api/plugins", {
  cookie,
  organizationId,
  clientId: client.id,
  expected: 200,
})).data;
assert(plugins.some((item) => item.id === plugin.id), "Installed plugin is not listed");
await request(`/api/plugins/${plugin.id}`, {
  method: "PUT",
  cookie,
  organizationId,
  clientId: client.id,
  json: { enabled: false, configuration: { label: "UPDATED" } },
  expected: 200,
});
await request(`/api/plugins/${plugin.id}`, {
  method: "DELETE",
  cookie,
  organizationId,
  clientId: client.id,
  expected: 200,
});

const notifications = (await request("/api/notifications?limit=10", {
  cookie,
  organizationId,
  clientId: client.id,
  expected: 200,
})).data;
assert(Array.isArray(notifications), "Notifications endpoint did not return an array");

const rasterResponse = await fetch(`${BASE_URL}/api/studio-raster/glass-orb-violet.png`);
assert(rasterResponse.ok, `Bundled PNG returned ${rasterResponse.status}`);
const raster = new Uint8Array(await rasterResponse.arrayBuffer());
assert(raster.length > 5_000, "Bundled PNG is unexpectedly small");
assert(raster[0] === 0x89 && raster[1] === 0x50 && raster[2] === 0x4e && raster[3] === 0x47, "Bundled asset is not PNG");

await request(`/api/designs/${design.id}`, {
  method: "DELETE",
  cookie,
  organizationId,
  clientId: client.id,
  expected: 200,
});

console.log("Studio 3 governance, review regions, plugins, notifications and PNG runtime verified.");