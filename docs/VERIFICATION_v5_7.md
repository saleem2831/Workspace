# Bitstek Workspace v5.7 — Verification record

## Checks completed in artifact environment

- **52 TypeScript/TSX files** parsed using the TypeScript parser without syntax errors; all relative imports resolved.
- **8 executable Node tests** passed for company vertical defaults, Advisory enabling Projects/Products, explicit disabling, role intersection and TAR.GZ archive readability including a binary document.
- **15 source-level regression checks** passed for company authorization enforcement, sidebar and Home filtering, backend route guards, module editor, archive, migration and frontend target company handling.
- **3 security environment script tests** passed: creates missing local secrets, protects existing config, refuses invalid MFA key rotation.
- CSS stylesheet parsed successfully with no top-level parsing errors.
- `scripts/check-structure.mjs` confirmed exactly two independently installable applications.

## Not verified here

- `npm install`, TypeScript typecheck or full Vite/backend builds; npm registry DNS was inaccessible (`EAI_AGAIN`).
- Live MongoDB migrations, export against a real database or transaction behavior, and live browser end-to-end tests.
- Existing historical cross-company references, actual document filesystem availability, or Render staging production behavior.

## Important notes

- The previous v5.6-specific check script expects the old Companies editor and is obsolete for v5.7; use `node scripts/check-v57.mjs` instead.
- Only operations records are supported for automated company-to-company migration. Data in other modules is not moved by this release.
- Export is a secure TAR.GZ backup and does not yet have an automatic restore/import tool. Native MongoDB backups are still required before data migrations.
- Controlled deletion is intentionally unavailable when business or financial records remain.

## Minimum local acceptance before Render

```powershell
cd backend
npm install
npm run migrate:v5.7:dry
npm run migrate:v5.7
npm run audit:v5.7:links
npm run verify
npm run dev

# Separate terminal
cd frontend
npm install
npm run verify
npm run dev
```

Use a backed-up **staging** database for company CRUD, archive export, module switch, restricted Team account, and operations migration. Confirm that disabled modules cannot be accessed via direct requests, not just hidden in the sidebar.
