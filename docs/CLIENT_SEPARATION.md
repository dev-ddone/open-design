# Client separation

Clients are records inside an organization. Designs, templates, brand kits and assets can reference a client while remaining protected by organization membership.

The workspace bar stores the selected client locally and filters the gallery to that client. New designs and template-based designs inherit the selected client ID.

Selecting **All clients** shows every design in the active organization.

Client separation is an organizational feature, not a separate authentication tenant. Members currently receive organization-level access according to their role. Per-client member restrictions are a future extension and should introduce an explicit `client_members` table rather than relying on frontend filtering.
