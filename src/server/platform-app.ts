import { Hono } from "hono";
import type { AppVariables } from "./auth.js";
import passwordRecovery from "./password-recovery.js";
import invitationAcceptance from "./invitation-acceptance.js";
import templateApplication from "./template-application.js";
import guards from "./legacy-guards.js";
import hardening from "./hardening.js";
import advanced from "./advanced.js";
import legacy from "./index.js";

const app = new Hono<{ Variables: AppVariables }>();

// Password-reset requests never disclose whether an account exists.
app.route("/", passwordRecovery);
// Existing members keep their current client permissions when accepting another invitation.
app.route("/", invitationAcceptance);
// Applying a template to an existing design persists its source and edit policy.
app.route("/", templateApplication);
// Exact guards prevent older endpoints from bypassing invitation and client ACL rules.
app.route("/", guards);
// Security-sensitive replacements are mounted before every other route.
app.route("/", hardening);
// Advanced routes replace the foundation APIs with multi-client workflows.
app.route("/", advanced);
// The original editor/static app remains available as a compatible fallback.
app.route("/", legacy);

export default app;
