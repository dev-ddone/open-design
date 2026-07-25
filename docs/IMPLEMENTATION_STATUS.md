# Implementation status

## Implemented in `feat/ddone-platform-foundation`

### Production foundation

- Node.js/Hono production runtime.
- PostgreSQL pool and versioned SQL migrations.
- Automatic first-run owner bootstrap.
- Local and S3-compatible/MinIO object storage.
- Multi-stage Dockerfile.
- Docker Compose stack for application, PostgreSQL and MinIO.
- Health endpoint and container health check.
- Coolify deployment and backup documentation.
- Cloudflare D1 and obsolete SQLite runtime files removed.

### Identity, tenancy and permissions

- User registration, login and logout.
- Signed HTTP-only session cookies.
- Multiple organizations per user.
- Roles: OWNER, ADMIN, EDITOR and VIEWER.
- Server-side role enforcement.
- Workspace member management.
- Client records inside each organization.
- Design and template association with organizations and clients.
- Viewer-only interface and canvas behavior.

### Collaboration

- Authenticated WebSocket endpoint per design.
- Yjs document synchronization.
- Persistent collaboration state in PostgreSQL.
- Multipage Fabric.js canvas synchronization.
- Presence metadata and collaborator indicators.
- Reconnection and debounced updates.

### Elements library

- Unified search endpoint.
- Native shapes.
- Allowlisted Iconify search and SVG proxy.
- Built-in recolorable SVG categories:
  - ornaments;
  - frames;
  - food;
  - cocktails;
  - backgrounds;
  - social logos.
- License/source metadata in the element model.
- Private asset upload and retrieval.

### Editor improvements

- Organization and client selectors.
- A4 and additional social canvas presets.
- New menu, social story and poster templates.
- Realtime connection and collaborator status.
- Role-aware gallery, toolbar, sidebar and page controls.

## Follow-up candidates

- Email invitation delivery and password reset.
- Per-client member restrictions beyond organization membership.
- Visual remote cursors on top of the Fabric.js canvas.
- Version history and restore UI.
- Template lock regions and controlled text/image placeholders.
- PDF, JPG and SVG export.
- Asset favorites and recent elements UI.
- Automated attribution export for third-party assets.
