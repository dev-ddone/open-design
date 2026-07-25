# API overview

All routes except `/health`, `/api/auth/login` and `/api/auth/register` require the signed session cookie.

Organization-scoped routes accept:

```http
X-Organization-ID: <organization-uuid>
```

When the header is absent, the first organization membership is selected. The web client always sends the explicitly selected organization.

## Authentication

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

## Organizations and members

```text
GET  /api/organizations
POST /api/organizations
GET  /api/organization/members
POST /api/organization/members
```

Member management requires `ADMIN` or `OWNER`.

## Clients

```text
GET  /api/clients
POST /api/clients
```

## Designs and pages

```text
GET    /api/designs
POST   /api/designs
GET    /api/designs/:id
PUT    /api/designs/:id
DELETE /api/designs/:id
POST   /api/designs/:id/pages
POST   /api/pages/:pageId/duplicate
PUT    /api/pages/:pageId
DELETE /api/pages/:pageId
```

Writing requires at least `EDITOR`.

## Templates and brand kits

```text
GET  /api/templates
GET  /api/templates/:id
GET  /api/brand-kits
POST /api/brand-kits
```

## Private assets

```text
GET  /api/assets
POST /api/uploads
GET  /api/assets/:id/content
```

## Elements

```text
GET /api/elements/search?q=<query>&category=<category>
GET /api/elements/iconify/:prefix/:name
```

Categories:

```text
all
shapes
icons
ornaments
frames
food
cocktails
backgrounds
social
```

## Collaboration

Authenticated WebSocket endpoint:

```text
/api/collaboration/:designId
```

The server verifies that the session user belongs to the organization owning the requested design before upgrading the connection.
