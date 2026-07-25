# Realtime collaboration

Each design uses one authenticated Yjs room:

```text
design:<design-id>
```

The browser connects through:

```text
/api/collaboration/<design-id>
```

Before upgrading the WebSocket, the server verifies the signed session cookie and confirms that the user belongs to the organization that owns the design.

## Document structure

The shared Yjs document contains a map named:

```text
page-canvas-json
```

Each key is a page UUID and each value is the serialized Fabric.js canvas JSON for that page.

Local Fabric events are debounced before updating Yjs:

- object added;
- object modified;
- object removed;
- text changed.

Remote changes are applied with suppression guards so that loading remote JSON does not create an update loop.

## Persistence

Yjs state is encoded as an update and persisted in the PostgreSQL `collaboration_documents` table. Writes are debounced and the final state is written when the room is released.

## Presence

Awareness state includes:

- user ID;
- display name;
- deterministic display color.

The editor toolbar shows connection state and connected participants.

## Viewer role

Viewers may join a collaboration room and receive updates. Their canvases are configured as non-selectable and the browser does not publish local Fabric modifications. The server also denies all design and page write endpoints for the viewer role.
