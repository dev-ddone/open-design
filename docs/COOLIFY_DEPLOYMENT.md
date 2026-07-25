# DDone Design — Coolify deployment

## Architecture

The production stack contains:

- `app`: Node.js 22, Hono API, Preact/Fabric.js frontend and Yjs WebSocket server.
- `postgres`: persistent application, tenant and collaboration data.
- `minio`: private S3-compatible storage for uploads and reusable assets.

The application listens internally on port `3006`.

## Coolify

1. Add this GitHub repository as a new resource.
2. Select **Docker Compose** as the build/deployment type.
3. Select branch `main` after the pull request has been merged.
4. Assign the public application domain to the `app` service and internal port `3006`.
5. Do not expose PostgreSQL or MinIO publicly unless administration access is explicitly required.
6. Configure the required variables below and deploy.

## Required variables

```env
APP_URL=https://design.example.com
JWT_SECRET=<random value of at least 32 characters>
POSTGRES_USER=open_design
POSTGRES_PASSWORD=<random database password>
POSTGRES_DB=open_design
S3_ACCESS_KEY=open-design
S3_SECRET_KEY=<random MinIO password, at least 8 characters>
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=<initial password, at least 10 characters>
BOOTSTRAP_ADMIN_NAME=Administrator
BOOTSTRAP_ORGANIZATION_NAME=My Organization
```

Recommended production setting after the first account has been created:

```env
REGISTRATION_ENABLED=false
```

The bootstrap credentials are used only when the `users` table is empty. Change or remove `BOOTSTRAP_ADMIN_PASSWORD` after the first successful deployment.

## Optional variables

```env
SESSION_TTL_DAYS=14
STORAGE_DRIVER=s3
ICONIFY_COLLECTIONS=tabler,ph,heroicons,bi,material-symbols
```

## First deployment

At startup the application automatically:

1. connects to PostgreSQL;
2. applies pending SQL migrations from `migrations/`;
3. creates the bootstrap owner when the database has no users;
4. creates the configured MinIO bucket when missing;
5. starts HTTP and authenticated WebSocket services.

Health endpoint:

```text
/health
```

## Reverse proxy and WebSockets

The public domain must route both normal HTTP traffic and WebSocket upgrades to port `3006`. Coolify's standard proxy configuration supports this when the domain is assigned to the `app` service.

Realtime endpoint pattern:

```text
/api/collaboration/<design-id>
```

## Persistent data

Never remove these Compose volumes during a normal update:

- `postgres_data`
- `minio_data`
- `app_uploads`

`app_uploads` is a fallback local volume. When `STORAGE_DRIVER=s3`, uploaded files are stored in `minio_data`.

## Backup

### PostgreSQL

```bash
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom > open-design-postgres.dump
```

### MinIO

Back up the `minio_data` Docker volume or mirror the configured bucket with an S3-compatible backup tool.

A complete recovery requires both PostgreSQL and object storage because the database contains asset metadata while MinIO contains the image/SVG bytes.

## Update

1. Take PostgreSQL and MinIO backups.
2. Pull or deploy the new image.
3. Keep the existing volumes.
4. The application applies only migrations not recorded in `schema_migrations`.
5. Verify `/health`, login, one image upload and one realtime editing session.

## Security notes

- Use HTTPS only in production.
- Keep PostgreSQL and MinIO on the private Compose network.
- Use independent random values for database, JWT and MinIO secrets.
- Set `REGISTRATION_ENABLED=false` when public registration is not required.
- Assign `VIEWER` to clients who should inspect/export but not edit projects.
