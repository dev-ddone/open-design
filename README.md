<img src="readme-banner.png" alt="DDone Design preview" width="100%" />

# DDone Design

A self-hosted, open-source static design workspace based on Open Design. It combines a Fabric.js multi-page editor with organizations, client-level permissions, private storage, realtime Yjs collaboration, a federated open-asset search engine and agency review/data workflows.

## Static product scope

DDone Design focuses on social graphics, print layouts, presentations, brand-controlled templates and collaborative agency workflows. Video editing, audio, animated timelines, GIF animation tooling and 3D are intentionally outside scope.

The current release is `2.8.0-alpha.1`. See [`docs/PRODUCT_SCOPE.md`](docs/PRODUCT_SCOPE.md), [`docs/STATIC_DESIGN_ROADMAP.md`](docs/STATIC_DESIGN_ROADMAP.md), [`HANDOFF.md`](HANDOFF.md) and [`changelog/`](changelog/).

## Included

- **Organizations and users** with secure cookie authentication.
- **Roles:** `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`, including client-specific access.
- **Realtime object-level collaboration** with presence and collaborator indicators.
- **Persistent versions**, restore and safety snapshots.
- **PNG, JPG, SVG and multi-page PDF export.**
- **Client brand kits** and selectively editable templates.
- **Layers, grouping, precision controls and keyboard shortcuts.**
- **Editable smart tables, grids and frames.**
- **Static Smart Resize** plus separate campaign variants with independent dimensions.
- **Design Audit** for layout, template fields, brand, readability and attribution checks.
- **Comments and approval states** associated with designs, pages and objects.
- **Semantic template fields** for text, price, CTA, images and logos.
- **CSV data merge** for the current page and multipage generation.
- **Attribution reports** in CSV and Markdown.
- **PostgreSQL** for accounts, ACLs, designs, versions, templates, reviews, preferences and collaboration state.
- **S3/MinIO or local storage** for private uploads.
- **Docker Compose and Coolify deployment** with health checks and automatic migrations.

## Elements universe

The Elements sidebar performs one federated search across:

- DDone curated vectors;
- private organization/client uploads;
- bundled Tabler Icons and Twemoji;
- Iconify and its open icon collections;
- Openverse openly licensed and public-domain media;
- Wikimedia Commons;
- optional administrator-managed HTTPS manifest packs.

Available categories include shapes, tables, grids, charts, icons, emoji, illustrations, photos, ornaments, frames, food, cocktails, backgrounds, patterns and social assets. Results support source filters, pagination, favorites, recents and quick searches.

Every inserted remote work keeps these fields inside the Fabric object and saved design:

- provider;
- source URL;
- author;
- license and license URL;
- attribution text;
- whether attribution is required.

Provider failures are isolated: a temporary failure of one archive returns a warning while results from healthy providers remain available. Favorites, recent items and named collections have authenticated organization-scoped persistence, with browser storage retained as an offline cache.

### Provider configuration

```env
ELEMENTS_PROVIDERS=builtin,uploads,iconify,openverse,wikimedia
ELEMENTS_CACHE_TTL_SECONDS=900
ELEMENTS_REQUEST_TIMEOUT_MS=8000
ELEMENTS_MAX_PER_PROVIDER=48
OPENVERSE_API_URL=https://api.openverse.org
OPENVERSE_CLIENT_ID=
OPENVERSE_CLIENT_SECRET=
OPENVERSE_API_TOKEN=
OPENVERSE_LICENSES=cc0,pdm,by,by-sa
WIKIMEDIA_API_URL=https://commons.wikimedia.org/w/api.php
ELEMENT_PACK_URLS=
```

For authenticated Openverse access, configure `OPENVERSE_CLIENT_ID` and `OPENVERSE_CLIENT_SECRET` together. In Coolify, mark `OPENVERSE_CLIENT_SECRET` as a secret. The backend requests a short-lived OAuth2 token, stores it only in process memory, refreshes it before expiration and retries once with a fresh token after a `401`. Concurrent searches share the same in-flight token request. If authentication is temporarily unavailable, the provider falls back to `OPENVERSE_API_TOKEN` when configured, otherwise to anonymous access.

`OPENVERSE_API_TOKEN` remains available for legacy/manual setups but should normally be empty when client credentials are used. No scheduled task, cron job or persistent token storage is required. To enable custom manifests, add `manifest` to `ELEMENTS_PROVIDERS` and provide comma-separated HTTPS manifest URLs.

## Creative, template and quality tools

The editor includes:

- object opacity and configurable drop shadows;
- brightness, contrast, saturation and blur;
- grayscale and invert;
- selected-color transparency;
- circular and rounded image masks;
- gradient backgrounds;
- dot, stripe, grid and checker patterns;
- random blob and wave generators;
- vector QR code generation;
- static Smart Resize and campaign-copy creation;
- semantic field definition and validation;
- CSV page generation;
- comments, review decisions and approval state;
- automatic design/brand audit and attribution reporting.

Generated elements are native Fabric objects, so they participate in undo/redo, saved versions, templates and realtime collaboration. Some raster image effects intentionally produce a new raster result rather than a live editable filter stack.

## Quick start

Requirements:

- Docker with Compose;
- Git.

```bash
git clone https://github.com/dev-ddone/open-design.git
cd open-design
cp .env.example .env
```

Set at least:

```env
APP_URL=http://localhost:3006
JWT_SECRET=replace-with-at-least-32-random-characters
S3_SECRET_KEY=replace-with-a-secure-minio-password
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-secure-password
```

Start the stack:

```bash
docker compose up --build -d
```

Open `http://localhost:3006`; the health endpoint is `http://localhost:3006/health`.

## Local development

```bash
docker compose up -d postgres minio
corepack enable
pnpm install --no-frozen-lockfile
cp .env.example .env
pnpm dev
```

Frontend development URL: `http://localhost:5178`.

API and production URL: `http://localhost:3006`.

Run the local quality gate with:

```bash
pnpm check
```

## Permission model

| Capability | Owner | Admin | Editor | Viewer |
|---|---:|---:|---:|---:|
| Manage workspace members | Yes | Yes | No | No |
| Configure client permissions | Yes | Yes | No | No |
| Create clients | Yes | Yes | Conditional | No |
| Create and edit designs | Yes | Yes | Yes | No |
| Upload and reuse assets | Yes | Yes | Yes | No |
| Comment on accessible designs | Yes | Yes | Yes | Yes |
| Change review state | Yes | Yes | Yes | No |
| View and export designs | Yes | Yes | Yes | Yes |

Every design, client, upload, private template and brand kit is scoped to an organization. API authorization is enforced server-side.

## Production deployment

See [`docs/COOLIFY_DEPLOYMENT.md`](docs/COOLIFY_DEPLOYMENT.md) for:

- Coolify configuration;
- required secrets and provider settings;
- persistent volumes;
- WebSocket routing;
- SMTP configuration;
- backup and recovery;
- safe update steps.

## Architecture

```text
src/client
  Preact UI
  Fabric.js multi-page static editor
  layers, smart structures and precision tools
  federated Elements browser
  semantic template fields and CSV production
  Smart Resize, review and Design Audit
  client ACL and brand-kit controls
  object-level Yjs collaboration

src/server
  Hono API on Node.js
  JWT cookie authentication
  organization/client authorization
  review/comment and preference persistence
  federated provider adapters and secure media proxies
  automatic Openverse OAuth2 token lifecycle
  PostgreSQL persistence
  MinIO/S3 storage
  authenticated Yjs WebSocket server

migrations
  versioned PostgreSQL schema
```

## Licensing

DDone Design is MIT and remains based on the upstream Open Design work. Third-party works retain their original licenses. Search results expose provider, author, source and license metadata; users remain responsible for following attribution, share-alike, trademark and other source-specific requirements.
