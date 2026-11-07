# Setup, old Bitstek data and identity provisioning (v6.2)

## A. Existing Bitstek database, preserving all current data

1. Make a **verified** MongoDB backup including indexes and your private upload directory/S3 bucket; safeguard `backend/.env` separately. Clone the database into staging. Never paste production secrets into code or chat.
2. Keep the **original** `MFA_ENCRYPTION_KEY` and `JWT_SECRET` if enrolled users and sessions are to remain valid. A new MFA key would make existing encrypted authenticator secrets unreadable.
3. Extract the new v6.2 repository into a new folder. Do not reuse corrupted `node_modules`.
4. Copy the old `backend/.env` to the new `backend/.env`, then add new optional v6.2 variables using `.env.example` as a reference.
5. **If already running v6.1:** there is no new data-adoption migration. MongoDB will create the PlatformMigration collection on first planned migration. Existing tenants, companies, users, company permissions, invoices, files and record IDs remain untouched.
6. **If upgrading from pre-SaaS v5.7:** after backing up, run from `backend`: `npm run migrate:saas:dry`, review counts and identities, then `npm run migrate:saas:apply` **against a staging clone first**. This adopts existing Bitstek companies into the first Bitstek tenant. Do not run against a database that already contains v6.1 tenant records.
7. Verify the existing Workspace Admin and separate Owners/Team accounts can sign in and access their original assigned companies and modules. Check capital movements, invoices, students, audit logs, file downloads and MFA.

## B. Fresh SaaS installation (empty database only)

1. Set `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD` (strong random value, at least 16 characters), `BOOTSTRAP_TENANT_SLUG`, valid `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, and a replica-set `MONGODB_URI` in `backend/.env`.
2. Run `npm run bootstrap:new:dry` and examine the effects. Then `npm run bootstrap:new:apply` from `backend`.
3. **Remove `BOOTSTRAP_PASSWORD` from deployed environment immediately.** Sign in with the email/password you provided, set up MFA and verify it. This establishes the initial Tenant Super Admin.
4. Create company Owners and Team accounts through **Settings → Team & access**; assign company membership and per-module permissions. Do not use shared passwords.
5. To create a dedicated Platform Owner: create a separate trusted account, enroll/verify MFA, then bootstrap only that specific email as described below.

## C. Platform Owner: secure activation

A Platform Owner **must first be an existing, active, MFA-enrolled user**. From `backend` on a trusted admin machine:

```powershell
# Edit backend/.env safely (do not commit)
# PLATFORM_OPERATOR_EMAIL=trusted-person@your-domain.com
# PLATFORM_OPERATOR_LEVEL=owner
npm run bootstrap:platform      # preview
npm run bootstrap:platform:apply  # revokes old sessions
```

Sign in again and open **Platform Console**. **Repeat using a DIFFERENT trusted MFA-enrolled identity** for independent infrastructure migration approvals. One person creates the migration plan; the other approves. Never elevate arbitrary tenant users via a public API.

For an operational support/billing account that cannot approve infrastructure moves, use `PLATFORM_OPERATOR_LEVEL=operator` instead.

## D. Role credential guide

| Role | Example email only (NOT a created user) | Password/MFA source | Access |
|---|---|---|---|
| Platform Owner | `platform-owner@your-domain.com` | Existing account's own password and MFA, then CLI elevation | Control-plane and migration planning/approval |
| Tenant Super Admin | `superadmin@customer-domain.com` | One-time invitation claim or empty-DB bootstrap | One tenant; all that tenant's companies |
| Owner | `owner@customer-domain.com` | Tenant member creation/invitation, individual password | Assigned companies and their enabled modules |
| Team | `team@customer-domain.com` | Tenant member creation/invitation, individual password | Allowed modules in assigned companies |

**No universal or pre-shared credentials exist in production.** For existing Bitstek data, use your existing login email/password; the source ZIP contains no database and no accounts.

### Optional disposable development credentials

On **development only** with a disposable database and an already-adopted tenant:

```powershell
# backend/.env (NEVER production)
# NODE_ENV=development
# DEMO_BOOTSTRAP_CONFIRM=CREATE_DISPOSABLE_ACCOUNTS
cd backend
npm run bootstrap:demo:dry
npm run bootstrap:demo:apply
```

The script creates `platform-owner-demo@bitstek.local`, `tenant-superadmin-demo@bitstek.local`, `company-owner-demo@bitstek.local`, and `team-demo@bitstek.local`, printing each randomly generated password **once** to the terminal. It refuses to overwrite existing demo accounts and will not run in production. The first demo account is **only a Platform Owner candidate** until they enroll MFA and are explicitly elevated via the separate platform bootstrap. Use the Settings member-management UI for actual production identities.

## E. Developer commands

**Backend (terminal 1):**

```powershell
cd backend
npm install
npm run typecheck
npm run test
npm run dev
```

**Frontend (terminal 2):**

```powershell
cd frontend
npm install
npm run typecheck
npm run build
npm run dev
```

**URLs:** `http://localhost:5173`, `http://localhost:5000/api/health`, `http://localhost:5000/api/ready`.

**Common problems:** npm's Windows `ENOENT/EBUSY` means reinstall in a short path; `JWT_SECRET` must be 32+ characters; `MFA_ENCRYPTION_KEY` must be the original 64-hex value; MongoDB transactions require a replica set; `403` should be checked against tenant, company and module permissions.
