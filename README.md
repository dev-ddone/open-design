<img src="readme-banner.png" alt="DDone Design preview" width="100%" />

# DDone Design

A self-hosted, open-source Canva-like design workspace based on Open Design. It combines a Fabric.js visual editor with multi-page designs, organizations, client separation, role-based permissions, private asset storage and realtime Yjs collaboration.

## Included

- **Organizations and users** with cookie-based authentication.
- **Roles:** `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`.
- **Client separation** inside each organization.
- **Realtime collaboration** over authenticated WebSockets with persistent Yjs state.
- **Multi-page Fabric.js editor** with PNG export and reusable templates.
- **Searchable Elements library:** shapes, icons, ornaments, frames, food, cocktails, backgrounds and social logos.
- **Iconify provider** limited to configured open-source collections.
- **PostgreSQL** for users, permissions, designs, clients, assets and realtime documents.
- **S3/MinIO or local storage** for private uploads.
- **Docker Compose and Coolify deployment** with health checks and automatic migrations.

## Quick start

Requirements:

- Docker with Compose
- Git

```bash
git clone https://github.com/dev-ddone/open-design.git
cd open-design
cp .env.example .env
```

Set at least these values in `.env`:

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

Open:

```text
http://localhost:3006
```

Health check:

```text
http://localhost:3006/health
```

## Local development

Run PostgreSQL and MinIO:

```bash
docker compose up -d postgres minio
```

Install dependencies and start Vite plus the Node API:

```bash
corepack enable
pnpm install --no-frozen-lockfile
cp .env.example .env
pnpm dev
```

Frontend development URL:

```text
http://localhost:5178
```

API and production URL:

```text
http://localhost:3006
```

## Permission model

| Capability | Owner | Admin | Editor | Viewer |
|---|---:|---:|---:|---:|
| Manage workspace members | Yes | Yes | No | No |
| Create clients | Yes | Yes | Yes | No |
| Create and edit designs | Yes | Yes | Yes | No |
| Upload and reuse assets | Yes | Yes | Yes | No |
| View and export designs | Yes | Yes | Yes | Yes |

Every design, client, uploaded asset and private template is scoped to an organization. API authorization is applied server-side; hiding controls in the interface is not the security boundary.

## Elements library

The editor sidebar contains:

```text
Elements
├── Search
├── Shapes
├── Icons
├── Ornaments
├── Frames
├── Food
├── Cocktails
├── Backgrounds
└── Social logos
```

Built-in SVG elements can be recolored before insertion. Icon searches are proxied through the application and restricted through `ICONIFY_COLLECTIONS`.

## Production deployment

See [`docs/COOLIFY_DEPLOYMENT.md`](docs/COOLIFY_DEPLOYMENT.md) for:

- Coolify configuration;
- required secrets;
- persistent volumes;
- WebSocket routing;
- backup and recovery;
- safe update steps.

## Architecture

```text
src/client
  Preact UI
  Fabric.js multi-page editor
  session/workspace controls
  searchable elements library
  Yjs collaboration client

src/server
  Hono API on Node.js
  JWT cookie authentication
  organization and role authorization
  PostgreSQL persistence
  MinIO/S3 storage
  authenticated Yjs WebSocket server

migrations
  versioned PostgreSQL schema
```

## License

MIT. The project remains based on the upstream Open Design work. Third-party icon collections and trademarks retain their respective licenses and usage rules.
