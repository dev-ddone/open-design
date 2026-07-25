# Security policy

## Supported version

Security fixes target the latest `main` branch and active release tags.

## Reporting

Do not publish credentials, personal data or a reproducible exploit in a public issue. Contact the repository owners privately with:

- affected version or commit;
- deployment environment;
- reproduction steps;
- expected and actual behavior;
- impact assessment.

## Deployment baseline

Production operators must:

- use HTTPS;
- configure a unique `JWT_SECRET` of at least 32 random characters;
- use independent PostgreSQL and MinIO passwords;
- keep PostgreSQL and MinIO private;
- disable public registration when not required;
- back up PostgreSQL and object storage together;
- update dependencies and container images regularly.

## Authorization model

All protected API endpoints require an authenticated session. Organization membership is checked server-side using the selected organization header, and write endpoints enforce the minimum role. Client-side hidden or disabled controls are usability features and are not treated as authorization boundaries.

## Uploaded files

The application accepts only configured image MIME types, limits uploads to 25 MB and stores objects under generated keys. SVG remains active content and should be sanitized further before allowing uploads from untrusted external users in an Internet-facing deployment.
