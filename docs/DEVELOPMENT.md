# Development

## Services

Start only the development dependencies:

```bash
docker compose up -d postgres minio
```

Copy configuration:

```bash
cp .env.example .env
```

For local development, ensure `DATABASE_URL` points to `localhost` rather than the Compose service name:

```env
DATABASE_URL=postgresql://open_design:open_design@localhost:5432/open_design
S3_ENDPOINT=http://localhost:9000
```

Install and run:

```bash
corepack enable
pnpm install --no-frozen-lockfile
pnpm dev
```

The development frontend is served on port `5178`; Vite proxies API and WebSocket traffic to the Node server on port `3006`.

## Checks

```bash
pnpm typecheck
pnpm build
docker build -t ddone-open-design:local .
```

## Database changes

Add a new ordered file to `migrations/`, for example:

```text
migrations/002_feature_name.sql
```

Do not edit a migration that has already been applied in a shared or production environment. The migration filename is recorded in `schema_migrations`.

Apply migrations without starting the web server:

```bash
pnpm db:migrate
```

## Tenant rules

Every new private table should normally include `organization_id`. Every API query must constrain data through the authenticated organization membership. Do not rely on identifiers alone when loading, updating or deleting tenant data.

## Assets

Do not add large asset collections directly to the Git repository. Add provider metadata or store curated assets in MinIO/S3 with license metadata in the `assets` table.
