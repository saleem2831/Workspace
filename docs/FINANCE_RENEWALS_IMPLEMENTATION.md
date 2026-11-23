# Finance Renewals & Recurring Payments — implementation notes

This release adds a vendor-side renewal register to **Finance → Renewals & Recurring** without changing the **Products → Subscriptions** (customer billing) workflow. The existing Finance expenses, approvals, transfers, invoices and journal history are preserved.

## Included functionality

- Create, edit, pause, resume or cancel recurring commitments (hosting, domains, SaaS, licenses, insurance, rent, AMC, other).
- Support monthly, quarterly, half-yearly, annual and custom 1–120-month intervals. Month-end anchors are preserved over February and leap years.
- Amount and currency, vendor, responsible company member, notes and per-renewal reminder day settings. Only the selected and authorized company can modify a record.
- Upcoming/due-soon/overdue badges and 7-/30-day dashboard counts; 30/15/7/3/1-day reminder thresholds by default. Finance renewal counts appear in the notification bell. Alerts are calculated server-side on every read and the UI refreshes every 60 seconds while open.
- Dedicated Finance API with strict Zod input validation, tenant-scoped MongoDB collections, company-level permissions and audit logs.
- Optional PDF/JPG/PNG proof upload via existing private local/S3 storage (8 MB limit), accessible only to users with Finance access to the owning company.
- Immutable history for every completed renewal, linked to its original expense, payment reference and the balanced settlement journal.
- Rejected expense requests can be resubmitted without deleting the original rejected expense, approval or audit record.
- Company export and delete-impact checks include renewal records and payment history.

**Email and SMS reminders are not implemented:** no external email job runner, provider credentials or scheduler were added. Reminders are in-app, using the existing notifications polling endpoint. Automated bank debiting is also not implemented.

## Payment / accounting workflow

1. Create a renewal under Finance → Renewals & Recurring. Specify company, amount, date and frequency.
2. Open the renewal and select a separate authorized approver. **Request expense approval** creates an `Expense` and an `ApprovalRequest` inside one MongoDB transaction. The renewal links to the pending expense.
3. In **Approvals**, the assigned approver approves the expense (requester cannot approve own request).
4. In **Finance → Expenses & Payables**, post the approved expense through the existing posting workflow. The existing journal debits **Expense** and credits **Accounts Payable**.
5. Return to the renewal. Enter a payment reference and optionally upload proof. **Mark paid & schedule next renewal** requires the linked expense to be **posted**. It atomically creates `RenewalPayment`, posts a new balanced journal (debit **Accounts Payable** / credit **Bank**), marks the expense **paid**, advances `Renewal.nextDueAt`, and writes an audit record.
6. The completed cycle remains in **Payment / renewal history**. Future due dates remain tracked; each cycle must be settled separately.

No payment is recorded merely because a reminder fired, a due date passed, or an expense was approved. This prevents hidden bypasses of the existing accounting controls.

## API endpoints

All endpoints require existing session authentication and the existing CSRF guard for mutations. `x-company-id` is used on mutations. Workspace tenant scoping comes from the verified session, never an untrusted request value.

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/finance/renewals` | Finance-readable list, computed alert state and summary (up to 500 rows) |
| POST | `/api/finance/renewals` | Create for explicitly selected company |
| PATCH | `/api/finance/renewals/:id` | Edit a renewal (financial terms locked during open expense workflow) |
| POST | `/api/finance/renewals/:id/status` | Pause, resume, cancel |
| GET | `/api/finance/renewals/:id/history` | Read append-only renewal settlement history |
| POST | `/api/finance/renewals/:id/request-expense` | Create controlled expense/approval; retry only if previous is rejected |
| POST | `/api/finance/renewals/:id/complete` | Require posted expense, record bank settlement and advance recurrence |
| POST | `/api/files` (`purpose=renewal-proof`) | Existing private upload workflow, Finance-scoped |

## Deployment

Run `npm install` and build **independently** in `backend/` and `frontend/` so native dependencies match the deployment OS. The original uploaded archive contained Windows binaries that are not portable to Linux.

For the existing single-Render-Web-Service architecture, `render.yaml` already uses:

```
Build: bash scripts/render-build.sh
Start: cd backend && node dist/server.js
SERVE_FRONTEND=true
```

Set `MONGODB_URI`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `WEB_ORIGIN`, cookie configuration and storage variables using **Render Environment**, not files committed to source. Use a MongoDB replica set / Atlas deployment because approval, settlement, payment and journal writes require transactions.

Suggested allowed frontend origins:

```
WEB_ORIGIN=https://workspace-1-nx8s.onrender.com,https://workspace.bitstek.io,https://www.workspace.bitstek.io
```

For a separately hosted frontend/API with truly cross-site cookies, `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` may be required (configure the frontend's `VITE_BACKEND_URL` accordingly).

No destructive migration or historical data conversion is required. The new Mongoose models create new collections/indexes; ensure database index creation is enabled or provision indexes in the deployment pipeline. Existing financial collections are not modified except for **new, expressly approved** renewal-originated expenses and their subsequent journal transactions.

## Validation performed

- Backend TypeScript compilation: **PASS**.
- Frontend TypeScript type check: **PASS**.
- Compiled backend test suite: **42 tests PASS**, including renewal-date calculations, currency precision, audit journal balance, role-access functions and tenant-context isolation.
- **Not run:** frontend production Vite bundle (the uploaded `node_modules` contained Windows-only esbuild; the clean archive does not include it). Also not run: a live MongoDB/Render integration test or SMTP delivery test.

`node --test backend/dist/tests/*.test.js` can run after compiling the backend. For browser acceptance: create a renewal in Company A, verify it does not appear for Company B or a different tenant, request/approve/post its expense, settle it once, verify the second attempt fails, and confirm both journals and the payment history exist. Verify rejected expenses can be retried and the old approval persists.
