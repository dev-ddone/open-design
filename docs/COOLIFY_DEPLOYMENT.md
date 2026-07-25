# DDone Design — Coolify deployment

## Architecture

The production stack contains:

- `app`: Node.js 22, Hono API, Preact/Fabric.js frontend, federated asset adapters and authenticated Yjs WebSocket server.
- `postgres`: users, organizations, client ACLs, projects, versions, templates, brand kits and collaboration documents.
- `minio`: private S3-compatible storage for uploads and reusable assets.

The application listens internally on port `3006`.

## Coolify

1. Add this GitHub repository as a new resource.
2. Select **Docker Compose** as the build/deployment type.
3. Select the branch being tested. For the complete stacked feature set use `feat/ddone-elements-universe` until the pull requests are merged.
4. Use `/docker-compose.yml` as the Compose location.
5. Assign the public application domain only to the `app` service and internal port `3006`.
6. Do not expose PostgreSQL or MinIO publicly.
7. Configure the variables below and deploy.

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

`APP_URL` must be the exact public HTTPS origin. Password-reset and invitation links are generated from this value.

Recommended production setting:

```env
REGISTRATION_ENABLED=false
```

Bootstrap credentials are used only when the `users` table is empty. Replace the bootstrap environment password with another random secret after the initial account exists.

## Federated Elements universe

Recommended Coolify values:

```env
ELEMENTS_PROVIDERS=builtin,uploads,iconify,openverse,wikimedia
ELEMENTS_CACHE_TTL_SECONDS=900
ELEMENTS_REQUEST_TIMEOUT_MS=8000
ELEMENTS_MAX_PER_PROVIDER=48
ICONIFY_API_URL=https://api.iconify.design
ICONIFY_COLLECTIONS=tabler,ph,heroicons,bi,material-symbols
OPENVERSE_API_URL=https://api.openverse.org
OPENVERSE_CLIENT_ID=<Openverse application client_id>
OPENVERSE_CLIENT_SECRET=<Openverse application client_secret>
OPENVERSE_API_TOKEN=
OPENVERSE_LICENSES=cc0,pdm,by,by-sa
WIKIMEDIA_API_URL=https://commons.wikimedia.org/w/api.php
ELEMENT_PACK_URLS=
```

Configure `OPENVERSE_CLIENT_ID` and `OPENVERSE_CLIENT_SECRET` together. Mark `OPENVERSE_CLIENT_SECRET` as secret in Coolify. Never expose it to the frontend, commit it to Git or paste it into logs.

The backend uses the OAuth2 `client_credentials` flow automatically:

1. the first Openverse request obtains a short-lived access token;
2. the token is kept only in the `app` process memory;
3. concurrent requests share one in-flight token acquisition;
4. the token is refreshed before its advertised expiration;
5. a `401` invalidates the token and retries the original request once with a new token;
6. if token acquisition temporarily fails, the provider uses `OPENVERSE_API_TOKEN` when configured, otherwise anonymous access.

`OPENVERSE_API_TOKEN` is therefore a legacy/manual fallback and should normally remain empty. No scheduled task, cron job, database table or persistent token volume is required. Each application replica can maintain its own token safely.

Both credentials must be present or both must be empty. Supplying only one causes startup to fail with an explicit configuration error.

Provider requests are made by the `app` container. The server therefore needs outbound HTTPS access to:

- `api.iconify.design`;
- `api.openverse.org`;
- `commons.wikimedia.org` and Wikimedia upload hosts;
- any administrator-configured manifest origin.

A provider failure returns a warning and does not stop the editor. Server cache and timeouts limit repeated upstream calls.

### Optional element packs

`ELEMENT_PACK_URLS` accepts comma-separated HTTPS JSON manifests. Add `manifest` to `ELEMENTS_PROVIDERS` when enabling them:

```env
ELEMENTS_PROVIDERS=builtin,uploads,iconify,openverse,wikimedia,manifest
ELEMENT_PACK_URLS=https://assets.example.com/menu-pack.json,https://assets.example.com/ornaments.json
```

Only configure manifests controlled or reviewed by the administrator. Each manifest must provide license/source metadata for its items.

## SMTP email

Real invitations and password recovery require SMTP:

```env
EMAIL_DELIVERY=smtp
EMAIL_FROM=DDone Design <noreply@ddone.it>
EMAIL_REPLY_TO=info@ddone.it
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@ddone.it
SMTP_PASSWORD=<smtp password>
PASSWORD_RESET_TTL_MINUTES=30
INVITATION_TTL_HOURS=72
```

For port `465` normally use:

```env
SMTP_PORT=465
SMTP_SECURE=true
```

`EMAIL_DELIVERY=log` is suitable only for local development or isolated staging because it writes one-time invitation and reset URLs to application logs.

The app verifies SMTP during startup. A failed verification does not stop the editor, but invitation and password-reset delivery cannot succeed until SMTP is corrected.

## Other optional variables

```env
SESSION_TTL_DAYS=14
STORAGE_DRIVER=s3
```

## First deployment

At startup the application automatically:

1. installs the Openverse authentication lifecycle according to the configured mode;
2. connects to PostgreSQL;
3. applies pending SQL migrations from `migrations/`;
4. creates the bootstrap owner when the database has no users;
5. creates the configured MinIO bucket when missing;
6. verifies SMTP when enabled;
7. starts HTTP and authenticated WebSocket services.

The application log reports only the selected Openverse mode:

```text
Openverse authentication mode: oauth2-auto
```

It never logs the client secret or access token.

Health endpoint:

```text
/health
```

## Reverse proxy and WebSockets

The public domain must route HTTP traffic and WebSocket upgrades to port `3006`. Coolify's standard proxy configuration supports this when the domain is assigned to `app`.

Realtime endpoint:

```text
/api/collaboration/<design-id>
```

Object-level Yjs data and cursor awareness share this authenticated WebSocket connection.

## Persistent data

Never remove these Compose volumes during a normal update:

- `postgres_data`;
- `minio_data`;
- `app_uploads`.

`app_uploads` is a fallback local volume. When `STORAGE_DRIVER=s3`, uploaded files and selected remote raster assets are stored in `minio_data`.

Remote search previews and Openverse access tokens are cached only in process memory and do not require another persistent volume. Selecting a remote raster item imports it into private storage and stores its source/license metadata in PostgreSQL and the design.

## Backup

### PostgreSQL

```bash
docker compose exec -T postgres pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --format=custom > open-design-postgres.dump
```

### MinIO

Back up the `minio_data` Docker volume or mirror the bucket with an S3-compatible backup tool.

A complete recovery requires PostgreSQL and object storage because the database contains asset metadata while MinIO contains uploaded and imported image/SVG bytes.

## Update

1. Take PostgreSQL and MinIO backups.
2. Change the Git branch or deploy the new commit.
3. Keep existing volumes.
4. Let the application apply only unrecorded migrations.
5. Verify `/health`, login, one Elements search, one remote image insertion, one upload, SMTP, password reset and a two-browser realtime session.
6. With Openverse credentials configured, check the `app` startup log for `Openverse authentication mode: oauth2-auto`.

## Security and licensing

- Use HTTPS only in production.
- Keep PostgreSQL and MinIO on the private Compose network.
- Use independent random values for database, JWT, SMTP and MinIO secrets.
- Treat `OPENVERSE_CLIENT_SECRET` as a production secret.
- Set `REGISTRATION_ENABLED=false` when public registration is not required.
- Do not use `EMAIL_DELIVERY=log` in production.
- Assign `VIEWER` to clients who should inspect/export but not edit projects.
- SVG uploads reject scripts, event handlers, external resources, embedded documents and XML entities.
- Direct member insertion is disabled; members join through expiring invitations.
- Remote works retain their original licenses. Attribution metadata is saved with inserted objects, but the operator and end user remain responsible for complying with each source license and trademarks.
