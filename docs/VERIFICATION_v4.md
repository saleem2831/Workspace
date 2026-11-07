# Verification report — v4

## Checks completed in the build environment

- TypeScript/TSX source parsed (including new API routes and frontend pages).
- Relative internal import paths were inspected for missing targets.
- `frontend/src/styles/app.css` parsed successfully with PostCSS.
- Backend/frontend `package.json` parsed as JSON.
- Documentation, configuration templates, and source ZIP were inspected.

## NOT verified in this environment

- Successful `npm install` using the Windows host; external registry access unavailable here.
- Full dependency-aware TypeScript typecheck and Vite production bundle.
- Live MongoDB replica-set transactions, seed/migration, and API smoke tests.
- Cross-company authorization through live HTTP test accounts.
- Browser automation, files upload/download and user acceptance tests.
- Performance/load testing against the actual hosted database.

**Release status: Development build requiring local integration testing.**

Before production, run `npm run typecheck`, `npm test`, `npm run build`, and `npm run smoke` with a disposable database, then follow `docs/UPGRADE_v4.md` and `docs/WINDOWS_TESTING.md` for business walkthroughs. Back up all existing data before migrations.
