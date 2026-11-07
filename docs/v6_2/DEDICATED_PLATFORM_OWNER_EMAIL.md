# Dedicated Platform Owner email — v6.2.1

Use **a separate mailbox** for SaaS Platform Owner. Do not reuse Bitstek's tenant Super Admin email.

## Preflight

1. Back up the existing MongoDB database. **Use a staging copy first**; the bootstrap writes only a new user and tenant membership.
2. Ensure the **existing `bitstek` SaaS tenant** is present. If you are still on the pre-SaaS v5.7 schema, first run the existing `migrate:saas:dry` against staging, review it, and only then run `migrate:saas:apply` against staging.
3. Set `MONGODB_URI` to the intended database and preserve `JWT_SECRET` and `MFA_ENCRYPTION_KEY` from the existing installation.
4. Run this bootstrap on a trusted **interactive admin workstation**. It prints a password once and intentionally refuses non-interactive CI/Render jobs.

## Create separate email without existing Owner credentials

Set in `backend/.env` (use **your own** separately controlled mailbox):

```env
SAAS_INITIAL_TENANT_SLUG=bitstek
PLATFORM_OWNER_NEW_EMAIL=platform.owner@your-domain.com
PLATFORM_OWNER_NEW_NAME=Platform Owner
PLATFORM_OWNER_CREATE_CONFIRM=
```

From `backend`:

```powershell
npm install
npm run bootstrap:platform-owner:new:dry
```

The dry run does not write anything. Review it, ensure backups exist and no unrelated data was selected. Then set:

```env
PLATFORM_OWNER_CREATE_CONFIRM=I_CONTROL_THIS_INSTALLATION_AND_HAVE_VERIFIED_BACKUPS
```

Run **from an interactive terminal only**:

```powershell
npm run bootstrap:platform-owner:new:apply
```

The CLI prints the email, a strong random one-time password, and the workspace slug. Save the password in a password manager. This command creates an ordinary tenant-member identity, **not** a company Owner, tenant Super Admin, or Platform Owner. It does **not change any old users or business records**.

## Enable MFA and promote

1. Run backend and frontend (`npm run dev` in each).
2. At `http://localhost:5173` log in with the **new** email, the generated password, and workspace `bitstek`.
3. Open `http://localhost:5173/settings` → **Security**, and complete authenticator QR enrollment and 6-digit verification. You may have to sign in again after enabling MFA.
4. In `backend/.env`, set:

```env
PLATFORM_OPERATOR_EMAIL=platform.owner@your-domain.com
PLATFORM_OPERATOR_LEVEL=owner
```

5. From `backend`, run:

```powershell
npm run bootstrap:platform
npm run bootstrap:platform:apply
```

6. Log out and log in again using the **dedicated** email, generated password and MFA code. Go to `http://localhost:5173/platform`.
7. **Clear** `PLATFORM_OWNER_NEW_EMAIL` and `PLATFORM_OWNER_CREATE_CONFIRM` from `.env` after use; remove temporary elevated CLI variables after promotion when operationally appropriate.

## Safety and limitations

- You must control the MongoDB installation and the separate email address; no existing platform login is required for this *offline* provisioner. Never expose this script as an API endpoint.
- No universal login password or hardcoded production credentials exist.
- MongoDB transactions require an Atlas replica set or another transaction-capable MongoDB deployment.
- The new Platform Owner has **no company-level membership by default**. It is for infrastructure/tenant administration and has no automatic access to private Bitstek records.
- A second *distinct* MFA-enrolled Platform Owner is needed for independent infrastructure migration approvals; repeat the identity provisioning with another email and promote it separately.
- This change adds account provisioning only; it does not certify the v6.2 SaaS release as production-ready.
