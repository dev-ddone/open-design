# Production merge status

## Consolidated delivery

The production delivery is consolidated in PR #32 from `feat/ddone-studio-3` directly into `main`.

This single pull request contains and supersedes the previous stacked platform, advanced-suite, Elements-universe and editor pull requests. Temporary validation pull requests must be closed without merge.

## Required gate

Before merging PR #32, the pull-request workflow must pass against the actual `main` merge tree, including:

- TypeScript typecheck;
- unit and regression tests;
- Openverse and Wikimedia provider smoke tests;
- production frontend build;
- runtime API, account, ACL, Elements, review, page-order and realtime smoke tests;
- Playwright functional and visual tests;
- normalized export golden test;
- production Docker image build.

## Deployment

After the merge, Coolify must deploy `main`. Pexels and Pixabay remain optional runtime providers and appear only when their API keys are configured. Openverse, Wikimedia, Iconify, bundled packs and private uploads remain available according to the runtime provider configuration.
