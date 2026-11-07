# Full local testing checklist — Bitstek Workspace v3

## A. Pre-flight

1. Install a supported Node.js LTS version, npm, and access to MongoDB Atlas or a local MongoDB replica set.
2. Extract to a short, clean folder such as `C:\dev\bitstek-workspace`.
3. `node scripts/setup-local.mjs` from the folder that contains `frontend` and `backend`.
4. Check `backend/.env` for the correct MongoDB URI. Keep `frontend/.env` limited to public Vite config.
5. `node scripts/check-structure.mjs` should report PASS.

## B. Independent installation

**Backend terminal:** `cd backend; npm install; npm run verify`

**Frontend terminal:** `cd frontend; npm install; npm run verify`

If you see `TAR_ENTRY_ERROR`, `ENOENT`, `EPERM`, or `esbuild EBUSY`, treat it as an incomplete dependency install: close running tools and reinstall in a clean folder. Do not run installs simultaneously in the same application folder.

## C. Run applications

**Backend:** `cd backend; npm run seed` once for a fresh demo database; then `npm run dev`. Skip seeding if your database is already seeded.

**Frontend:** `cd frontend; npm run dev`.

Check these URLs:

- http://localhost:5000/api/health — `{ok:true}`
- http://localhost:5000/api/ready — `{ok:true,database:'connected'}`
- http://localhost:5173/api/health — same backend response through the frontend proxy
- http://localhost:5173 — login screen

## D. Manual UI regression checklist

- [ ] Owner login, logout, invalid password error, session expiry
- [ ] Company selector: `all` for viewing and a specific company for editing
- [ ] Today dashboard loads KPIs, reminders, summaries
- [ ] Work Board: create task, move status, comment, archive
- [ ] Calendar: create event, view by company
- [ ] Learning: courses, batches, students, fee installments
- [ ] Advisory: trading accounts, performance statements (no trade execution)
- [ ] Sales: clients, leads, proposals, mark won and convert to project
- [ ] Products: products, subscription renewals
- [ ] Projects: create project, milestone, edit status
- [ ] Finance: invoice, expense, transfer, post, payment collection
- [ ] Approvals: maker-checker separation, approve and reject
- [ ] Reports: counts, finance totals, company scopes and currencies
- [ ] Settings: companies, users, memberships, audit logs
- [ ] Authorization: reviewer cannot approve own request; unauthorized company denied

## E. Automated smoke suite — disposable database ONLY

From the ROOT, after backend has started and seed has succeeded:

```powershell
$env:SMOKE_ALLOW_WRITES='true'
node scripts/smoke.mjs
Remove-Item Env:SMOKE_ALLOW_WRITES
```

This is an API integration test and intentionally WRITES data. It does not replace full browser tests. Do not run it on production data.

## F. Production readiness gates

- [ ] Browser E2E tests, security review, MFA, backups and restore drill
- [ ] Accounting reconciliation and financial control sign-off
- [ ] HTTPS, restricted CORS, secure cookie configuration
- [ ] Monitoring and error tracking, immutable audit retention policy
- [ ] Company authorization / privacy negative tests
- [ ] MongoDB replica set and recovery testing
