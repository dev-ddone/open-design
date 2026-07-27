import { Hono } from "hono";
import type { AppVariables } from "./auth.js";
import passwordRecovery from "./password-recovery.js";
import invitationAcceptance from "./invitation-acceptance.js";
import templateApplication from "./template-application.js";
import elementsLocalization from "./elements-localization.js";
import elementPreferences from "./element-preferences.js";
import designReviews from "./design-reviews.js";
import pageOrder from "./page-order.js";
import assetContent from "./asset-content.js";
import elementPackContent from "./element-pack-content.js";
import elementsCatalogV2 from "./elements-catalog-v2.js";
import elementsUniverse from "./elements-universe.js";
import guards from "./legacy-guards.js";
import hardening from "./hardening.js";
import advanced from "./advanced.js";
import legacy from "./index.js";
import { validateSvgBytes } from "./svg-security.js";

const app = new Hono<{ Variables: AppVariables }>();

// Every SVG returned by an Elements provider passes the same restrictive
// validation as a user upload before it reaches Fabric.js in the browser.
app.use("/api/elements-universe/*", async (c, next) => {
  await next();
  const contentType = c.res.headers.get("content-type") ?? "";
  if (!c.res.ok || !contentType.toLowerCase().includes("image/svg+xml")) return;
  try {
    const bytes = new Uint8Array(await c.res.clone().arrayBuffer());
    validateSvgBytes(bytes);
  } catch (error) {
    c.res = c.json(
      { error: error instanceof Error ? `Unsafe SVG: ${error.message}` : "Unsafe SVG" },
      502,
    );
  }
});

// Password-reset requests never disclose whether an account exists.
app.route("/", passwordRecovery);
// Existing members keep their current client permissions when accepting another invitation.
app.route("/", invitationAcceptance);
// Applying a template to an existing design persists its source and edit policy.
app.route("/", templateApplication);
// Italian search terms are expanded with English synonyms before global providers are queried.
app.route("/", elementsLocalization);
// Favorites, recents and collections follow the signed-in user across devices.
app.route("/", elementPreferences);
// Comments and approval states are scoped to accessible designs.
app.route("/", designReviews);
// Page ordering validates the complete page set and persists atomically.
app.route("/", pageOrder);
// Stable asset URLs can be rendered by Fabric/Image using the session cookie alone.
app.route("/", assetContent);
// Administrator-configured packs use a strict same-origin, zero-index-safe content proxy.
app.route("/", elementPackContent);
// Strict category isolation, real file formats and bundled open-source packs.
app.route("/", elementsCatalogV2);
// Older federation endpoints remain available only as compatible content proxies/fallbacks.
app.route("/", elementsUniverse);
// Exact guards prevent older endpoints from bypassing invitation and client ACL rules.
app.route("/", guards);
// Security-sensitive replacements are mounted before every other route.
app.route("/", hardening);
// Advanced routes replace the foundation APIs with multi-client workflows.
app.route("/", advanced);
// The original editor/static app remains available as a compatible fallback.
app.route("/", legacy);

export default app;
