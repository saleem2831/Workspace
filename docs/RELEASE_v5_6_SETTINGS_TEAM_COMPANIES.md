# Bitstek Workspace MERN v5.6 — Settings, Team Access and All Companies Fixes

**Release type:** Source patch over v5.5. **Architecture:** one Vite/React frontend, one Express API, MongoDB. **Database migration:** none; schema remains unchanged.

## Fixed: Settings jumps to My Profile after a save or company change

**Cause:** `App.tsx` previously used `<main key={company}>`, remounting the Settings page on company selection changes; the `refresh()` callback incremented an authentication query version, temporarily replacing the whole shell during a refresh. Both paths reset `SettingsPage`'s local tab to its default, **My profile**.

**Fix:** The Settings component remains mounted. Company-local business pages remount individually on a company switch, while authentication information refreshes using TanStack Query invalidation, preserving existing session data. The Settings Team & Access company filter is local to that tab and does not change the global company selector.

## Fixed: Team member's Today page shows “No authorized company for this module”

**Cause:** `/api/dashboard/summary` always called Operations-scoped queries for tasks and events. A Team account with Learning/Finance/Approvals but no Operations rights triggered HTTP 403 even though the remaining modules were authorized.

**Fix:** Each dashboard query is conditional on that module's company permissions; disallowed modules are represented by empty datasets, not a failure. Today hides links/actions to inaccessible operational modules, while still showing permitted Learning, Finance and Approvals data. Permissions are still enforced by the API; the Team account is **not** granted more access.

**Expected:** A Team user with `learning:write`, `finance:write` and `approvals:write` on Bitstek Learning can open Home, Today, Learning, Finance and Approvals; Operations, Sales, Advisory and other unassigned modules remain unavailable. API calls for forbidden records return 403.

## Fixed: Super Admin CRUD while viewing All Companies

- **Settings → Team & Access:** Add Member now asks for a company inside the drawer. Edit Access works from the All Companies list and lets an administrator choose the target membership's company. The same panel supports scoped deactivate, reactivate, remove access (with reassignment) and Super Admin password reset. Assign Companies continues to support multi-company access.
- **Settings → Companies:** Super Admin can create companies and edit company name, vertical and base currency directly; no company switch is required. The edit endpoint never deletes a company or business records.
- **Module record forms:** Add/Edit uses an explicit company selector in All Companies view. Related data, assignees, file uploads and API writes use the selected company's ID via the existing `x-company-id` header. Editing an existing record keeps its company fixed; cross-company moves are not performed implicitly.
- Existing task, calendar, sales and selected module workflow actions use the record's company ID when displaying combined records.
- The global All Companies selector remains unchanged after an inline form save.

**Security:** The backend verifies the requested `x-company-id` against authenticated company roles and module permissions. This frontend change is not a bypass. Financial records still use the existing workflow/void protections, not a generic destructive delete.

## How to update from v5.5

1. Back up MongoDB and copy `backend/.env` somewhere secure. In particular, preserve `JWT_SECRET` and `MFA_ENCRYPTION_KEY` verbatim.
2. Extract this v5.6 package to a fresh directory and copy only your private `backend/.env` into the new `backend` folder. Do not copy old `node_modules` or run seed against your existing database.
3. Start MongoDB (or confirm MongoDB Atlas is reachable).
4. Terminal 1: `cd backend; npm install; npm run dev`.
5. Terminal 2 (separate terminal): `cd frontend; npm install; npm run dev`.
6. Sign in as Super Admin. With **All Companies** selected, open Settings → Team & Access. Add or edit a member and verify that you **remain on Team & Access**. Then edit company details in Settings → Companies.
7. Sign in as a restricted Team account and open Home / Today / Learning / Finance / Approvals. The Today page should load with Operations shown as empty/inaccessible, and the sidebar should include only modules granted for that company.
8. Test that an unauthorized company header still returns HTTP 403.

## Validation commands

From project root: `node scripts/check-v56.mjs`. This checks source-level regressions without installing packages. 

From backend: `npm run verify` (TypeScript build and backend unit tests, including the new Team policy tests). From frontend: `npm run verify` (TypeScript + Vite build). 

With backend running and a **disposable test database only**, run `node scripts/smoke.mjs` from the repository root after reviewing the script's fixture writes. Test login, company scoping, member edits and CRUD through the browser.

## Deployment on Render

Deploy using the existing `render.yaml` Blueprint with `bash scripts/render-build.sh` and `cd backend && node dist/server.js`; see `docs/RENDER_DEPLOY_v5_2.md`. Preserve production env secrets, database, and persistent upload disk. Push the patched repository to GitHub and deploy from Render. No database migration is required.

## Verification limitations

- **Passed in this execution environment:** TypeScript/TSX parse checks, relative-import resolution, source-level regression assertions, 7 executable pure access-policy assertions, and archive integrity checks.
- **Not executed here:** full frontend/backend builds (npm registry DNS is unavailable), live MongoDB queries/membership edits, and browser end-to-end tests. Run them on a staging database before production. This patch is a development release, not a claim of fully verified production readiness.

**Currency caution:** Changing a company's base currency does **not** convert or revalue previously recorded invoices, balances or trading transactions. Treat a currency change as an administrative setting for future reporting defaults and review existing financial data separately.
