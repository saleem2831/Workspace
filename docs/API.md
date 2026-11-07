# Bitstek Workspace API — v1

Base URL: `/api`. Auth is an HttpOnly cookie issued by login. On POST/PATCH/DELETE, send `x-csrf-token` equal to the `bitstek_csrf` browser cookie. Every request also sends `x-company-id: <authorizedCompanyId>` (or `all` for read-only aggregation).

## Authentication

```http
POST /api/auth/login
Content-Type: application/json

{"email":"admin@bitstek.local","password":"<SEED_ADMIN_PASSWORD>"}
```

`GET /api/auth/me` returns the logged-in user, company memberships and roles. `POST /api/auth/logout` clears cookies. `GET /api/health` is public.

## Generic record endpoints

- `GET /api/records/:entity?search=x&status=x&page=1&limit=100`
- `GET /api/records/:entity/:id`
- `POST /api/records/:entity`
- `PATCH /api/records/:entity/:id`
- `DELETE /api/records/:entity/:id` (soft-archive, except financial records)

Supported entity slugs: `tasks`, `events`, `students`, `courses`, `batches`, `installments`, `internships`, `tradingAccounts`, `dailyPerformance`, `capitalMovements`, `clients`, `leads`, `proposals`, `products`, `subscriptions`, `projects`, `milestones`, `invoices`, `expenses`, `transfers`, `receipts`, `approvals`.

Dedicated workflows own creation or state changes for: `approvals`, `receipts`, `installments`, and `dailyPerformance`. Generic finance POST for expenses/transfers/capital movements automatically opens a pending approval request.

### Create task

```http
POST /api/records/tasks
x-company-id: <companyId>
x-csrf-token: <cookie token>
Content-Type: application/json

{"title":"Prepare client demo","vertical":"Advisory","priority":"P1","status":"backlog","dueAt":"2026-11-10T10:00:00.000Z"}
```

### Task updates

- `GET /api/workflows/tasks/:id/updates`
- `POST /api/workflows/tasks/:id/updates` — `{ "message": "Client deck ready for review" }`
- `PATCH /api/records/tasks/:id` — `{ "status": "in-progress" }`

### CRM won → project conversion

1. Set the lead's `stage` to `won`.
2. `POST /api/workflows/leads/:id/convert` with `{}`.
3. Server uses a MongoDB transaction and returns existing project if already converted.

### Learning

```http
POST /api/workflows/installments/schedule
{"studentId":"<studentId>","title":"Fee installment #1","amount":"15000.00","dueAt":"2026-11-15"}
```

```http
POST /api/workflows/installments/:id/collect
{"amount":"5000.00","reference":"BANK-001"}
```

Collection creates a receipt and recalculates the student outstanding balance inside a MongoDB transaction.

### Approvals

`POST /api/workflows/approvals/:id/decision` — `{ "decision": "approved" }` or `{ "decision": "rejected", "reason": "Missing attachment" }`. The authenticated requester's ID cannot equal the maker ID. Company approval authority is required.

### Finance

- `POST /api/records/expenses` — create pending expense and approval.
- `POST /api/records/transfers` — create pending intercompany transfer and approval; destination company must be separately authorized.
- `POST /api/workflows/finance/post/expenses/:id` — approved expense creates Expense/Payable journal.
- `POST /api/workflows/finance/post/invoices/:id` — sent/approved invoice creates Receivable/Revenue journal.
- `POST /api/workflows/finance/post/transfers/:id` — approved transfer creates offsetting journals in both companies.
- `POST /api/workflows/invoices/:id/collect` — `{ "amount": "1000.00", "reference": "UTR123" }`, requires prior invoice posting, records receipt and Bank/Receivable journal.
- `GET /api/workflows/finance/journals` — read-only posted journal list.

**Do not** directly alter `paidAmount`, `approvalId`, posted status, or posted journal lines. They are controlled by workflows.

### Advisory CSV import

`POST /api/workflows/advisory/import-performance`

```json
{"tradingAccountId":"<accountId>","csv":"sourceKey,date,realizedPnL,unrealizedPnL,fees\nEXT-001,2026-11-04,10500,-500,100"}
```

Mandatory unique `sourceKey` avoids duplicates. Unmatched rows are returned as validation errors. Imports do **not** execute trades.

### Dashboard and reporting

- `GET /api/dashboard/summary`
- `GET /api/dashboard/reports`

Financial groups preserve original currency; no implied FX conversion.

### Administration

- `GET /api/admin/companies`
- `POST /api/admin/companies`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `GET /api/admin/audit`

## Standard errors

`401` unauthenticated/expired session, `403` forbidden/CSRF/tenant access, `400` invalid payload, `404` missing record, `409` conflict/duplicate/invalid workflow transition, `500` unexpected server error (details logged server-side).
