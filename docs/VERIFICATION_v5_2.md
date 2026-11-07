# v5.2 Verification Record

## Checks performed in this environment

- Source syntax parsing: 39 TS/TSX files, no parser diagnostics.
- Local relative imports: 97 checked, none missing.
- CSS parsing: no stylesheet syntax errors.
- Project structure: `node scripts/check-structure.mjs` passed; exactly one `frontend/` and one `backend/`.
- Security environment repair: 3 Node.js tests passed (`node --test scripts/tests/security-repair.test.mjs`).
- Render Blueprint: `render.yaml` successfully parsed with Python PyYAML.
- JavaScript setup files: `node --check` passed.

## Important checks NOT performed here

- `npm install` for frontend/backend: npm registry DNS unavailable in this environment.
- `npm run typecheck`, `npm run build` and Vite/Express startup with fully installed dependencies.
- Live MongoDB transactions and browser tests for approval reassignment, user handoff, USDT void, QR enrollment, company isolation and upload retention.
- Actual deployment to Render and Atlas connectivity.

## Required pre-production test matrix

1. Login and logout, CSRF protections, session expiration and MFA setup/enable/login/recovery.
2. Capital movement created by Admin and assigned to Admin: no self-approval; Owner can reassign, reviewer can approve/reject; status changes once only.
3. Cross-company authorization: a member of Learning cannot view, reassign, approve, or access Advisory records.
4. Reassignment when deleting a user: preview active ownership, require replacement with appropriate module permissions, transfer memberships and reject last Owner deletion; retain audit history.
5. USDT FIFO: buy, sell, partial sell, oversell rejection, sale void, buy void only after linked sale void, correct inventory and realized P&L.
6. File uploads: private access controls and persistence across a Render restart with mounted disk.
7. Performance: company switching reuses React Query cache and updates after writes; no stale sensitive content after logout.
8. Render staging: built assets served correctly, `/api/ready` reports MongoDB, cookies and CSRF work over HTTPS.

**Release classification: source-patched development candidate. Not a live-tested production release.**
