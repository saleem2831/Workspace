# Bitstek Workspace v5.1 — Verification report

**Scope:** patch on top of the v5 two-app project, targeted to Settings spacing, MFA key validation, USDT inventory and combined buy/sell, audited void actions and authorized project lookup.

## Completed in this environment

- Checked all TypeScript/TSX sources for TypeScript parser syntax errors.
- Checked all CSS rules with `tinycss2`, including the new Settings and inventory styles.
- Checked backend/frontend relative imports and file structure.
- Executed three dependency-free native Node tests for `scripts/repair-security-env.mjs`: missing keys are generated, valid settings remain unchanged on repeat, invalid nonempty MFA keys are not overwritten.
- Inspected source-level API routing order: lookup and inventory routes precede generic `/:entity` routes, while `POST /usdt/:id/void` is a distinct endpoint.
- Checked packaged ZIP entries and archive CRC integrity.

## Not verified here

- Full TypeScript *typecheck* / Vite production build (project node_modules not installed in this environment).
- MongoDB transactions for the paired buy/sell or void/inventory flow (requires an actual replica set).
- Live auth/MFA setup and TOTP login against your existing environment.
- Playwright browser layout / screenshot comparisons, and existing data migration against a real customer database.

**Do not treat this as production sign-off** until these checks pass in staging. You should also confirm a full database backup, securely stored stable MFA key, and a rollback plan.

## Manual acceptance tests (disposable/staging data only)

1. `/api/ready` returns HTTP 200 and `database: connected`.
2. Sign in, visit Settings → My profile, update and save name. Check layout on desktop/mobile.
3. Settings → Security: setup with password, enter generated secret in authenticator, verify current 6-digit code, sign out and complete MFA login. Ensure invalid OTP is rejected.
4. Advisory company → USDT: record `5000 USDT` buy at `100` and optional sell price `101`. Verify linked buy + sell, `₹5,000` realized profit and 0 newly held USDT.
5. Record an open buy of 200 USDT; verify the inventory shows 200. Record a sell of 50; verify inventory decreases by 50 and realized P&L uses the purchase price.
6. Attempt to sell more than available: error is clear and no partial trade is recorded.
7. Void the sale; inventory restores to 200. Void the buy; inventory returns to prior total. Verify audit history.
8. Try voiding a buy with dependent posted sells: system rejects until linked sales are voided.
9. Finance → Invoice: choose authorized client, see matching projects plus unlinked legacy projects. Save with a matching project; reject mismatched linked client and project.
10. Sign in as a Learning-only user and confirm cross-company project details aren't exposed.
