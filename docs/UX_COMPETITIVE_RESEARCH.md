# Static editor UX competitive research

Research date: 2026-07-27

## Scope

This review covers static visual-design workflows only. Video, audio, animated timelines, GIF authoring and 3D remain outside DDone Design scope.

The goal is not to reproduce another product's visual identity. The goal is to identify interaction patterns that reduce friction in professional static design, agency review and multi-format campaign production.

## Products reviewed

### Canva

Official Canva product and help material was reviewed for:

- the persistent left tool rail and content drawer;
- contextual controls that appear for the selected element;
- page scrolling, thumbnails and grid views;
- Magic Resize / Magic Switch and copy-and-resize workflows;
- Brand Templates, locked elements and editable regions;
- Bulk Create;
- comments, replies, mentions, resolution and approval;
- brand controls and organization-level approvals;
- keyboard shortcuts and fast canvas navigation.

Key lesson: the main canvas should remain visually dominant while tools progressively disclose themselves according to the user's current task or selection.

### Adobe Express

Official Adobe Express help material was reviewed for:

- contextual comment pins that move with the attached design object;
- filtering comments by reviewer, date, status and unread state;
- comment-only sharing permissions;
- review and approval decisions;
- spreadsheet-connected Bulk Create with preview and mapping;
- quick replace and contextual editing actions.

Key lesson: review comments should be spatial, filterable and usable without granting editing permissions.

### Figma

Official Figma documentation was reviewed for:

- comments pinned to points or regions on the canvas;
- component properties consolidated in the right sidebar;
- named versions, descriptions, restore, duplicate and share-version actions;
- comments persisting independently from version restore;
- contextual properties rather than deep layer hunting.

Key lesson: persistent structure belongs in sidebars, while the canvas should expose only the controls needed for the active selection.

### VistaCreate

Official VistaCreate help material was reviewed for:

- selecting multiple target sizes in one resize operation;
- Copy & Resize as a non-destructive default;
- recently used formats surfaced first;
- manual adjustment after automated resize;
- brand kits, version history and team restrictions.

Key lesson: multi-format work should be planned as one campaign operation, not repeated as separate single-format commands.

## Product decisions adopted

### Canvas-first editing

- The central canvas remains the primary workspace.
- Selection-specific actions stay in the contextual toolbar and context menu.
- Persistent structures such as layers, data fields, review and audit remain in the right panel.
- The left side remains dedicated to content insertion and creative tools.

### Non-destructive campaign creation

- The user can still resize the current page explicitly.
- Campaign creation uses independent copies by default.
- Multiple formats can be selected and generated in one operation.
- A safety version is created before batch generation.
- Recent formats are surfaced for repeated agency workflows.

### Spatial review

- Open comments render as numbered canvas pins.
- Object-linked pins follow the Fabric object.
- Page comments retain normalized coordinates.
- Clicking a pin opens and focuses the corresponding thread.
- Viewer/read-only users can access review without receiving editing tools.
- Comments can be filtered by state, page, selected object and search query.

### Governed delivery

- Export is preceded by a preflight rather than silently ignoring unresolved quality and review state.
- Clean, approved documents export without additional friction.
- Blocking conditions and advisory conditions are visually separated.
- Viewer sessions cannot bypass blocking errors.
- Editor overrides require an explicit action and remain distinguishable from the normal export path.
- The dialog routes directly to Design Audit or Review instead of leaving the user to search for the problem.

### Multipage overview

- The compact horizontal page strip remains available for short documents.
- Large documents gain a separate full-screen grid rather than expanding the editor chrome indefinitely.
- Page search uses both title and visible page number.
- Full-document ordering is allowed only when no filtered pages are hidden.
- Reordering validates the complete page set server-side before persisting.
- A stale client receives a conflict instead of silently dropping or overwriting pages.

### Progressive disclosure

- Viewer sessions see review controls only.
- Editors receive properties, layers, resize, audit, review and data tools.
- Complex workflows are grouped by task instead of exposing every setting simultaneously.

## Patterns intentionally not copied

- No copied branding, wording, icon arrangement or proprietary visual assets.
- No hidden paywall behavior or artificial feature restrictions.
- No AI resize claim: current layout adaptation is geometric and documented as such.
- No simulated mention notifications until an actual delivery mechanism exists.
- No claim that independent campaign copies are live-linked variants.
- No claim that an override is equivalent to approval; it remains an explicit exception.

## Remaining high-priority UX gaps

1. Drag-to-position comment pins and rectangular comment regions.
2. In-app and email delivery for mentions, assignments and approval requests.
3. Native XLSX import with column mapping and record preview.
4. Batch export for generated pages and campaign variants.
5. Persistent governance log for export overrides and approval decisions.
6. Keyboard and touch page reordering plus persistent thumbnail caching.
7. Integrated asset picker for semantic image and logo fields.
8. One-click document-wide brand migration and logo replacement.
9. Playwright journeys, screenshot regression and export golden files.
10. Production-grade remote cursors, reconnect indicators and conflict communication.
11. Command palette and searchable keyboard-shortcut reference.
12. Plugin/extension contracts after the editor workflows stabilize.

## UX acceptance principles

A workflow is not considered complete unless:

- its primary action is discoverable without documentation;
- destructive and non-destructive actions are visibly distinct;
- loading, empty, success, disabled and error states are explicit;
- Viewer, Editor and Admin behavior is understandable from the interface;
- the user can recover through undo, saved versions or non-destructive copies;
- automation produces inspectable output rather than silently changing the source;
- filtered views never imply that hidden data was deleted or reordered;
- governance exceptions require an explicit action;
- the main failure mode is covered by automated validation.
