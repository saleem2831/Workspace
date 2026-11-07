# Tenant adoption and index migration — change-controlled checklist

1. Back up v5.7 MongoDB (all collections, indexes), all local uploads, and secure JWT/MFA secrets. Verify a restoration to staging.
2. Identify all existing active Super Admin accounts and companies, and inventory orphan references, active accounting and file links.
3. Run `npm run migrate:saas:dry` against **staging**; compare counts and audit the target `SAAS_INITIAL_TENANT_SLUG`.
4. Run `npm run migrate:saas:apply` once on staging; do not mix other tenants until indexes and isolation tests pass.
5. Query `db.companies.getIndexes()` and `db.workspacesettings.getIndexes()`. Existing v5.7 indexes `code_1` and `key_1` can enforce **global** uniqueness and must be replaced with unique compound indexes:

```javascript
// Review current index names first; execute in a maintenance window.
db.companies.createIndex({tenantId:1,code:1},{unique:true,name:'tenant_code_unique'});
db.workspacesettings.createIndex({tenantId:1,key:1},{unique:true,name:'tenant_key_unique'});
// AFTER successful checks only:
// db.companies.dropIndex('code_1');
// db.workspacesettings.dropIndex('key_1');
```

6. Verify Owner/Team company membership, all three Bitstek companies, passwords/MFA enrollment, account sessions and company-specific reports.
7. Copy legacy StoredFile objects to S3 (`migrate:storage:dry` then `migrate:storage:apply`); never delete originals until independent restore and document-download tests pass.
8. Test a synthetic second tenant with overlapping company codes; assert no cross-tenant API, database or S3 document access.
9. Freeze new writes during final database migration, run a reconciliation report, obtain Engineering/Security/Finance approval and then deploy runtime.
10. Rollback: stop all writes and restore the tested pre-upgrade database/upload snapshot, NOT by deleting `tenantId` fields in place.

## Production restrictions
The migration script does not automatically resolve orphaned references or rename old indexes. It is intentionally conservative. Never run demo `seed` against a production data set.
