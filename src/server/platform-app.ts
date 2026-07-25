import { Hono } from "hono";
import type { AppVariables } from "./auth.js";
import hardening from "./hardening.js";
import advanced from "./advanced.js";
import legacy from "./index.js";

const app = new Hono<{ Variables: AppVariables }>();

// Security-sensitive replacements are mounted before every other route.
app.route("/", hardening);
// Advanced routes replace the foundation APIs with multi-client workflows.
app.route("/", advanced);
// The original editor/static app remains available as a compatible fallback.
app.route("/", legacy);

export default app;
