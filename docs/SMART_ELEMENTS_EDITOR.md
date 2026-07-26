# Intelligent Elements and precision editing

This branch turns structural assets into editable editor components instead of flat drawings.

## Intelligent tables

Tables retain row, column, cell, header, color, border and typography data. Open **Tools → Intelligent Element** or use **Edit structure** in the contextual toolbar to change the structure after insertion.

## Intelligent grids and frames

Grid and frame slots accept PNG, JPG and WebP files. Images are cropped to cover the slot while the original component structure remains editable.

## SVG palettes

Imported SVG groups expose their detected fill/stroke palette. Each color can be replaced independently from the contextual toolbar. Monochrome SVGs retain the quick global-color controls.

## Precision controls

The contextual toolbar exposes X, Y, rendered width, rendered height, rotation and opacity. Objects can be aligned to every canvas edge or center. Arrow keys move by one pixel; Shift plus an arrow moves by ten pixels.

## Layer management

The Layers tab supports selection, renaming, visibility, locking and ordering. Ctrl/Cmd+G groups selected objects and Ctrl/Cmd+Shift+G separates a group.

## Image effects

Image Blend and Dissolve store effect configuration and source object references. Their source images can remain hidden rather than being destroyed, so they can be recovered from the Layers panel.

## User preferences

Element favorites and recent items are synchronized per user and organization. Local storage remains a temporary offline fallback.
