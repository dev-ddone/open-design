# Migration policy

Database changes are stored as ordered SQL files in `migrations/`. Applied filenames are recorded in `schema_migrations`.

Rules:

1. Never rewrite a migration after it has reached a shared deployment.
2. Create a new migration for schema corrections and data changes.
3. Wrap destructive changes in an explicit backup and rollback plan.
4. Keep organization-scoping indexes with new tenant tables.
5. Test both an empty database and an upgrade from the previous release.
