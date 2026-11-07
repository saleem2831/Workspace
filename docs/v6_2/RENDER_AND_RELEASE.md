# Render deployment and staging acceptance (v6.2)

## Recommended production topology

Single same-origin paid Render Node Web Service builds React and starts Express; MongoDB Atlas separate; private AWS S3 or S3-compatible bucket separate. This retains one frontend codebase and one backend, avoiding cross-site CSRF/session cookie complications. Infrastructure migrations run from a secured admin runner, not on each web deployment.

### GitHub and Render setup

1. Commit the project to a PRIVATE Git repository excluding all `.env`, credentials, `node_modules`, files and migration reports.
2. Create/configure Atlas database, database user, indexes, backups, networking and an isolated staging clone. **Do not run demonstration seeding in production.**
3. Create a private storage bucket with Block Public Access, server-side encryption, access logging, least-privilege IAM and suitable lifecycle/retention policies.
4. In Render Dashboard, **New → Blueprint** (use provided `render.yaml`), or create a Node Web Service from the repository root.
5. Build command: `bash scripts/render-build.sh`.
6. Start command: `cd backend && node dist/server.js`.
7. Health check: `/api/ready`; frontend served by Express with `SERVE_FRONTEND=true`.
8. Runtime Node 24 LTS, paid instance; externalize all uploads to private S3 (no ephemeral local disk for customer files).

### Required Render environment variables

```
NODE_ENV=production
NODE_VERSION=24
MONGODB_URI=<your VERIFIED production DB URI>
JWT_SECRET=<original 32+ secret, secret manager>
MFA_ENCRYPTION_KEY=<original 64 hex value, secret manager>
WEB_ORIGIN=https://<your-final-render-domain>
COOKIE_SECURE=true
TRUST_PROXY=true
SERVE_FRONTEND=true
STORAGE_BACKEND=s3
AWS_REGION=ap-south-1
S3_BUCKET=<private-bucket-name>
# AWS credentials via IAM role where available, otherwise Render secrets.
# For compatible non-AWS provider: S3_ENDPOINT_URL and S3_FORCE_PATH_STYLE.
```

Never set `DB_MIGRATION_TARGET_URI`, `STORAGE_MIGRATION_*` credentials or `DEMO_BOOTSTRAP_CONFIRM` in the always-running web service unless the operational policy absolutely requires it. Migration secrets should live only on a short-lived protected runner.

### Existing Bitstek data to a new Render environment

1. Upgrade the staging clone to the intended v6.2 logical schema (use v5.7 adoption only if moving from pre-SaaS).
2. If moving MongoDB database: use approved offline copy; verify all collections and hashes; cut over `MONGODB_URI` **after** signoff.
3. If moving object storage: use approved offline S3 copy and checksum verification; change `S3_BUCKET`/provider endpoint **after** signoff.
4. Preserve original JWT/MFA keys, and verify existing identities with MFA and company-scoped access.
5. Keep the old database and object bucket read-only until the rollback window expires and backup restoration is tested.

## Staging test checklist (must pass before paid customers)

- Login/Logout/MFA, invalid sessions, CSRF and CORS on the final HTTPS origin.
- Tenant A cannot read/write/export Tenant B's projects, invoices, S3 documents, or membership data even if it guesses IDs.
- Workspace Super Admin versus company Owner versus Team permissions.
- Company module toggles respect tenant/company boundaries.
- Platform Operator cannot access Platform Owner migration planner; Platform Owner cannot approve own plan.
- Migration CLI refuses occupied DB target, same DB URI, missing approval, unpaused writes, invalid confirmation.
- Destination MongoDB counts, indexes and SHA-256 digests equal the source; retry and rollback tested.
- S3 migration verifies every current object; uploads/downloads work after cutover, cross-tenant file access denied.
- Trial/subscription handling and payment webhooks are separate unfinished gates—do not enable paid public self-signup yet.
- English/Arabic login and navigation; remaining Arabic translations and RTL PDF rendering need QA.
- Monitoring/alerts, scheduled restore drills, queued exports, retention schedules, malware scanning, incident response and tenant isolation pen-test completed.

**Release classification:** Developer Preview. The package has source-level checks but is not a demonstrated production deployment. Maintain a launch checklist and require approval after security and recovery validation.
