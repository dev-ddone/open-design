import { bootstrapAdmin, closeDatabase, migrate } from "./db.js";

async function main(): Promise<void> {
  await migrate();
  await bootstrapAdmin();
  await closeDatabase();
}

main().catch((error) => {
  console.error("Migration failed", error);
  process.exit(1);
});
