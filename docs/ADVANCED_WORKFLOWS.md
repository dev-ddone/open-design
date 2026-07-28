# Advanced DDone Design workflows

## Password recovery

1. A user opens **Forgot your password?** on the login screen.
2. `POST /api/auth/forgot-password` always returns a generic success response.
3. For an existing enabled account, the server stores only the SHA-256 hash of a random one-time token.
4. The link expires after `PASSWORD_RESET_TTL_MINUTES` and can be used once.
5. Completing the reset signs the user in with a new HTTP-only session cookie.

Expired, consumed and superseded reset tokens cannot be reused.

## Email invitations

Administrators invite users from **Workspace access → Invite by email**.

An invitation defines:

- workspace role: `ADMIN`, `EDITOR` or `VIEWER`;
- all-client access, or selected clients only;
- an optional `EDITOR`/`VIEWER` role for each selected client;
- expiration time.

The invitation token is random, stored only as a hash and delivered by email. A new user chooses a name and password. An existing user signs in with the invited account or accepts while already signed in.

Accepting an additional invitation is additive: it can add a new client or upgrade an existing role without deleting previously granted clients. Administrators can later replace the complete client scope from the member access editor.

## Client-specific permissions

Workspace permissions and client permissions are evaluated together.

Examples:

- workspace `EDITOR` + client `VIEWER` = effective `VIEWER`;
- workspace `EDITOR` + client `EDITOR` = effective `EDITOR`;
- workspace `ADMIN` = all clients with administrative access;
- scoped member without an `X-Client-ID` = read-only workspace shell until a permitted client is selected.

The server filters clients, designs, assets, templates and brand kits. Frontend filtering is not treated as a security boundary.

## Object-level realtime collaboration

Every design is one authenticated Yjs room. Each page uses:

```text
page:<page-id>:objects   Y.Map<object-id, Fabric object JSON>
page:<page-id>:order     Y.Array<object-id>
page:<page-id>:meta      Y.Map background and page metadata
```

Each Fabric object receives a stable `ddoneId`. Concurrent edits to different objects merge independently instead of replacing the entire page JSON.

Awareness state contains:

- user identity and display color;
- active page;
- pointer coordinates;
- selected object ID.

Remote cursors are rendered over the correct page. Realtime documents are persisted in PostgreSQL and restored after the final user disconnects and later reconnects.

## Version history

Versions are persistent database snapshots containing:

- design metadata;
- every page and its serialized canvas;
- template source and edit rules;
- author, label, source and timestamp.

A manual or save snapshot can be created from the editor. Before a restore, the server creates a safety snapshot of the current state. Restoring also clears the persisted realtime room so the restored pages become authoritative on reconnect.

## Export formats

The editor supports:

- PNG, current page, 2× resolution;
- JPG, current page, 2× resolution;
- SVG, current page;
- PDF, all pages in document order.

The PDF page size follows the canvas dimensions and orientation. Export is available to viewers because it does not mutate the project.

## Brand kits

Brand kits belong either to the organization or to one client. A kit can store:

- palette colors;
- font families;
- logo asset URLs;
- named text style objects;
- default status.

Only one default kit is permitted per organization/client scope. The sidebar can apply palette colors to a selected object or the page background, apply fonts to selected text and insert stored logos.

## Selectively locked templates

Templates persist stable object IDs and one edit policy:

- `unlocked`: every normal object is editable;
- `locked`: all objects are locked unless explicitly marked editable;
- `regions`: objects may be individually marked editable or locked.

Serialized Fabric objects include:

```text
ddoneId
templateLocked
templateEditable
_isBgImage
```

When a design is created from a template, its edit rules are copied to the design. The server keeps the source template ID, while the canvas enforces selection, movement, scaling, rotation and event restrictions for locked objects. A workspace viewer remains read-only regardless of template rules.

## SVG safety

Uploaded SVG files are decoded and validated before storage. The server rejects:

- scripts and embedded HTML documents;
- event-handler attributes;
- external network/file references;
- XML entities and doctypes;
- unsupported embedded data;
- external stylesheet and CSS URL references.

SVG authorization is checked again when the asset is retrieved.
