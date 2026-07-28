# Release test plan

## Automated

- dependency installation;
- TypeScript typecheck;
- frontend production build;
- production Docker image build.

## Deployment smoke test

1. Start the Docker Compose stack on empty volumes.
2. Confirm migrations and bootstrap owner creation.
3. Verify `/health` returns `status: ok`.
4. Log in as the bootstrap owner.
5. Create a client and a design.
6. Upload PNG, JPEG and SVG files.
7. Insert a built-in ornament and an Iconify icon.
8. Open the same design in two editor accounts and verify realtime changes.
9. Add a viewer and verify that editing endpoints return 403.
10. Restart the stack and confirm designs, assets and collaboration state persist.
11. Create PostgreSQL and MinIO backups.
