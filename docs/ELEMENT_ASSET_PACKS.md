# Element asset packs

DDone Design exposes only media that the current Fabric canvas can edit and persist correctly.

## Supported media

- SVG vectors
- PNG raster images with verified or generated alpha transparency
- JPG raster images with an opaque background
- WebP images from private uploads

Animations, GIF, video, audio and 3D models are deliberately not exposed by the Elements browser. They require a timeline, playback/export pipelines and media-specific persistence that are outside the current static canvas model.

## Bundled packs

The following packs are installed inside the application image and do not depend on an external API at runtime.

### DDone Structures

Original MIT-licensed assets designed for the editor:

- tables and restaurant price lists
- charts
- photo grids
- modules and cards
- frames
- device and print mockups
- shapes, ornaments, backgrounds and patterns

Every structure is an SVG that uses `currentColor`, so the contextual toolbar can recolor it. The same vector can be rendered server-side as a real transparent PNG.

### Tabler Icons

The application bundles the `@iconify-json/tabler` package. Tabler assets are distributed under the MIT license. They are available as editable SVG vectors and as server-rendered transparent PNG files.

Source: <https://github.com/tabler/tabler-icons>

### Twemoji

The application bundles the `@iconify-json/twemoji` package. Twemoji graphics are distributed under CC BY 4.0. Attribution metadata is retained on inserted objects. They are available as SVG and real transparent PNG files.

Source: <https://github.com/jdecked/twemoji>

## Online providers

Optional online searches complement the local packs:

- Iconify for additional open-source SVG collections
- Openverse for openly licensed images and illustrations
- Wikimedia Commons for SVG, PNG and JPG files with MIME and license metadata
- Pexels for JPG photos when `PEXELS_API_KEY` is configured
- Pixabay for JPG photos and illustrations when `PIXABAY_API_KEY` is configured

One provider failing does not take the local catalog offline.

## Format guarantees

### SVG

An item labelled SVG is returned with `Content-Type: image/svg+xml`, passes the restrictive SVG validator and is inserted as Fabric vector objects. Monochrome SVG packs use `currentColor` and can be recolored.

### Transparent PNG

An item labelled `PNG · trasparente verificato` is either:

- generated from a bundled SVG with an explicit transparent background; or
- a private PNG whose IHDR color type or `tRNS` chunk proves alpha transparency.

The catalog never labels every `.png` file as transparent merely because of its extension.

### JPG

JPG results are opaque raster images and are shown only in the `JPG con sfondo` filter.

## Category isolation

Structural categories are independent catalogs. Selecting Tables returns table layouts only; it does not append the generic icon library. The same isolation applies to Charts, Modules, Grids, Mockups and Shapes.
