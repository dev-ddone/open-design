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
