# Bitstek Workspace v6.2.3 — Member Login, Admin Access, Branding, CSV Templates and Platform Owner

## What this patch changes

1. **New accounts can log in.** Previously `POST /api/admin/users` inserted into `users` and tenant-scoped `memberships` but omitted the required `tenantmemberships` entry. SaaS login consequently returned `No active workspace membership for this account`. It now commits the User, TenantMembership and company Membership **together in a MongoDB transaction**. Requires an Atlas replica set/transaction-compatible database.
2. **Existing affected users can be repaired.** In **Settings → Team & access**, Tenant Super Admins will see **Login blocked / Repair workspace login** for users missing a tenant membership. Click to create only the missing `member` tenant membership. This preserves the user's existing password, role, company access and documents. Suspended memberships are not reactivated automatically. Operation is tenant-scoped and audit-logged.
3. **Accurate Super Admin display.** The UI now determines Super Admin from the active `tenantmemberships.role`, not the obsolete global `users.isSuperAdmin` flag. Tenant Super Admin has all enabled companies without a company Owner membership.
4. **Self-assignment.** Preventing Owner/admin self-grant remains a deliberate security control. Tenant Super Admin automatically has access to all active companies and should not assign themselves; the UI hides self-assignment and explains this. Only a different authorized administrator should grant an Owner additional company access.
5. **Workspace branding.** Change workspace name and click **Save workspace name** without choosing a company or uploading a logo. The separate optional logo section requires a company selector only for a new file upload (if All Companies is selected).
6. **Import CSV templates.** In SaaS administration → Import existing data, use **Blank CSV template** or **Sample CSV with fields** for clients, students, products and vendors. The server generates headers from the exact supported import whitelist and fake example rows. Remove sample rows before importing real data. Downloads require Tenant Super Admin authorization. This feature is for *imports*, not export archives.
7. **Company membership assignments** now ensure that the target has a tenant membership, while not enrolling an arbitrary user from another tenant by merely guessing their global user ID. Inactive/suspended tenant memberships are not silently reactivated.

## Upgrade from v6.2.2

1. Back up the MongoDB database, copy `.env` and keep your current encryption keys. Take a staging clone before applying the patch to production.
2. Extract `Bitstek_Workspace_MERN_v6_2_3_ACCESS_BRANDING_IMPORT_FIXED_FULL_SOURCE.zip`. Keep only the required `frontend` and `backend` applications; the documentation lives under `docs`.
3. Copy your **existing** `backend/.env` to the new `backend` directory. Do not copy or commit secrets to frontend, docs or Git.
4. In backend terminal:

   ```powershell
   cd backend
   npm install
   npm run typecheck
   npm run dev
   ```

5. In a second frontend terminal:

   ```powershell
   cd frontend
   npm install
   npm run typecheck
   npm run dev
   ```

6. Sign in as the existing **Tenant Super Admin**. Do **not** rerun `bootstrap:new:apply` or SaaS adoption migration if tenants already exist.
7. Open **Settings → Team & access**, select **All accessible companies**, find the affected member and click **Repair workspace login**. For the screenshot example, locate the existing `kumayl@bitstek.io` record. Ask the user to sign in with their own existing password and workspace code `bitstek`.
8. If the user has forgotten their password, use an *authorized* reset process separately. Repairing the tenant membership does not reveal or reset passwords.
9. Confirm **Workspace branding → Save workspace name** works without a logo. In SaaS administration, download and inspect each CSV template before testing imports.

### Access safety checks

- Super Admin sees all tenant companies but cannot accidentally demote their tenant role through company editor.
- Company Owner has no ability to grant themselves a new company or Owner privilege.
- Team user is restricted to assigned company/modules and cannot call admin-only repair.
- Repair only works for an existing active user with an active company assignment **within the caller's tenant**. It cannot reactivate deliberately suspended tenant memberships.
- Cross-tenant access via guessed user IDs is rejected by membership creation paths.

## Dedicated Platform Owner login (separate email)

The *Platform Owner is distinct from the Bitstek tenant Super Admin*. It is not created by editing an employee's company role. You previously selected a distinct email; use the address you actually control.

**If your separate Platform Owner account has not been created:** Configure `backend/.env`:

```dotenv
SAAS_INITIAL_TENANT_SLUG=bitstek
PLATFORM_OWNER_NEW_EMAIL=<SEPARATE_EMAIL_YOU_CONTROL>
PLATFORM_OWNER_NEW_NAME=Platform Owner
PLATFORM_OWNER_CREATE_CONFIRM=
```

Run **dry-run** first:

```powershell
cd backend
npm run bootstrap:platform-owner:new:dry
```

After verifying the database, backups, email and account absence, set:

```dotenv
PLATFORM_OWNER_CREATE_CONFIRM=I_CONTROL_THIS_INSTALLATION_AND_HAVE_VERIFIED_BACKUPS
```

Then execute from a trusted **interactive** administrator terminal:

```powershell
npm run bootstrap:platform-owner:new:apply
```

The CLI outputs a random **one-time password**. Save it securely. There is no default password and it cannot be reprinted. Never run this against an unintended database.

**Activate Platform Owner:**

1. Sign in at `http://localhost:5173` with the separate email, printed password and workspace code `bitstek`.
2. Enable MFA at **Settings → Security**, scan QR and confirm a code. Sign in again.
3. Configure:

```dotenv
PLATFORM_OPERATOR_EMAIL=<SAME_SEPARATE_EMAIL>
PLATFORM_OPERATOR_LEVEL=owner
```

4. Run `npm run bootstrap:platform` then `npm run bootstrap:platform:apply` (review the dry run first).
5. Sign out and back in with password + authenticator code, then visit `http://localhost:5173/platform`.
6. Clear the one-time creation confirmation variables after use.

**If that Platform Owner email already exists:** Do **not** rerun the `bootstrap:platform-owner:new:apply` command; it refuses to overwrite existing users. Sign in with its original password, or use an authorized password-reset procedure. If MFA is already enrolled and the account is promoted, go straight to `/platform`.

## Before production

These patches were source-checked only. Run `npm run typecheck`, backend tests, browser/permission regression tests, and a staging MongoDB login/repair/import rehearsal. A live MongoDB/S3 integration test has not been performed here. Do not treat this release as production-certified.
