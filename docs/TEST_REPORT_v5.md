# Bitstek Workspace v5 — Verification record

**Source:** v4 two-app baseline plus the November 5 requirements and screenshots/videos. Checks completed in the authoring sandbox. **This is not a production release certification.**

## Passed static checks

- Exactly two independently installable applications (`frontend`, `backend`); structure script passes.
- TypeScript/TSX syntax/transpilation parse across **37** source files, 0 parse diagnostics. This is not the same as a full `tsc` typecheck.
- Frontend CSS parsed, zero top-level parse errors.
- **95** relative import locations checked, zero unresolved relative imports.
- MFA RFC6238 six-digit known-answer TOTP test passed using the Node crypto implementation.
- MFA secret AES-256-GCM encryption/decryption roundtrip passed.
- TOTP replay counter rejection passed.
- Calendar-month renewal clamps Jan 31 to February 28/29 in non-leap/leap years.
- ZIP integrity and required file presence are checked on packaging.

## Not executed / blocked here

- `npm install` for both apps (remote dependency registry inaccessible / timed out).
- `npm run typecheck` with resolved dependencies, full frontend production build, backend compiled build.
- MongoDB integration, transactions, migration against a seeded v4 clone, API smoke test.
- Live browser workflows, visual regression, MFA login in live browser, real Google/Zoom integrations.
- Performance baselines, security audit, accessibility audit, and staging/production deployment.

## Staging smoke checklist

- [ ] Login, session expiration, profile edit, password change, MFA setup/enable/login/disable.
- [ ] Owner vs Team module permissions in each company; restricted Learning user blocked from other company API data.
- [ ] Work Board immediate drag, rollback when backend rejects, multi-person assignment, archive.
- [ ] Calendar meeting link, cancel, postpone, edit, archive.
- [ ] Student country code, batch seats/student list, new student fee installment and collection.
- [ ] Internship offer letter/certificate upload and authenticated download.
- [ ] Trading account Live/Demo, capital request with two reviewers, maker-checker decision, settled balance.
- [ ] USDT 5,000 buy at ₹100 and sell at ₹101 yields +₹5,000; oversell fails.
- [ ] Sales lead/client auto-fill, owner assignment, drag-and-drop, proposal attachment.
- [ ] Products auto SKU, client-linked subscription, 1/2/3/6/12 month renewal dates.
- [ ] Project client link and milestone description/file.
- [ ] Finance invoice client/project lookup, any-one approval, posting, payment, bank-account selectors, financial history not deleted.
- [ ] Approvals supporting record/source company, correct notification counts.
- [ ] Team & Access activation/deactivation/removal, Super Admin-only password reset.
- [ ] Dashboard load, error/empty states, responsive layout, chart/tab consistency.

## Load and reliability targets (proposed, not measured)

- API list-read p95 target under 500 ms at normal expected internal workload on staging.
- Task drag/drop visual update immediately, with server failure shown and state reverted.
- No incorrect cross-company reads/writes; transactions are atomic under concurrent use.
- No unexpected spinner beyond a few seconds without a clear error/retry state.
