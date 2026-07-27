# Implementation status

This document describes `feat/ddone-smart-elements-editor` at version `2.8.0-alpha.1`. It separates code that exists from workflows proven by automated checks or repeatable acceptance tests.

## Status levels

- **Verified** — covered by automated checks or a repeatable runtime smoke test.
- **Usable** — connected to UI and backend, but still needs broader production use.
- **Partial** — foundations exist, but the workflow does not yet meet the complete product promise.
- **Planned** — not available and must not be marketed as implemented.
- **Out of scope** — intentionally excluded from the product.

## Product maturity

DDone Design is an alpha static-design workspace for agencies and organizations. Its strongest areas are self-hosting, client separation, private assets, static editing, template/data foundations and controlled review workflows. It is not yet a complete Canva replacement.

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

### Review workflow

- Persistent design review state.
- Comments attached to design, page or object.
- Comment resolution and reopening.
- Draft, in-review, changes-requested and approved transitions.
- Runtime smoke coverage for comment and approval persistence.

### Data and template utilities

- Semantic field metadata is serialized with Fabric objects.
- CSV parser supports quoted fields and comma/semicolon detection.
- Serialized data merge has unit coverage for text, image and nested group fields.
- Design Audit detects missing required fields and duplicate field keys.

### Quality gate

- TypeScript typecheck.
- Node unit and regression tests.
- Openverse and Wikimedia smoke tests.
- Runtime API, Elements, template, version, review and realtime smoke tests.
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

- Smart Resize for common social, print and presentation formats.
- Resized campaign copies created as independent designs with their own dimensions.
- Design Audit for page bounds, semantic template fields, text size, brand fonts/colors, layer naming and attribution.
- CSV and Markdown attribution reports.
- Semantic template fields for text, price, CTA, image and logo.
- Apply one CSV record to the open page.
- Generate up to 100 pages from CSV with a safety version.
- Federated search across enabled static providers.
- Server-synchronized preference bridge with browser-local offline cache.

### Collaboration

- Authenticated Yjs WebSocket endpoint.
- Persistent collaboration state.
- Presence metadata and collaborator indicators.
- Multipage object synchronization foundations.
- Review panel for comments and approval decisions.

## Partial

### Smart Resize and campaign variants

- Geometric scaling and relative positioning are implemented.
- Separate campaign designs can be generated.
- Variants are independent after creation and are not live-linked.
- Semantic text reflow and content-priority layout decisions are not implemented.

### Design Audit and governance

- It reports and selects problematic objects.
- It exports attribution data.
- It does not yet repair issues or block export/approval automatically.
- Contrast analysis and complete WCAG validation are not yet implemented.

### Templates and brand kits

- Templates, edit rules, semantic fields and brand-kit records exist.
- Locking and editable regions require wider browser-level coverage.
- Image/logo fields currently accept a resolvable URL instead of an integrated asset-picker replacement flow.
- Brand application is not yet a one-click document-wide migration workflow.

### Data-driven production

- CSV application and multipage generation are implemented.
- Native XLSX parsing remains pending.
- Generated pages are static snapshots, not live-linked records.
- Rich charts and tables are not yet bound to spreadsheet data.
- Batch export of generated records remains pending.

### Review UX

- Comments can target an object or page and can be resolved.
- Comments do not yet render as pins over the canvas.
- Mentions, notifications and email delivery are pending.
- Approval does not currently enforce an export gate.

### Preferences and collections

- Preferences persist across user and organization sessions.
- The existing Elements panel remains local-first, so remote changes appear after reopening the panel or reloading the editor.
- Complete collection-management UI remains pending.

### Collaboration UX

- Presence is available, but production-grade remote cursors and conflict communication remain incomplete.
- Offline and reconnect behavior lacks a dedicated automated browser suite.

### Production readiness

- No Playwright editor journey suite yet.
- No screenshot visual-regression or export golden-file suite yet.
- Keyboard-only, WCAG and tablet acceptance coverage remain incomplete.
- The stacked PR history must be consolidated before a stable release.

## Planned

- Native XLSX import.
- Data-bound editable tables and charts.
- Batch export for generated pages/records.
- Export gates based on approval status and audit errors.
- Canvas comment pins, mentions and notifications.
- Playwright and visual/export regression suites.
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
