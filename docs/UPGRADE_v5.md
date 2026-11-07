# v5 — Changes mapped to the November 5 feedback

| Module | Implementation | Important limitations |
|---|---|---|
| Work Board | Optimistic task movement, multi-assignees, archive | Concurrent drag conflicts and multi-browser synchronization need live tests |
| Calendar | Edit, cancel, postpone, archive; meeting URL | No provider OAuth or automatic Google/Zoom meeting generation |
| Learning | Country code, mentor master, seat counts, fee installment linkage, internship files | Existing student fees migrated with existing v4 logic; no statutory HR document management |
| Advisory | Live/demo account type, trader master, account/date performance filter, USDT FIFO realized P&L, multi-reviewer capital approval | USDT is a bookkeeping/inventory record, not an exchange integration. FIFO lot matching is based on existing buy inventory |
| Sales | Client lookup and auto-fill, lead owner, drag/drop, deactivate/archive | Proposals store content and documents but do not generate a finalized legal template |
| Products | SKU generation, categories with other, currency, subscriptions/renewal | Subscription reminders are in-app indicators, not scheduled email/WhatsApp delivery |
| Projects | Client lookup, dropdown region, milestones with scope & documents | Progress calculations and phase dependencies may need organization-specific rules |
| Finance | Multi reviewers, invoice request-review workflow, account master, account selectors, vendor master, approval layout | Posted entries preserved and not hard-deletable. No bank payment execution or full accounting reconciliation |
| Approvals | Supporting source and company lookup; assigned approvals | Maker cannot approve own request; at least one selected reviewer may decide |
| Team/Settings | Team access, per-company module permissions, deactivate/remove memberships, Super Admin password reset, workspace branding | Password-reset temporary credentials must be delivered securely and followed by a user password change. No email delivery integration |
| Security | Encrypted authenticator MFA, login challenge, anti-replay code window | No recovery code / QR image / passkey / external SSO support in this version |
| Overall UX | Home page, loading states, company selection in forms, caching and optimistic UI | No quantified performance guarantee without DB profiling and browser measurements |

## Data and upgrade notes

- Keep and back up your existing v4 database before running `npm run migrate:v5` in `backend`.
- Migration is additive and intended to be safe to re-run. Some older membership role labels are mapped to `staff` internally; the UI says **Team**.
- `isSuperAdmin` is distinct from ordinary company Owner. On a migrated database, assign it via the controlled migration bootstrap documented in README.
- Existing records may have no client/project link. This release makes the selectors available but cannot invent historical relationships.
- Multi-approver selection is currently **any one** of the chosen reviewers, not sequential all-reviewer approval.
- `User.active=false` and membership deactivation are different operations; this UI manages company memberships, keeping historical attribution.
- A document is stored privately and accessed with authenticated endpoints; production malware scanning and cloud storage still need integration.

## USDT worked example

1. Buy `5,000 USDT` at `INR 100/USDT` = `INR 500,000` purchase cost.
2. Sell `5,000 USDT` at `INR 101/USDT` = `INR 505,000` sale proceeds.
3. Expected realized P&L = **INR +5,000** (before fees/taxes).

The backend allocates sold quantity against unsold buy lots FIFO. An attempt to sell more than the available purchased balance is rejected.

## Final release gate

Pass npm installs and both application builds; run backend tests, create/move/archive tasks, edit/cancel events, enroll and collect student fees, buy/sell USDT, review/post financial entries, test scoped approvals and owner password reset, enable MFA and log in, and verify unauthorized company access is blocked. Then run staging load tests and security review.
