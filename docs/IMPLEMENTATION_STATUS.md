# Studio 3 implementation status

This document describes `feat/ddone-studio-3` at `3.0.0-alpha.1`. It separates implemented product workflows from wider production-readiness and ecosystem work.

## Status levels

- **Verified** — exercised by unit tests, runtime smoke tests, Playwright or a deterministic golden check.
- **Usable** — connected to the product UI and persistence layer, but still needs broader production use.
- **Partial** — the workflow exists, but the full market-level promise remains broader.
- **Out of scope** — intentionally excluded from this static-design product.

## Product maturity

DDone Design Studio 3 is a self-hosted static-design workspace for agencies, organizations and client-separated production. It is not a complete Canva replacement. Its strongest workflows are structured design editing, semantic templates, spreadsheet-driven production, governed review/export, multi-page campaigns, private assets and realtime collaboration.

## Verified Studio 3 workflows

### Data production

- CSV, XLSX, XLS, XLSM and ODS import.
- Workbook and sheet selection.
- Tabular preview before applying data.
- Automatic and manual column-to-semantic-field mapping.
- Required-field completeness checks.
- Apply one record to the current page.
- Generate up to 250 static pages with a safety version.

### Batch export

- ZIP export across one or more designs/campaigns.
- PNG, JPG, SVG and Fabric JSON outputs.
- Per-project folders, ordered page filenames and `manifest.json`.
- Configurable raster scale, progress reporting and a 2,000-file safety limit.

### Governance and approval

- Persistent review states: draft, in review, changes requested and approved.
- Persistent governance events for review decisions, export overrides, brand migrations, batch exports and plugin actions.
- Export preflight connected to Design Audit, review state and unresolved comments.
- Viewer/read-only users cannot bypass blockers.

### Review and notifications

- Point pins and rectangular comment regions.
- Pins can be dragged and their normalized page coordinates persist.
- Object-linked pins follow Fabric objects.
- Comment replies, resolution/reopening and reviewer assignment.
- Mentions resolve against workspace members.
- Persistent in-app notifications with unread state.
- Email delivery through the configured workspace mail transport.

### Page organization

- Searchable full-screen page overview.
- Desktop drag-and-drop ordering.
- Keyboard ordering with `Alt` + arrow keys.
- Touch-friendly previous/next ordering controls.
- Atomic server persistence with complete-page validation and stale-list conflict protection.

### Assets and brand

- Unified asset picker for insertion, replacement, semantic image fields and logos.
- Private uploads plus configured open-content providers.
- DDone PNG Studio with more than 45 bundled raster graphics, mockups, overlays, shadows, textures and backgrounds.
- One-click document-wide brand migration.
- Migration preview for colors, fonts, logos and structured smart elements.
- Automatic safety version and persistent migration event.

### Smart elements and styling

- Structured smart tables, grids and frames.
- Structured charts with editable labels, numeric series, palette, legend and layout.
- Structured modules with editable copy, CTA, media, spacing, colors and variants.
- Rebuild preserves object placement, transform and collaboration metadata.
- Reusable style recipes with intensity and selection/type/page scope.
- Custom recipes can be captured from a selected object.

### Collaboration and productivity

- Realtime Yjs object and page synchronization.
- Remote cursors and remote selection indicators.
- Connecting, synced, reconnecting, offline and error states.
- Exponential reconnect backoff with jitter, online/offline handling and periodic resynchronization.
- Command palette with searchable actions.
- Shortcut reference and keyboard navigation.

### Plugin SDK v1

- Versioned declarative JSON manifest.
- Permission declarations for canvas read/write, assets and network access.
- Commands for opening product panels/URLs, inserting declarative Fabric elements and controlled HTTP requests.
- Typed settings, client/organization scoping, enable/disable and persistent installations.
- Server-side manifest validation and permission checks.

### Quality gates

- TypeScript typecheck.
- Node unit and regression tests.
- Openverse and Wikimedia provider smoke tests.
- Runtime API, account, ACL, template, version, review, page-order, realtime, governance, notification and plugin smoke tests.
- Runtime validation of original and expanded PNG Studio assets.
- Functional Playwright editor journeys.
- Versioned visual-regression hashes for the editor shell and PNG asset picker.
- Canonical normalized SVG export golden file.
- Frontend production build and Docker image build.

## Usable but not complete market parity

### Smart Resize

- Geometric multi-format resize and independent campaign copies are available.
- Variants are not live-linked after creation.
- Semantic content-priority reflow and AI layout decisions are not implemented.

### Spreadsheet output

- Generated pages are static snapshots, not live-linked spreadsheet records.
- Structured charts and tables can be edited, but they are not continuously bound to workbook ranges.

### Plugin ecosystem

- SDK v1 intentionally executes declarative, permission-aware actions.
- Arbitrary remote JavaScript is not executed in the editor.
- OAuth provider lifecycle, signed packages, webhook subscriptions, marketplace discovery and dependency/version resolution remain future ecosystem work.

### Style recipes

- Built-in and custom recipes are functional.
- Custom recipes are currently browser-local rather than organization-synchronized records.

### Element semantics

- Tables, grids, frames, charts and modules are structured smart elements.
- Icons, emoji, photos and freeform vectors remain normal Fabric objects; they are editable, recolorable and styleable but do not all expose dedicated semantic schemas.

### Collaboration acceptance

- Runtime realtime smoke tests and single-browser editor journeys are present.
- A dedicated two-browser reconnect/conflict Playwright scenario remains desirable before a stable release.

### Accessibility and devices

- Keyboard commands and touch-friendly page controls are present.
- Complete WCAG auditing, screen-reader acceptance, tablet matrix testing and mobile production certification remain incomplete.

### Raster library

- The bundled PNG Studio is now useful for common decorative and product-layout needs.
- It is not a substitute for a full stock-photo library; photographic depth still comes from uploads and enabled external providers.

## Out of scope

- Video editing.
- Audio editing.
- Animated timeline or GIF authoring.
- 3D scene/model editing.

## Promotion rule

A feature should only be marketed as complete when:

1. The UI exposes the workflow without hidden setup.
2. The backend/editor produces a useful default result.
3. Empty, loading, disabled and error states are explicit.
4. At least one automated regression or runtime check covers its main failure mode.
5. The workflow participates in CI or a repeatable acceptance test.

Run the local base gate with:

```bash
pnpm check
```

Run the browser gates with:

```bash
pnpm test:e2e
pnpm test:visual
```
