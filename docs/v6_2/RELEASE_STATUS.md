# v6.2 Implementation scope and verification

| Capability | Included in source | Remaining qualification |
|---|---|---|
| Two-app React/Express MERN architecture | Yes; retained | Full npm build and E2E |
| Existing Bitstek tenant/company data preserved | Existing v6.1 models retained; no destructive migration | Test against backed-up real Bitstek data |
| Platform Owner role | Yes, separate platform model level=owner, MFA prerequisite | Review all role boundaries in staging |
| Two-person migration approval | Yes, API plan/approval model and UI | Verify concurrency and audit on MongoDB |
| MongoDB DB-to-DB copy | Offline CLI with empty-target guard, collection/index copy and SHA-256 comparison | Atlas driver integration, special collection/index types, backup restore, downtime dry-run, multi-TB scale |
| S3-to-S3 / S3-compatible copy | Offline CLI with per-object checksums and manifest | Large buckets, object versioning/locks, metadata fidelity, provider-specific compatibility |
| AWS/R2/MinIO live storage adapter | Added endpoint and path-style settings | Validate provider security and upload/download |
| Arabic language + RTL | Login/nav/shared UI/platform console + preference scaffold | All module labels, exports, generated PDFs/emails, localization QA |
| Production user credentials | Secure bootstrap flows, no static secrets | Actual account creation, password policies, MFA for all privileged users |
| Existing SaaS onboarding and CSV import | Retained from v6.1 | Payment webhooks, email invitations, large import pipeline |
| Generative AI | Not added; existing permission-filtered rules-based summary retained | LLM privacy controls, model choice, metering, guardrails |

## Source-level verification instructions

```powershell
cd backend
npm install
npm run typecheck
npm run test
npm run migrate:database:dry   # ONLY with both DB URIs set; does not write
npm run migrate:storage-provider:dry # ONLY with both bucket configs set; does not write
cd ../frontend
npm install
npm run typecheck
npm run build
```

Do not execute `--apply` until backups exist, the source is in maintenance mode, target is verified, an independent Platform Owner has approved and restore/rollback plans are signed off.

## Why this is not yet production-certified

The authoring environment did not provide a running MongoDB replica set, S3 credentials, connected Render workspace or a successful npm dependency installation. Source syntax/import checks alone do not establish business or security correctness. A production launch requires live integration, isolation and recovery tests with representative data, a penetration test and release signoff.
