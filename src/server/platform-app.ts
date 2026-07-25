import { Hono } from "hono";
import type { AppVariables } from "./auth.js";
import advanced from "./advanced.js";
import legacy from "./index.js";

const app = new Hono<{ Variables: AppVariables }>();

// Advanced routes deliberately come first so they can replace legacy endpoints
// while the original editor/static application remains available as a fallback.
app.route("/", advanced);
app.route("/", legacy);

export default app;
