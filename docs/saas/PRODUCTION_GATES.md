# v6.1 Production Readiness Gate — NOT YET APPROVED

## Implemented in source (requires live test)
- Cookie JWT with verified tenant membership and scoped company access.
- Tenant-owned Mongoose schema wrapper with fail-closed query filters.
- MFA-gated Platform Operator versus tenant Super Admin.
- Bitstek legacy data adoption CLI (dry-run/apply), preserves IDs.
- Private S3 storage adapter and copy migration.
- Limited tenant/company ZIP export with sanitized identity directory and S3 file contents.
- CSV preview/commit for four business entities.
- Platform onboarding invitation and SaaS Center UI.
- Deterministic daily briefing, with no external LLM transmission.

## Blockers before commercial production
- [ ] Dependencies install and both TypeScript production builds pass.
- [ ] MongoDB replica-set integration and tenant migration verified on a full staging clone.
- [ ] Cross-tenant penetration and horizontal/vertical authorization tests pass for every route, file, query, aggregate and export.
- [ ] Mongoose hooks reviewed for aggregation, populate, model aliases, plugins, native collection use, bulkWrite and cache keys.
- [ ] Tested database unique indexes and forward/backward migration runbooks.
- [ ] S3 IAM least privilege, Block Public Access, malware scanning, object retention/versioning and file integrity checks.
- [ ] Object storage upload quota is made race-safe with atomic reservations.
- [ ] Async resumable import/export workers with consistent snapshot and independently verified restore.
- [ ] Payment gateway, signed and replay-safe webhooks, billing retries and entitlement enforcement.
- [ ] Tenant invitation email verification/delivery, MFA recovery and complete tenant account lifecycle.
- [ ] Platform operator audit, customer consent-based support grants and revocation.
- [ ] External AI contract, tenant opt-in, permission-scoped retrieval, redaction, cost metering, prompt injection tests.
- [ ] GDPR/India DPDPA/jurisdiction-specific legal/data-processing review as applicable.
- [ ] Load test, observability, incident drill, backups and recovery time objectives accepted.
- [ ] Full browser regression (Learning, Advisory, Sales, Products, Projects, Finance, Approvals, Reports, Settings) signed off.

**Status:** Developer Preview / Staging Candidate. Do not deploy for paying customers until these gates are satisfied.
