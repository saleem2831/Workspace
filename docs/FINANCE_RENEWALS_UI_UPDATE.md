# Finance Renewals — Responsive dashboard UI update

This is a **frontend-only** update to the existing Renewals & Recurring Payments feature. No renewal, expense, approval, journal, storage, or audit API/model was changed. Finance data remains on the backend with existing company/tenant permissions.

## Resolved problem

`frontend/src/styles.css` contained renewal-specific styling but was not imported from the frontend entry point. The page therefore showed four large full-width KPIs and unstyled native search/dropdown fields. `frontend/src/main.tsx` now imports that stylesheet after `styles/app.css`.

## UI changes

- 4 uniform KPI cards per row on desktop, 2 on tablet (<=900px), 1 on mobile (<=600px).
- Cards are clickable filters with keyboard focus and pressed state.
- **Due in 7 days** covers 0–7 calendar days, inclusive. **Due in 8–30 days** covers 8–30; this subtracts the existing cumulative `due7` from the cumulative `due30` API summary so counts are disjoint. The backend summary format remains unchanged.
- Search in service/title, category, vendor, and notes, with clear control.
- Native dropdowns have consistent styles: status, recurrence frequency, sort (next date, latest date, nominal amount, service name, newest).
- Applied filter chips, clear-all action, visible row counts, helpful empty states, keyboard accessible rows.
- Default status `All statuses` (instead of hiding paused/cancelled records by default).
- When a single company is selected, `GET /finance/renewals?companyId=<selectedCompany>` uses the existing authorized backend company filter; All Companies still follows backend session permissions. Switching companies closes open renewal detail/edit drawers.

**Note:** Amount sorting uses nominal amounts and does not convert mixed currencies. The list and summary remain subject to the API's pre-existing 500-record limit.

## Files updated/added

- `frontend/src/main.tsx` — imports renewal stylesheet.
- `frontend/src/pages/RenewalsPanel.tsx` — responsive UI and client filters.
- `frontend/src/pages/renewalFilters.ts` — isolated pure filter/sort helpers.
- `frontend/src/styles.css` — scoped Finance Renewals design and responsive breakpoints.
- `frontend/tests/renewalFilters.test.mjs` and `frontend/tests/renewalUiSource.test.mjs` — regression tests.

## Validation

- `cd frontend && npm run typecheck` — **PASS**.
- `cd frontend && node --experimental-strip-types --test tests/*.test.mjs` — **PASS**.
- `node --test backend/dist/tests/*.test.js` — **42 PASS** (precompiled unchanged backend regression suite).
- Production Vite bundle **not verified in the working container** because the previously installed Windows `node_modules` has non-executable `.bin/vite` and Windows-only esbuild/Rollup modules. Deploy with fresh `npm install` on Linux per `scripts/render-build.sh`.

No production browser interaction or live database integration was performed.
