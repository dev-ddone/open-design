# Implementation status

This document describes `feat/ddone-smart-elements-editor` at version `2.6.0-alpha.1`. It separates code that exists from workflows that are proven end to end.

## Status levels

- **Verified** — covered by automated checks or a repeatable runtime smoke test.
- **Usable** — connected to UI and backend, but still needs broader production use.
- **Partial** — foundations exist, but the workflow does not yet meet the complete product promise.
- **Planned** — not available and must not be marketed as implemented.
- **Out of scope** — intentionally excluded from the product.

## Product maturity

DDone Design is an alpha static-design workspace for agencies and organizations. Its strongest areas are self-hosting, client separation, private assets, the Fabric editor foundation and static Elements packs. It is not yet a complete Canva replacement.

## Verified

### Runtime and deployment

- Node.js/Hono production runtime.
- PostgreSQL pool and ordered SQL migrations.
- Local and S3-compatible/MinIO storage.
- Docker and Coolify deployment paths.
- Health check, authentication bootstrap and API smoke tests.

### Identity and permissions

- Registration, login and logout.
- Signed HTTP-only session cookies.
- Multiple organizations per user.
- OWNER, ADMIN, EDITOR and VIEWER roles.
- Organization and client scoping enforced by server routes.

### Static Elements reliability

- DDone Structures, Tabler Icons and Twemoji are bundled.
- Provider, source, author, license and attribution metadata are retained.
- Unsafe SVG responses are rejected before reaching Fabric.
- Local provider filtering and pagination regressions have automated coverage.
- User/organization preference storage supports favorite IDs, complete favorite cards, recent items and named collections.

### Quality gate

- TypeScript typecheck.
- Node unit and regression tests.
- Openverse and Wikimedia smoke tests.
- Runtime API, Elements, template, version and realtime smoke tests.
- Preference persistence smoke test.
- Frontend and production Docker builds.

## Usable

### Static editor

- Multi-page Fabric canvas.
- Text, shapes, uploaded images and backgrounds.
- Layers, persistent names, visibility, locking and ordering.
- Group/ungroup, duplicate, alignment, position, size, rotation and opacity controls.
- Keyboard movement, undo/redo, deletion and grouping shortcuts.
- Crop panel and common image controls.
- Editable smart tables, grids and frames.
- SVG palette editing.
- PNG, JPG, SVG and multi-page PDF export paths.

### Static productivity

- Static Smart Resize for common social, print and presentation formats.
- Design Audit for page bounds, text size, brand fonts/colors, layer naming and required attribution.
- Federated search across enabled static providers.
- Server-synchronized preference bridge with browser-local offline cache.

### Collaboration

- Authenticated Yjs WebSocket endpoint.
- Persistent collaboration state.
- Presence metadata and collaborator indicators.
- Multipage object synchronization foundations.

## Partial

### Smart Resize

- It transforms the current page only.
- It does not yet create linked campaign variants.
- It scales and repositions objects but does not perform semantic text reflow or content-priority layout decisions.

### Design Audit

- It reports and selects problematic objects.
- It does not yet automatically repair issues or block export/approval.
- Contrast analysis and complete WCAG validation are not yet implemented.

### Templates and brand kits

- Templates, edit rules and brand-kit records exist.
- Locking and editable regions require wider browser-level coverage.
- Placeholders are still object-ID rules, not semantic text/image/logo/price fields.
- Brand application is not yet a one-click document-wide migration workflow.

### Preferences and collections

- Preferences persist across user and organization sessions.
- The existing Elements panel remains local-first, so remote changes appear after reopening the panel or reloading the editor.
- Complete collection management UI is still pending.

### Collaboration UX

- Presence is available, but production-grade remote cursors, comments and conflict communication remain incomplete.
- Offline and reconnect behavior lacks a dedicated automated browser suite.

### Production readiness

- No Playwright editor journey suite yet.
- No screenshot visual-regression or export golden-file suite yet.
- Keyboard-only, WCAG and tablet acceptance coverage remain incomplete.
- The stacked PR history should be consolidated before a stable release.

## Planned

- Semantic template placeholders and required-field validation.
- Object comments, mentions and approval workflow.
- Client-safe review and export approval gates.
- CSV/XLSX bulk creation.
- Data-bound editable tables and charts.
- Batch export and generated campaign variants.
- Automated attribution report during export.
- Plugin/extension SDK and documented public integration contracts.

## Out of scope

- Video editing.
- Audio editing.
- Animated timelines and GIF animation authoring.
- 3D scene or model editing.

## Required quality gate

Every promoted feature must satisfy all of the following:

1. The UI exposes the workflow without hidden configuration.
2. The backend or editor returns a useful result in the default setup.
3. Empty, loading, disabled and error states are explicit.
4. At least one automated regression test covers the main failure mode.
5. The feature participates in `pnpm check` or a runtime smoke test.

Run locally with:

```bash
pnpm check
```
