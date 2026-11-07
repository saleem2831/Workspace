# v6.2 change specification (FDD / TDD / UI addendum)

## Functional additions

- Platform Owner may request infrastructure relocation for the entire application MongoDB database or a private S3 bucket.
- A second, different MFA-enabled Platform Owner must review and approve before the offline migration CLI accepts the change.
- Migration status is recorded as Planned → Approved → Verified (or Cancelled). Credentials are never stored in the migration model nor submitted through web forms.
- Database destination must be empty; current production database remains unchanged until explicit manual cutover.
- Storage supports AWS S3 bucket changes and S3-compatible provider endpoints. Original keys stay unchanged to preserve document references.
- New tenants may default to English or Arabic; users may switch language from login/topbar.
- Existing tenants, companies, module entitlements and users remain unchanged. No data reseeding.

## Technical changes

- `PlatformOperator.level` now supports `owner` in addition to existing levels.
- New `PlatformMigration` control-plane model and `/api/platform/migrations` GET/POST, `/:id/approve` and `/:id/cancel` endpoints (authenticated+CSRF).
- New offline Node CLIs: `src/saas/migrate-database.ts` and `src/saas/migrate-storage.ts`.
- Active storage adapter supports endpoint URL and path-style for S3-compatible providers.
- `Tenant.defaultLocale` and localized React context under `frontend/src/i18n.tsx`.
- Development-only demo role bootstrapping with random passwords, no included static credentials.

## UX flows

1. Platform Owner visits Platform Console → Infrastructure migrations, creates a plan with source/target display labels and reason.
2. Another Platform Owner approves the plan. The first owner cannot self-approve.
3. Authorized administrator runs offline verification with approved Plan ID and short-lived credentials.
4. Upon successful verified copy, operations updates Render connection settings in a reviewed deployment; old resources remain retained until rollback window ends.
5. Arabic selection sets `dir=rtl`, translates available labels and supports the tenant's preferred locale.

## Acceptance criteria

- An unprivileged user and ordinary Platform Operator receive HTTP 403 for migration management.
- The migration API never accepts MongoDB connection strings, AWS access keys or passwords.
- A plan creator cannot approve the same plan.
- Missing confirmation phrase, occupied DB destination, or changed/missing objects prevent an apply or successful verification.
- Existing record IDs, password hashes and MFA secrets are retained during an approved DB move; actual signing keys must be kept stable separately.
- Arabic navigation is RTL, and all modules still enforce company and tenant access regardless of locale.

**Known limitation:** this addendum does not claim that a prior v6.1 FDD/TDD is wholly reissued or that every UI string is translated. Production gates are tracked in RELEASE_STATUS.md.
