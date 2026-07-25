# Elements library

## Categories

```text
Shapes
Icons
Ornaments
Frames
Food
Cocktails
Backgrounds
Social logos
```

## Built-in elements

The first curated set is defined in `src/server/elements.ts`. Built-in elements contain:

- stable ID;
- display name;
- category;
- search tags;
- provider;
- license metadata;
- inline SVG or protected SVG endpoint.

SVGs use `currentColor` where possible, allowing the editor to replace the color before insertion.

## Iconify

Iconify searches are proxied through the server. Only prefixes included in `ICONIFY_COLLECTIONS` are accepted. The default list is:

```text
tabler
ph
heroicons
bi
material-symbols
```

The result keeps the source collection information. Before adding another collection, verify its license and attribution requirements.

## Private curated assets

Large image and SVG libraries should be uploaded to object storage rather than committed to Git. Asset database records support:

- organization and optional client;
- category and tags;
- MIME type and size;
- storage key;
- license;
- author and source URL;
- attribution requirement.

## Trademark note

A permissive copyright license does not grant permission to misuse a trademark. Social and service logos should be used to identify the corresponding service and should not imply endorsement.
