import { Hono } from "hono";
import type { AppVariables } from "./auth.js";
import invitationAcceptance from "./invitation-acceptance.js";
import guards from "./legacy-guards.js";
import hardening from "./hardening.js";
import advanced from "./advanced.js";
import legacy from "./index.js";

const app = new Hono<{ Variables: AppVariables }>();

// Existing members keep their current client permissions when accepting another invitation.
app.route("/", invitationAcceptance);
// Exact guards prevent older endpoints from bypassing invitation and client ACL rules.
app.route("/", guards);
// Security-sensitive replacements are mounted before every other route.
app.route("/", hardening);
// Advanced routes replace the foundation APIs with multi-client workflows.
app.route("/", advanced);
// The original editor/static app remains available as a compatible fallback.
app.route("/", legacy);

export default app;
