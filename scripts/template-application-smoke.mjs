const BASE_URL = process.env.APP_URL ?? "http://127.0.0.1:3006";

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  });
  const raw = await response.text();
  const data = raw && (response.headers.get("content-type") ?? "").includes("application/json")
    ? JSON.parse(raw)
    : raw;
  if (response.status !== (options.expected ?? 200)) {
    throw new Error(`${options.method ?? "GET"} ${path} returned ${response.status}: ${raw}`);
  }
  return { response, data };
}

const login = await request("/api/auth/login", {
  method: "POST",
  json: { email: "admin@example.com", password: "ci-admin-password-updated" },
});
const cookie = login.response.headers.get("set-cookie")?.split(";", 1)[0];
assert(cookie, "Admin session cookie missing");
const organizationId = login.data.organizations[0].id;
const clients = (await request("/api/clients", { cookie, organizationId })).data;
const client = clients.find((item) => item.name === "Advanced Client A");
assert(client, "Advanced Client A missing");
const designs = (await request("/api/designs", {
  cookie,
  organizationId,
  clientId: client.id,
})).data;
const design = designs.find((item) => item.name === "Advanced Design A");
assert(design, "Advanced Design A missing");
const detail = (await request(`/api/designs/${design.id}`, {
  cookie,
  organizationId,
  clientId: client.id,
})).data;
assert(detail.pages.length > 0, "Design has no page to receive template");
const templates = (await request("/api/templates", {
  cookie,
  organizationId,
  clientId: client.id,
})).data;
const template = templates.find((item) => item.name === "Client A locked template");
assert(template, "Client template missing");

const applied = (await request(`/api/designs/${design.id}/apply-template`, {
  method: "POST",
  cookie,
  organizationId,
  clientId: client.id,
  json: { template_id: template.id, page_id: detail.pages[0].id },
})).data;
assert(applied.design.template_id === template.id, "Template source was not persisted");
assert(applied.design.template_edit_rules.mode === "regions", "Template edit rules were not copied");
assert(applied.page.canvas_json === template.canvas_json, "Template canvas was not applied to the page");

const versions = (await request(`/api/designs/${design.id}/versions`, {
  cookie,
  organizationId,
  clientId: client.id,
})).data;
assert(
  versions.some((version) => version.label === "Before template application"),
  "Template application did not create a safety version",
);
console.log("Persistent template application and safety version verified.");
