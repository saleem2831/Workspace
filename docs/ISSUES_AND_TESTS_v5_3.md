# v5.3 — Issue audit, fixes and verification

Reviewed the 81.53-second Team & Access recording supplied on 5 November 2026 and inspected v5.2 source.

## Diagnosed issues

| ID | Finding in v5.2 | Fix in v5.3 | Verification status |
|---|---|---|---|
| AUTH-01 | Login had no dedicated guarded startup path; an existing cookie could immediately show Home on a new tab. | Tab-local sign-in gate sends new tabs to `/login`, while a logged-in tab can refresh normally. | Source reviewed; live browser test pending |
| AUTH-02 | Logout navigated while the old session cache could still render Shell; login path was inside the authenticated route wildcard. | Logout clears the tab authentication flag and query cache before leaving protected UI; navigation uses `replace`. | Source reviewed; live browser test pending |
| TEAM-01 | Inline role selector wrote immediately, without a review/edit step. | Explicit Edit Member drawer with role, permissions, and Save/Cancel. | Source parsed; browser test pending |
| TEAM-02 | Manager appeared as generic “role-managed access”, and settings permission behavior was not clear. | Full module access for assigned company, shown with descriptive role label; privileged account administration reserved for Owner. | 5 isolated policy tests passed |
| TEAM-03 | No direct member-profile editing workflow. | Global identity fields editable only by Super Admin; membership role and module access editable by eligible Owner/Manager. | Source parsed; MongoDB integration pending |
| TEAM-04 | Last Owner could be demoted through role patch without an explicit last-owner safeguard. | Last active Owner guard and self-role-change guard. | Static source checks; concurrency stress test pending |
| TEAM-05 | Team UI was cramped and had many in-row controls. | Responsive cards, role/status tags, concise action buttons and drawer. | CSS syntax checked; visual browser test pending |

## Access policy

- **Owner:** all modules for the owned company; may administer membership roles, including Manager/Owner; workspace branding and password resets remain Super Admin functions.
- **Manager:** read and write across all modules of each company they are explicitly assigned to; can add/edit Team and Viewer memberships in those companies, but cannot grant Owner/Manager rights or edit owner accounts.
- **Team:** only explicitly granted module view/edit permissions.
- **Viewer:** only explicitly granted read permissions.
- No role gives access to a company without an active membership, and these controls are enforced by backend API logic (not only React navigation).

## Local test cases to execute with MongoDB and browser

1. Open a **new browser tab** to `http://localhost:5173`: should redirect to `/login`.
2. Sign in and land on Home. Refresh that same tab: should stay signed in.
3. Click Logout: login page should replace Home. Try the Back button: protected content should remain unavailable.
4. Log in as Manager of Company A: confirm full access to Learning, Projects, Sales, Finance, Reports, Settings for **Company A only**.
5. Assign Manager to Company A but not Company B: direct API requests selecting Company B must return 403.
6. Select Settings → Team & Access → Edit member; change role and selected permissions, then Save and refresh.
7. Sign in as Manager and attempt to promote a Team member to Owner: backend must return 403.
8. As Owner try demoting the last active Owner: backend must return 409.
9. As Super Admin edit a user's name/email and confirm it updates without changing memberships in other companies.
10. Verify standard User removal and reassignment still works from v5.2, and password/MFA flows still work.

## Checks performed here

- All TypeScript/TSX files parsed successfully with TypeScript compiler parser.
- `scripts/check-structure.mjs`: pass (single frontend, single backend).
- `scripts/tests/security-repair.test.mjs`: 3 passes.
- Pure access-policy tests (`backend/src/tests/access.test.ts`, transpiled with installed TypeScript): 5 passes.
- CSS parsing: no syntax errors.
- Relative source imports: checked.

**Not verified here:** npm installation/full typechecking or Vite bundle, live browser UI, backend MongoDB edits (especially transactions and privilege edge cases), and Render deployment. npm registry was inaccessible. This package is a tested-at-source development patch, not a full production-certified release.
