import { Hono } from "hono";
import type { AppVariables } from "./auth.js";
import passwordRecovery from "./password-recovery.js";
import invitationAcceptance from "./invitation-acceptance.js";
import templateApplication from "./template-application.js";
import elementsLocalization from "./elements-localization.js";
import elementPreferences from "./element-preferences.js";
import designReviews from "./design-reviews.js";
import pageOrder from "./page-order.js";
import studioPlatform from "./studio-platform.js";
import studioRasterPack from "./studio-raster-pack.js";
import studioRasterPackExtra from "./studio-raster-pack-extra.js";
import assetContent from "./asset-content.js";
import elementPackContent from "./element-pack-content.js";
import elementsCatalogV2 from "./elements-catalog-v2.js";
import elementsUniverse from "./elements-universe.js";
import { improveElementsSearch } from "./elements-search-ux.js";
import guards from "./legacy-guards.js";
import hardening from "./hardening.js";
import advanced from "./advanced.js";
import legacy from "./index.js";
import { validateSvgBytes } from "./svg-security.js";

const app = new Hono<{ Variables: AppVariables }>();

type InternalRoute = {
  method: string;
  path: string;
  handler: (context: unknown, next: () => Promise<void>) => unknown;
};

function addRasterCompatibilityRoute(
  rootApp: Hono<{ Variables: AppVariables }>,
  subApp: Hono<any>,
  prefix: string,
): void {
  const routes = (subApp as unknown as { routes?: InternalRoute[] }).routes ?? [];
  const legacy = routes.find((route) => route.method === "GET" && route.path === `${prefix}/:id.png`);
  if (!legacy) throw new Error(`Missing bundled raster renderer for ${prefix}`);

  rootApp.get(`${prefix}/:filename`, async (c) => {
    const filename = c.req.param("filename");
    if (!/^[a-z0-9-]+\.png$/i.test(filename)) return c.json({ error: "Raster asset not found" }, 404);
    const id = filename.slice(0, -4);

    const requestProxy = new Proxy(c.req as object, {
      get(target, property, receiver) {
        if (property === "param") {
          return (name?: string) => {
            if (name === "id") return id;
            if (name === "filename") return filename;
            return (c.req.param as (name?: string) => unknown)(name);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const contextProxy = new Proxy(c as object, {
      get(target, property, receiver) {
        if (property === "req") return requestProxy;
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const response = await legacy.handler(contextProxy, async () => undefined);
    return response instanceof Response ? response : c.notFound();
  });
}

// Hono 4 captures the `.png` suffix inside `:id` for the legacy routes.
// Register higher-priority filename routes on the root app, strip the suffix,
// and delegate to the existing pack renderers without duplicating asset data.
addRasterCompatibilityRoute(app, studioRasterPack, "/api/studio-raster");
addRasterCompatibilityRoute(app, studioRasterPackExtra, "/api/studio-raster-extra");

app.use("/api/elements-universe/*", async (c, next) => {
  await next();
  const contentType = c.res.headers.get("content-type") ?? "";
  if (!c.res.ok || !contentType.toLowerCase().includes("image/svg+xml")) return;
  try {
    const bytes = new Uint8Array(await c.res.clone().arrayBuffer());
    validateSvgBytes(bytes);
  } catch (error) {
    c.res = c.json({ error: error instanceof Error ? `Unsafe SVG: ${error.message}` : "Unsafe SVG" }, 502);
  }
});

app.use("/api/elements-universe/search", improveElementsSearch);
app.route("/", passwordRecovery);
app.route("/", invitationAcceptance);
app.route("/", templateApplication);
app.route("/", elementsLocalization);
app.route("/", elementPreferences);
app.route("/", designReviews);
app.route("/", pageOrder);
app.route("/", studioPlatform);
app.route("/", studioRasterPack);
app.route("/", studioRasterPackExtra);
app.route("/", assetContent);
app.route("/", elementPackContent);
app.route("/", elementsCatalogV2);
app.route("/", elementsUniverse);
app.route("/", guards);
app.route("/", hardening);
app.route("/", advanced);
app.route("/", legacy);

export default app;
