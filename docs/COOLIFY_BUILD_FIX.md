# Coolify runtime image build fix

## Symptom

The frontend build succeeds, but the Coolify BuildKit deployment can stop while exporting image layers. The previous runtime stage copied the complete development `node_modules` tree and then executed a recursive `chown -R /app`, creating an unnecessarily large and expensive layer.

## Fix

- install a separate production-only dependency tree;
- keep `tsx` as a runtime dependency because the server starts from TypeScript sources;
- copy runtime files with their final owner through `COPY --chown`;
- create only the writable upload directory with the application owner;
- avoid recursive ownership changes across `node_modules`.

The application still runs as the unprivileged `app` user and keeps the existing health check and volume paths.

If export still fails after this optimization, check deployment-server capacity with `df -h`, `free -h`, and `docker system df`; an exit while exporting layers can also indicate exhausted disk or memory.
