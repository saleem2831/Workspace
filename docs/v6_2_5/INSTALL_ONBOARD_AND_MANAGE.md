# Bitstek Workspace v6.2.5 — Tenant Onboarding and Platform Owner Guide

**Status:** Developer Preview / staging only until real integration, deployment and security testing pass.

## What changed from v6.2.3

1. **Workspace code is required at every login**, regardless of whether the account is Tenant Super Admin, Owner, Team, or Platform Owner. On a tenant-specific hostname the backend also checks the hostname's tenant against the submitted workspace code when `SAAS_BASE_DOMAIN` is configured.
2. **New tenant invitations have an activation flow**: Platform Owner creates tenant, copies a private link to `/invite#token=...`, the invited admin opens it (preferably in a separate private browser window), verifies the invitation, sets a new password (minimum 16 characters), and then signs in with email/password/workspace code. Existing accounts use their existing account password.
3. **Every new tenant gets an initial company**. For tenants created in older releases without any company, first Super Admin invitation claim creates `Primary Company`.
4. Platform Owners can **create subscription plans** with company/seat/storage/AI quotas and monthly-price metadata; no payment is captured automatically.
5. Platform Owners can **view and edit tenant details**, including name, primary-contact email and default language; **set a subdomain**, **assign manual plans**, and **list tenant users**.
6. Tenant user management includes **display-name update, tenant-specific activate/deactivate, and a restricted email change**. Email change requires operator MFA, current-email confirmation, only one tenant membership and no active platform privileges. **Mailbox ownership is not verified automatically**; perform an independent verification process first.
7. Platform Owners may **suspend/reactivate/archive** customer tenants and **permanently delete only eligible empty archived tenants**. Financial/audit/file-bearing tenants cannot be hard-deleted in this workflow. Cannot suspend/archive own currently authenticated platform administration tenant.
8. Backend validates tenant invitation token with POST; the token is in the URL fragment rather than HTTP query strings, limiting exposure in server logs.

## Security: exposed invitation token

If a tenant invitation token appeared in a screenshot, chat, logs, or public issue, **reissue** the invitation (Platform Console → select tenant → Details & domain → Reissue unclaimed invitation). The previous unclaimed token will be invalidated. Never embed raw tokens or login passwords in screenshots.

## Updating the existing Bitstek database

**Do not run `bootstrap:new:apply` or `migrate:saas:apply` again** if your `bitstek` tenant and Super Admin already exist. Do not run a demo seed in production.

1. Make a tested MongoDB backup and copy `backend/.env` to a secure location. Keep original `JWT_SECRET` and `MFA_ENCRYPTION_KEY` unchanged for existing accounts. Rotate known exposed credentials under a planned procedure.
2. Extract the full v6.2.5 ZIP in a separate directory. Copy over **only your backend/frontend `.env` files and private uploads** from your installed project. Do not copy old source or `node_modules` over the new project.
3. In `backend`, run `npm install`, `npm run typecheck`, then `npm run dev`. In a second terminal, in `frontend`, run `npm install`, `npm run typecheck`, and `npm run dev`. Open `http://localhost:5173`.
4. Sign in with the existing Platform Owner email, password, MFA, and **workspace code `bitstek`**.
5. Open Platform Console → Tenant directory → select the new customer workspace.

If the existing account hasn't been promoted to Platform Owner, follow `docs/v6_2/DEDICATED_PLATFORM_OWNER_EMAIL.md`, complete MFA, and use `npm run bootstrap:platform` (dry-run) followed by `npm run bootstrap:platform:apply` with an authorized offline administrator. No universal default password exists.

## New customer `advancerex`: activate the invitation

For a tenant created earlier and shown in Platform Console as `advancerex`:

1. Select `advancerex` from Tenant directory.
2. Go to **Details & domain** and choose **Reissue unclaimed invitation** if the old invitation token was exposed or expired. This operation is allowed only when no active tenant Super Admin exists.
3. Click **Copy activation link**. It has the shape `http://localhost:5173/invite#token=...&workspace=advancerex&email=...`. The token is confidential. The backend must be running at `http://localhost:5000` and the Vite proxy must be configured.
4. Open the link in an incognito/private window. The invitation page shows the workspace and invited email. For a new user create a password of **at least 16 characters**. If the email is an *existing* account, enter that account's existing password (min 12 characters).
5. Select **Accept invitation**. On success select **Continue to workspace login**.
6. Log in using the invited email, chosen password and mandatory workspace code **`advancerex`**. The one-time token is **not** a login password.
7. The new tenant has a default company. In Settings → Companies, create further companies and enable their modules as allowed by the plan.

If the original tenant was created without an initial company, claiming the Super Admin invite in v6.2.5 creates `Primary Company` automatically. **Do not re-create the tenant solely to address this.**

## Platform Console controls

- **Create customer workspace:** tenant name, unique workspace code, invited Super Admin email, language, subscription plan, optional first company name and subdomain. Returns a **one-time activation link** (no email delivery yet).
- **Create plan:** plan code/name, companies, seats, storage GB, AI credits, currency, monthly price. This creates manual **pricing metadata**; integrating a payment gateway/webhooks is a separate release gate.
- **Tenant directory → Details & domain:** edit tenant name, primary contact, language, and set subdomain. Workspace **code is immutable** to avoid breaking login references.
- **Tenant directory → Tenant users:** list tenant members; edit name or tenant-specific access, and update email with additional confirmation. Prevents deactivating the final active tenant Super Admin.
- **Tenant directory → Subscription:** switch to another active plan with sufficient companies/seats and change subscription status; **does not charge a card or generate an invoice**.
- **Tenant directory → Lifecycle:** suspend, reactivate, archive, delete eligible empty archived tenant. Archiving is the preferred reversible option. **Download/export data and confirm applicable retention requirements** before requesting closure.

## Tenant subdomains

Set:

```dotenv
# backend/.env
SAAS_BASE_DOMAIN=workspace.example.com

# frontend/.env (Vite; requires rebuild in deployment)
VITE_SAAS_BASE_DOMAIN=workspace.example.com
```

Assign a unique tenant subdomain (for instance, `advancerex`), which produces `https://advancerex.workspace.example.com`. A subdomain **will not become live merely by saving it in MongoDB**. Configure wildcard DNS, a valid wildcard TLS certificate, wildcard host routing for the same-origin React/Express application, and provider-specific reverse proxy setup. Ensure both the UI and API are reachable via HTTPS on the tenant host. Do not enable wildcard tenant origins in CORS without origin validation. Use localhost and required workspace code for local development.

## Validation checklist (staging)

- [ ] New tenant gets an initial company, without reading another tenant's data.
- [ ] Wrong/missing workspace code blocks login.
- [ ] Invitation preview and claim succeed; reused, expired or revoked invitation fails.
- [ ] Admin sign-in works with workspace code; Teams and Owners are scoped.
- [ ] New plan created; tenant plan change works; insufficient plan limits reject downgrade.
- [ ] Tenant metadata and subdomain changes are audited.
- [ ] Tenant users list includes active Super Admin; changes revoke sessions where appropriate.
- [ ] Suspend blocks tenant access; reactivation restores it; own platform-admin tenant cannot be suspended.
- [ ] Archive is reversible; unsafe deletion is blocked if users, business data, files or audits exist.
- [ ] Arabic/English shell and navigation remain usable on mobile/desktop.
- [ ] No passwords, tokens, private S3 documents or MongoDB URLs appear in browser logs or shared screenshots.

## Known limitations / production release gates

- No transactional email sending, verified email ownership workflow, payment gateway integration or automated subscription billing. Platform Owner must share the invitation link securely and verify ownership of requested email changes out of band.
- Tenant subdomains need DNS/certificate/reverse-proxy deployment infrastructure. Saving a subdomain does not configure these automatically.
- Full integration tests with live MongoDB transactions, MFA, object storage, DNS/TLS, browser journeys and cross-tenant security **must run in staging** before production.
- API/TypeScript syntax and import tests alone do not certify production readiness. Review the broader v6.1/v6.2 release gates included in the package.
