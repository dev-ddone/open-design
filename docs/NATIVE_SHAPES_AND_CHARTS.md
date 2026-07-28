# Native shapes, strokes and smart charts

## Native vector objects

DDone Design now distinguishes basic design primitives from media assets. Shapes are generated as Fabric vector objects and keep a structured `ddoneNativeShapeData` payload in the document JSON.

Available shapes:

- rectangle and rounded rectangle;
- circle and ellipse;
- line and arrow, with independent start/end arrowheads;
- triangle, polygon and star;
- ring, arc and progress ring;
- callout and bracket.

The Shapes sidebar inserts objects using the collision-aware placement engine. Selecting a native shape automatically opens the dedicated inspector.

## Fill editor

Native shapes support:

- solid fill;
- transparent fill;
- linear gradient;
- radial gradient;
- editable gradient nodes with color, position and opacity;
- linear angle;
- radial center and radius;
- overall fill opacity.

Linear gradients expose origin and destination handles on the canvas. Radial gradients expose center and radius handles.

## Stroke editor

All native shapes support:

- color, width and opacity;
- solid, dashed, dotted, long-dash and dash-dot presets;
- custom dash sequences;
- flat, round and square caps;
- miter, round and bevel joins;
- uniform stroke while scaling;
- optional arrowheads for line objects.

## Direct canvas controls

Shape-specific controls are attached only when relevant:

- rounded rectangle/callout corner radius;
- arc start and end;
- progress-ring start and completion endpoint;
- star inner radius;
- linear-gradient endpoints;
- radial-gradient center and radius.

Control movement stores a pending semantic update and rebuilds the vector object on pointer release. This avoids persistent helper objects, keeps exports clean and preserves the stable object ID, transform and template permissions.

## Smart charts

Available renderers:

- bar;
- grouped bar;
- stacked bar;
- line;
- area;
- donut;
- pie;
- radar;
- progress ring.

Charts support up to eight named series with independent colors. The editor includes:

- category labels;
- per-series values;
- Excel/CSV table paste;
- legend, data labels and grid toggles;
- numeric, percentage and currency formatting;
- configurable dimensions and maximum value.

Existing charts that only contain the old `labels`, `values` and `colors` fields are read as a single series, so old documents remain compatible.

## Persistence and collaboration

Native shape metadata is included in the standard canvas serialization allowlist. Shape and chart rebuild operations preserve:

- `ddoneId`;
- position, rotation, scale and flips;
- shadows;
- template lock/edit flags;
- layer position.

The rebuilt object emits the standard `object:modified` event, so undo, saving, versions and realtime collaboration use the existing editor pipeline.
