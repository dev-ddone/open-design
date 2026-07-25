# Upstream notes

This repository remains a fork of `clawnify/open-design`. The DDone platform branch changes the runtime and data model substantially while retaining the Preact/Fabric.js editor foundations.

When reviewing future upstream changes, separate editor-only improvements from D1-specific backend changes. Editor fixes can often be ported directly; backend changes must be adapted to PostgreSQL, organization scoping and authenticated storage.
