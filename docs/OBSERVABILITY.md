# Operational checks

Minimum deployment checks:

- `/health` responds successfully;
- PostgreSQL connections remain below the configured pool limit;
- object storage bucket is reachable;
- WebSocket upgrades succeed through the reverse proxy;
- application restarts do not recreate the bootstrap user;
- volumes remain attached after redeployment.

Application logs report migration application, bootstrap creation, startup failures, storage errors and collaboration persistence failures. Production deployments should forward container logs to the operator's monitoring system.
