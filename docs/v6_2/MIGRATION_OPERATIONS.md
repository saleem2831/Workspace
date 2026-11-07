# Platform Owner infrastructure migration runbook

## Security prerequisites

- Requires two different MFA-enabled Platform Owners. A normal Operator, customer Super Admin, Owner or Team user cannot execute the web approval workflow.
- **Create plan:** Platform Console → Infrastructure migrations → select `database` or `storage`, supply human-readable source/target labels and change reason. **Do not enter connection strings, bucket secrets or passwords in the web form.**
- **Approve plan:** A DIFFERENT Platform Owner signs in, reviews the change ticket, backup proof, target environment and maintenance window, then approves. Take the 24-character MongoDB plan ID from the platform console.
- Backups must be verified/restorable. Stop application, imports, cron, event workers, and all writes to the source before copying. Do not assume a point-in-time snapshot from the copy scripts.
- Run offline on a protected admin runner with target credentials supplied through secret-managed environment variables. No CLI accepts secrets as arguments. Keep access logs.

## A. MongoDB -> MongoDB: full app database copy

**Scope:** standard collections (including Tenant, Company, Users, Memberships, invoices, etc.), documents, BSON values, normal collection options and indexes. This does **not** migrate Atlas organization settings, database users, IAM, network policies, Atlas Search indexes, server configuration, operational backups or encryption keys. Collections containing views or unsupported namespaces cause fail-closed behavior. Use native MongoDB Database Tools for unsupported features with a reviewed runbook.

The destination database **must be empty**. The tool never drops collections or updates the current production URI automatically. It performs a per-collection streamed copy, validates index counts, record counts and deterministic document SHA-256 hashes, then records verification.

```powershell
# At backend/.env on an ADMIN runner:
# MONGODB_URI=<source app database URI>
# DB_MIGRATION_TARGET_URI=<NEW EMPTY target DB URI>
# No credentials ever go into the browser, Git, or logs.
cd backend
npm install
npm run migrate:database:dry
```

After backup/maintenance signoff and a second Platform Owner's approval:

```powershell
# backend/.env: DB_MIGRATION_CONFIRM=I_HAVE_VERIFIED_BACKUPS_AND_STOPPED_WRITES
npm run migrate:database:apply -- --plan-id=YOUR_APPROVED_PLAN_ID
npm run migrate:database:verify -- --plan-id=YOUR_APPROVED_PLAN_ID
```

**Cutover:** run smoke/restore checks on target, update `MONGODB_URI` in Render Environment, redeploy the backend, validate login/MFA, companies, records, approvals and file references, then reopen traffic. If verification fails, keep the original production URI; restore/clear the new destination through an approved backup process before retrying. Never rotate the MFA key just because the database location changes.

**Scale limits:** this implementation is an offline app-database cloner, not a no-downtime CDC/replication product. For very large or sharded datasets use an engineered MongoDB live migration strategy and verify all special indexes, views, triggers and Atlas Search separately.

## B. AWS S3 -> another S3 bucket / S3-compatible provider

**Supported:** the **current** object versions in an AWS S3 bucket or compatible S3 API (e.g., Cloudflare R2 or MinIO) with private credentials, source/destination region and optional endpoints. **Not included:** previous object versions, delete markers, legal holds, S3 object locks/retention policies, bucket IAM/policies, event notifications, lifecycle rules, replication config and provider-native metadata not exposed through the standard API. Export these separately and treat them as hard release gates when applicable. Azure Blob and native Google Cloud Storage are not direct targets; use a reviewed provider adapter or their S3 interoperability API where compatible.

`STORAGE_MIGRATION_PREFIX` defaults to empty, which scans all current objects in the source bucket. It retains each object key, streams large objects via multipart upload and verifies SHA-256 against the destination; an existing destination object is not overwritten if different. It does **not delete** source objects. Configure the destination bucket's encryption and private access policies first.

```dotenv
# Offline admin-runner environment only
MONGODB_URI=<source control database URI>
STORAGE_MIGRATION_SOURCE_BUCKET=existing-private-bucket
STORAGE_MIGRATION_SOURCE_REGION=ap-south-1
STORAGE_MIGRATION_SOURCE_ENDPOINT=
STORAGE_MIGRATION_TARGET_BUCKET=new-private-bucket
STORAGE_MIGRATION_TARGET_REGION=ap-south-1
STORAGE_MIGRATION_TARGET_ENDPOINT=          # e.g. R2/MinIO S3 API URL
STORAGE_MIGRATION_TARGET_PATH_STYLE=false  # true for some MinIO setups
# Specify source/target access keys independently or use trusted IAM roles.
# STORAGE_MIGRATION_SOURCE_ACCESS_KEY_ID=...
# STORAGE_MIGRATION_SOURCE_SECRET_ACCESS_KEY=...
# STORAGE_MIGRATION_TARGET_ACCESS_KEY_ID=...
# STORAGE_MIGRATION_TARGET_SECRET_ACCESS_KEY=...
STORAGE_MIGRATION_REPORT_PATH=storage-migration-report.json
```

```powershell
cd backend
npm run migrate:storage-provider:dry
# after approved plan and source write freeze:
# STORAGE_MIGRATION_CONFIRM=I_HAVE_VERIFIED_BACKUPS_AND_STOPPED_WRITES
npm run migrate:storage-provider:apply -- --plan-id=YOUR_APPROVED_PLAN_ID
# For a later integrity re-check, choose a new report filename first:
npm run migrate:storage-provider:verify -- --plan-id=YOUR_APPROVED_PLAN_ID
```

This creates a local checksum manifest. Keep it in encrypted internal storage; object keys may expose customer IDs and module categories.

**S3 cutover:** after verification, in Render Environment update `S3_BUCKET`, `AWS_REGION`, active IAM credentials; for S3-compatible destination also set `S3_ENDPOINT_URL` and `S3_FORCE_PATH_STYLE`. Keep `STORAGE_BACKEND=s3`. The application `StoredFile.objectKey` values stay unchanged. For providers without AWS SSE headers, set the bucket encryption policy and leave `S3_SERVER_SIDE_ENCRYPTION` unset. Test private upload/download and cross-tenant denial after redeploy. Retain old bucket until restoration, compliance and retention checks pass.

## C. What NOT to do

- Do not perform whole-database migration over a live write-active application.
- Do not copy a database into an occupied destination or run old seed scripts on real customer data.
- Do not expect migrated MongoDB data alone to include S3 file bytes, or S3 bytes alone to contain database metadata.
- Do not set a new MFA key or JWT secret unless a separate approved rotation plan requires it.
- Do not mark the service production-ready until automated and manual integrity/security tests, rollback and restore drills pass.
