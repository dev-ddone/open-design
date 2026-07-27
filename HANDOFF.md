# DDone Design handoff

## Current delivery branch

`feat/ddone-smart-elements-editor`

This branch is stacked on PR #4 and contains the most complete static-editor implementation. It must be rebased or consolidated with the current `feat/ddone-pro-elements-canvas-ux` head before merge because the stacked history has diverged.

## Product decision

DDone Design is a static visual-design platform. Video, audio, animated timelines, GIF editing and 3D are not part of the product. See `docs/PRODUCT_SCOPE.md`.

## Current version

`2.8.0-alpha.1`

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
- static Smart Resize and separate resized campaign designs;
- Design Audit for brand, layout, accessibility, templates and attribution;
- CSV/Markdown attribution reports;
- design comments tied to page or object;
- review states: draft, in review, changes requested and approved;
- semantic template fields for text, price, CTA, image and logo;
- required-field and duplicate-key validation;
- CSV application to the current page;
- CSV generation of up to 100 pages with a safety version.

## Database migrations

Migrations run automatically at startup. Relevant recent migrations:

- `003_element_preferences.sql` creates user/organization preference storage;
- `004_element_preference_items.sql` stores complete favorite cards for cross-device rendering;
- `005_design_reviews.sql` adds review state and page/object comments.

Existing PostgreSQL and MinIO volumes remain compatible. Back up both before staging deployment.

## Local validation

```bash
corepack enable
pnpm install --no-frozen-lockfile
pnpm check
```

The CI workflow additionally boots PostgreSQL, starts the production server, runs migrations, verifies authentication/client/design flows, tests Elements, realtime collaboration, preferences and the design-review workflow, then builds the production Docker image.

## Required staging acceptance

1. Log in as OWNER, client EDITOR and VIEWER.
2. Create a multipage design and verify permissions.
3. Insert local and remote SVG/image assets.
4. Favorite an element, open another browser session and verify synchronization after reopening the Elements panel.
5. Insert and edit a smart table and photo grid.
6. Group objects, reorder layers and use keyboard movement.
7. Run Smart Resize and create a separate story/A4 campaign variant.
8. Apply a brand kit and run Controllo design.
9. Export CSV and Markdown attribution reports.
10. Mark text, price and image objects as semantic template fields.
11. Import a CSV, apply one record and generate multiple pages.
12. Add an object comment, resolve it, request review and approve the design.
13. Export PNG, SVG and multipage PDF and compare visually.
14. Edit simultaneously from two browsers and test reconnect.

## Known limitations

- Smart Resize uses geometric scaling and relative placement; it does not perform AI or constraint-based semantic reflow.
- Resized campaign designs and CSV-generated pages are independent after creation, not live-linked variants.
- The audit reports issues but does not yet block export or automatically repair them.
- Review approval does not yet enforce an export gate.
- Comments do not yet render as canvas pins and mentions/email notifications are not delivered.
- Preference synchronization uses the existing local-first Elements UI; remote changes appear when the panel is reopened or the editor is reloaded.
- Named collections are persisted, but complete collection-management UI remains pending.
- CSV is supported; native XLSX parsing remains pending.
- Semantic image fields accept a resolvable URL; an integrated asset-picker replacement flow remains pending.
- Rich data-bound charts and tables are not live-linked to spreadsheet data.
- Browser E2E, visual regression and export golden-file coverage remain incomplete.
- Remote cursor and offline/reconnect behavior require broader acceptance coverage.
- The stacked PR history is not currently mergeable without consolidation.

## Next implementation order

1. consolidate PR #5 with the current PR #4 head;
2. Playwright editor journeys and screenshot/export visual regression;
3. native XLSX import and data-bound smart tables/charts;
4. approval and audit export gates;
5. object comment pins, mentions and notifications;
6. production-grade remote cursors and reconnect tests;
7. plugin/extension SDK and public integration contracts.

## Release documentation

Every release must update `changelog/`, this handoff when architecture or deployment changes, and `docs/IMPLEMENTATION_STATUS.md`. Marketing claims are allowed only when a workflow has UI exposure, a working default configuration, explicit error states and automated validation.
