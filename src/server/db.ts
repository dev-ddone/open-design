import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import pg, { type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const directory = resolve(process.cwd(), "migrations");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const applied = new Set(
    (await query<{ version: string }>("SELECT version FROM schema_migrations")).map(
      (row) => row.version,
    ),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(resolve(directory, file), "utf8");
    await transaction(async (client) => {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING",
        [file],
      );
    });
    console.info(`Applied migration ${file}`);
  }
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";
}

export async function bootstrapAdmin(): Promise<void> {
  const count = await one<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
  if (Number(count?.count ?? 0) > 0) return;

  const { email, password, name, organizationName } = config.bootstrap;
  if (!email || !password) {
    console.warn(
      "Database has no users. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD or register through the UI.",
    );
    return;
  }
  if (password.length < 10) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 10 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await transaction(async (client) => {
    const user = await client.query<{ id: string }>(
      `INSERT INTO users(email, name, password_hash)
       VALUES (lower($1), $2, $3)
       RETURNING id`,
      [email, name, passwordHash],
    );
    const baseSlug = slugify(organizationName);
    const organization = await client.query<{ id: string }>(
      `INSERT INTO organizations(name, slug, created_by)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [organizationName, `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`, user.rows[0].id],
    );
    await client.query(
      `INSERT INTO organization_members(organization_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [organization.rows[0].id, user.rows[0].id],
    );
  });
  console.info(`Created bootstrap administrator ${email}`);
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
