# DDone Design handoff

## Current delivery branch

`feat/ddone-smart-elements-editor`

This branch is stacked on PR #4 and contains the most complete static-editor implementation. Continue from this branch until the stacked pull requests are consolidated.

## Product decision

DDone Design is a static visual-design platform. Video, audio, animated timelines, GIF editing and 3D are not part of the product. See `docs/PRODUCT_SCOPE.md`.

## Current version

`2.6.0-alpha.1`

## What is implemented

- organization/client tenancy and role-aware APIs;
- private local/S3-compatible asset storage;
- multi-page Fabric editor;
- realtime object-level Yjs collaboration foundations;
- PNG, JPG, SVG and multi-page PDF export paths;
- versions, restore and template application snapshots;
- brand kits and template edit policies;
- strict static Elements catalog with local packs and external providers;
- editable smart tables, grids and frames;
- layers, grouping, ordering, visibility, locking and keyboard controls;
- SVG palette editing and image tools;
- synchronized favorites, recent items and collection persistence;
- static Smart Resize;
- design audit for brand, layout, accessibility and attribution.

## Database migrations

Migrations run automatically at startup. New in this release:

- `003_element_preferences.sql` creates user/organization preference storage;
- `004_element_preference_items.sql` stores complete favorite cards for cross-device rendering.

Existing PostgreSQL and MinIO volumes remain compatible. Back up both before staging deployment.

## Local validation

```bash
corepack enable
pnpm install --no-frozen-lockfile
pnpm check
```

The CI workflow additionally boots PostgreSQL, starts the production server, verifies authentication/client/design flows, tests Elements and realtime collaboration and builds the Docker image.

## Required staging acceptance

1. Log in as OWNER, client EDITOR and VIEWER.
2. Create a multipage design and verify permissions.
3. Insert local and remote SVG/image assets.
4. Favorite an element, open another browser session and verify synchronization after reopening the Elements panel.
5. Insert and edit a smart table and photo grid.
6. Group objects, reorder layers and use keyboard movement.
7. Run Smart Resize from square to story and A4 formats.
8. Apply a brand kit and run Controllo design.
9. Export PNG, SVG and multipage PDF and compare visually.
10. Edit simultaneously from two browsers and test reconnect.

## Known limitations

- Smart Resize transforms the current page; linked campaign variants and automatic content reflow are not yet implemented.
- The design audit reports issues but does not yet block export or automatically repair them.
- Preference synchronization uses the existing local-first Elements UI; remote changes appear when the panel is reopened or the editor is reloaded.
- Named collections are persisted, but a complete collection-management UI is still pending.
- Template placeholders are still object-ID policies rather than semantic fields.
- Comments, approvals and reviewer workflows are not yet implemented.
- Data-bound charts/tables, CSV bulk generation and batch export remain pending.
- Browser E2E, visual regression and export golden-file coverage remain incomplete.
- Remote cursor and offline/reconnect behavior require broader acceptance coverage.

## Next implementation order

1. semantic template placeholders and image replacement;
2. comments, mentions and approval workflow;
3. CSV/XLSX bulk creation and data-bound components;
4. Playwright plus visual/export regression tests;
5. export attribution report and optional export blocking on audit errors;
6. linked campaign variants built on top of Smart Resize.

## Release documentation

Every release must update `changelog/`, this handoff when architecture or deployment changes, and `docs/IMPLEMENTATION_STATUS.md`. Marketing claims are allowed only when a workflow has UI exposure, a working default configuration, explicit error states and automated validation.
