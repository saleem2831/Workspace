# v5.4 Verification — Company assignments

## Completed in this environment

- Exactly one standalone `frontend/` and one `backend/` application: structural script passed.
- 41 TypeScript and TSX source files parsed without syntax errors.
- Local relative imports resolved.
- Frontend CSS parsed using PostCSS.
- Compiled `backend/src/lib/access.ts` with TypeScript 5.8 and ran 9 access-policy assertions, including Manager company selection, unassigned company fallback and Owner/Manager privilege checks.
- Existing schema already supports multiple per-user company memberships; no database migration added.
- ZIP contents and integrity checked after packaging.

## Not completed in this environment

- A full backend or frontend dependency install: npm registry did not complete before timeout.
- `npm run build`, full typecheck and backend test suite with installed local dependencies.
- Multi-company assignment transaction tests with a running MongoDB replica set / Atlas.
- Real browser flows for Owner grants, switching companies, Manager data isolation and member reassignment.

## Recommended staging test sequence

1. Back up the MongoDB database; preserve existing `.env`, including MFA encryption and JWT secrets.
2. Install backend/frontend dependencies and run both apps.
3. Log in as a three-company Owner; assign a Manager to two companies in a single action.
4. Log in as that Manager; verify only assigned companies are available in the company selector.
5. Load Finance, Projects, Reports and linked dropdowns under company A, switch to company B, verify no A records appear.
6. Attempt a direct API request with an unassigned `x-company-id`, verify HTTP 403.
7. Attempt `x-company-id: all` as Manager; verify response never aggregates beyond the server-selected single company.
8. Try to grant Owner or Manager access while logged in as a Manager; verify HTTP 403.
9. Confirm that an Owner can change a Manager's membership in one company without affecting other companies.
10. Test removal with active assignments and the required handoff.

**Release classification:** development/staging candidate. Production readiness requires all application build, integration and authorization tests to pass in a real environment.
