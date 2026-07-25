import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import app from "./index.js";
import { installCollaborationServer } from "./collaboration.js";
import { config } from "./config.js";
import { bootstrapAdmin, closeDatabase, migrate } from "./db.js";
import { initializeStorage } from "./storage.js";

async function main(): Promise<void> {
  await migrate();
  await bootstrapAdmin();
  await initializeStorage();

  const server = serve(
    {
      fetch: app.fetch,
      hostname: "0.0.0.0",
      port: config.port,
    },
    (info) => {
      console.info(`DDone Design listening on http://${info.address}:${info.port}`);
    },
  );

  installCollaborationServer(server as Server);

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.info(`Received ${signal}; shutting down`);
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Unable to start DDone Design", error);
  process.exit(1);
});
