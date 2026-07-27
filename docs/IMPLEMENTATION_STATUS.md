# Implementation status

This document describes what is usable today on `feat/ddone-pro-elements-canvas-ux`.
It intentionally separates code that exists from workflows that are proven end to end.

## Status levels

- **Verified** — covered by automated checks or a repeatable smoke test.
- **Usable** — connected to the UI and backend, but still needs wider production use.
- **Partial** — foundations exist, but the workflow does not yet meet the product promise.
- **Planned** — not available and must not be presented as implemented.

## Product maturity

The repository is an **alpha workspace**, not yet a complete Canva replacement.
The strongest areas are tenancy, private storage, the Fabric.js editor foundation and the local Elements packs. The weakest areas are workflow polish, discoverability, automated visual verification and several advanced editor promises.

## Verified

### Runtime and deployment

- Node.js/Hono production runtime.
- PostgreSQL pool and versioned migrations.
- Local and S3-compatible/MinIO storage.
- Docker and Coolify deployment paths.
- Health check, authentication bootstrap and API smoke tests.

### Identity and permissions

- Registration, login and logout.
- Signed HTTP-only session cookies.
- Multiple organizations per user.
- OWNER, ADMIN, EDITOR and VIEWER roles.
- Organization/client scoping enforced by server routes.

### Elements reliability

- Local DDone structural assets, Tabler Icons and Twemoji packs are bundled.
- Provider metadata and source/license fields are retained.
- Unsafe SVG responses are rejected before they reach Fabric.js.
- A selected local provider now returns its own assets instead of an empty mixed-pack page.
- Non-paginated Iconify results are no longer repeated forever by “load more”.
- Regression tests cover provider parsing, local-provider category normalization and repeated-page removal.

## Usable

### Editor

- Multi-page Fabric.js canvas.
- Text, shapes, uploaded images and backgrounds.
- Selection toolbar, crop panel and common object controls.
- PNG, JPG, SVG and multi-page PDF export paths.
- Undo/redo, save and version foundations.

### Elements library

- Federated search across enabled providers.
- Category, provider and format filters.
- Local structural assets, icons and emoji.
- Remote images can be persisted into private storage before insertion.
- Favorites and recents are stored in the browser.
- Provider failures are isolated and returned as warnings.

### Collaboration

- Authenticated Yjs WebSocket endpoint.
- Persistent collaboration state.
- Presence metadata and collaborator indicators.
- Multipage object synchronization foundations.

## Partial

### Elements experience

- The opening screen emphasizes category promises more than immediately visible assets.
- Favorites only filter the currently loaded result set; they are not yet a server-backed library.
- Provider availability is returned by the API but not explained clearly enough in the UI.
- Search relevance depends heavily on provider quality and configuration.
- Pexels and Pixabay require administrator API keys.
- There is no visual snapshot suite proving that every category renders useful results.

### Templates and brand kits

- Templates, edit rules and brand-kit records exist.
- Template locking and editable regions need broader end-to-end coverage.
- Brand application is not yet a one-click document-wide workflow.

### Collaboration UX

- Presence is available, but remote cursors and conflict communication require more product polish.
- Offline/reconnect behavior is not yet verified through a dedicated automated suite.

### Production readiness

- The branch contains many large features developed together, which increases regression risk.
- Unit coverage remains small compared with the amount of editor and server code.
- No browser-level E2E suite currently exercises the editor visually.
- Accessibility, keyboard-only editing and mobile/tablet editing need dedicated acceptance tests.

## Planned or not complete

These items must not be marketed as complete until acceptance tests exist:

- Full Canva-level drag-and-drop workflow parity.
- Server-synchronized favorites and shared asset collections.
- Automated attribution reports on export.
- Rich editable charts and data-bound tables.
- Smart resizing across multiple design formats.
- Production-grade remote cursors and collaborative conflict UX.
- Comprehensive mobile/tablet editor support.
- Browser visual-regression coverage.

## Required quality gate

Every feature promoted in the README should satisfy all of the following:

1. The UI exposes the workflow without hidden configuration.
2. The backend returns a useful result for the default setup.
3. Empty, loading, disabled-provider and error states are explicit.
4. At least one automated regression test covers the main failure mode.
5. The feature is included in `pnpm check` or a runtime smoke test.

Run the local quality gate with:

```bash
pnpm check
```
