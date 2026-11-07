# Bitstek Workspace v6.2.6 — Tenant-aware UI & Platform Controls

## Scope

This source update is based on v6.2.5. It **does not create tenants, wipe databases, change credentials, or migrate historical records**. All prior v6.2.5 routes remain, with the following updates:

1. Today shows **only companies belonging to the signed-in tenant and selected authorized company scope**. Cards display their actual names, vertical and permitted module metrics. No Bitstek-specific business cards appear in Advancerex.
2. Reports tabs/metrics are derived from verified backend company/module permissions. A General Business company gets only relevant reporting areas. Report scope labels show the actual authorized company names.
3. The platform plan catalogue now supports **create, edit, activate/deactivate, and delete-unused**. Plan codes remain immutable. Updating assigned plan seat/company limits fails if an existing tenant would exceed them; deletion fails while tenants/subscriptions reference the plan. Changes do not collect payments.
4. Infrastructure migration controls are hidden unless the Platform Owner explicitly selects **Show infrastructure migrations (advanced)**. All existing MFA, independent-approval and offline execution rules remain.
5. Tenant users appear as clear rows with a contained edit form, avoiding the previously stretched editor.
6. Platform Owner settings are independent of customer workspace settings (platform display name, support email, default new-tenant language and theme).
7. Five tenant theme choices (Violet, Ocean Blue, Emerald, Sunset and Slate). Tenant Super Admin can select via **SaaS Center → Workspace colour theme**. Platform Owner may configure a customer's theme via **Tenant directory → Details & domain**. The platform console itself uses its own default platform theme.
8. New tenant creation can set its initial colour theme and language. Existing tenants without a theme field default to Violet. No data migration is required.
9. Tenant branding falls back to the tenant's actual name rather than displaying Bitstek by default.

## Installation (existing v6.2.5)

**Safety:** Make a MongoDB backup and copy any private local uploads. Do not post your `.env` or run fresh bootstrap scripts on this database.

1. Stop frontend and backend.
2. Extract the source archive to a fresh directory. Copy the **existing backend/.env and frontend/.env** from v6.2.5 into their respective folders. Do not replace secrets with `.env.example` defaults.
3. From `backend/`: `npm install` then `npm run typecheck`, `npm run test`, and `npm run dev`.
4. From `frontend/`: `npm install` then `npm run typecheck`, `npm run build`, and `npm run dev`.
5. Open http://localhost:5173, log in to `advancerex`, choose `All companies`, then open **Today** and **Reports**. The single General Business company should be displayed with its actual name. Learning/Advisory/Projects report tabs should not appear unless those modules are enabled in an authorized company.
6. Sign in to `bitstek`. Verify that its **own** Learning, Advisory and IT companies appear, with no Advancerex company names or data.
7. Sign in as your separate MFA-enabled Platform Owner in the platform administration tenant. Verify plan edit/disable/delete safeguards; confirm inactive plans cannot be selected for new customers.
8. Verify tenant-user editor, independent platform settings, and collapsed infrastructure migrations.
9. In Advancerex SaaS Center, select **Ocean Blue** and save. Refresh, sign out/in, and confirm the theme persists. Sign in to Bitstek and verify Bitstek remains unchanged.

## Expected isolation scenarios

| Scenario | Expected result |
|---|---|
| Advancerex / General Business → Today | Only Advancerex company card(s), no hard-coded Bitstek labels |
| Advancerex / General Business → Reports | Overview, Sales and Finance (if enabled); no Learning/Trading/Delivery without enabled authorized modules |
| Bitstek / Learning company → Reports | Learning visible only when this company enables it; other areas depend on its own configuration |
| Team member lacks Sales permission | No Sales report tab; backend excludes Sales records |
| Platform Owner edits an assigned plan below current seat/company usage | HTTP 409 and no mutation |
| Platform Owner deletes a plan assigned to any tenant | HTTP 409; plan preserved |
| Platform Owner saves platform display name | Platform Console brand updates, customer workspace branding stays unchanged |
| Tenant Super Admin saves Emerald theme | Only that tenant's theme changes |

## Database impact

- `tenants.themeId`: optional on existing documents, with `violet` default on newly created tenants.
- `platformsettings`: control-plane singleton (created only when Platform Owner saves settings).
- No destructive migration and no seed required. A schema migration command is **not needed**.
- `saasplans.active` already existed; inactive plans remain linked to existing subscriptions, but are not offered for new subscriptions.

## Production readiness

This update has source parsing and dependency-path checks only in this delivery environment. It is **not production-certified**. Before deployment, run both full npm builds, MongoDB integration tests, browser/UAT tests, tenant isolation tests, backups and restore drills. Billing remains manual; payment gateway integration is outside this update.

## Safeguards

- Never set MongoDB or AWS credentials in frontend environment variables.
- Use different databases, S3 buckets and secrets for staging and production.
- Platform operators do not gain unrestricted customer business-record access.
- Infrastructure cutover continues to require separate Platform Owner approval and secure offline execution.
