# Bitstek Workspace v5.5 — Role Flow, API and QA

## Role decision (confirmed)

**Super Admin → Owner → Team**, no fourth selectable role. `isSuperAdmin` is a protected global User flag. Owner/Team are company memberships; one user may hold Owner in Learning, Team in Advisory, and no membership in IT & Products.

**Owner has all business modules inside their assigned companies.** Owner can create and manage Team users, but **cannot assign Owner or change the Super Admin account**. Super Admin can assign Owner or Team in any active company. Team has only the modules and actions explicitly granted. Finance maker–checker separation applies to every role.

## Access flow

1. Owner opens **Settings → Team & Access** and selects a company.
2. **Add member** creates a new identity or grants company membership to an existing identity. Team permission fields are available per module.
3. **Assign companies** on an existing member opens the multiselect drawer. Pick one or more unassigned companies. Owner can only grant Team in companies they own; Super Admin can grant Owner or Team in any company.
4. **Edit member** modifies exactly the selected company membership. Changing permissions cannot silently orphan active assignments; use the removal/handoff workflow first if required.
5. **Remove access** first calls impact preview, shows a breakdown of active tasks/projects/reviews, and requires an eligible replacement when needed. Membership is marked removed only after the transactional handoff. Other company memberships and historical financial records are untouched.
6. **Deactivate** is blocked if a member still holds active responsibilities. Neither Owner nor Super Admin can remove their own membership with the standard member controls. The final company Owner cannot be removed.

## API endpoints

All endpoints require the existing secure cookie session and CSRF protection on writes. Company-specific requests use the `x-company-id` header.

| Endpoint | Function |
|---|---|
| `GET /api/admin/users` | Managed-company member roster |
| `POST /api/admin/users` | Create member in selected company |
| `POST /api/admin/memberships` | Grant membership in selected company |
| `GET /api/admin/users/:id/company-access` | Current company assignments |
| `POST /api/admin/memberships/bulk-assign` | Grant one or more additional company memberships atomically |
| `PATCH /api/admin/users/:id/edit` | Edit role/permissions in selected company |
| `PATCH /api/admin/users/:id/active` | Activate/deactivate one membership |
| `GET /api/admin/memberships/:userId/impact` | Preview active responsibilities |
| `DELETE /api/admin/memberships/:userId` | Remove company membership with optional `replacementUserId` and auditable handoff |
| `POST /api/admin/users/:id/reset-password` | Super Admin password reset; excluded for Super Admin account |

For a **single company** create/edit/remove, the request must select the company explicitly; consolidated `all` mode is for reading and company assignment.

### Example grant payload

```json
{
  "userId": "EXISTING_USER_OBJECT_ID",
  "companyIds": ["COMPANY_A_OBJECT_ID", "COMPANY_B_OBJECT_ID"],
  "role": "team",
  "permissions": ["learning:write", "projects:read"]
}
```

Only authenticated administrators can call this endpoint. Do not send passwords, MFA keys or tokens in these requests.

## Migration procedure

Use an Atlas/local MongoDB backup; preserve backend `.env` secrets. Run:

```powershell
cd backend
npm install
npm run migrate:v5.5:dry
npm run migrate:v5.5
npm run dev
```

Dry run reports legacy membership counts without writing. Migration grants prior Manager/Admin the previous full operational ability as Team permissions; it does NOT promote anyone to Owner. Existing Super Admin flag is preserved. **Running `npm run seed` on existing company data is not part of the upgrade.**

### Super Admin bootstrap for installations that have no designated global administrator

If needed, confirm the intended account is already an active Owner and use the controlled bootstrap in the existing v5 migration **BEFORE** the v5.5 migration. Use this only when you explicitly want to designate the trusted workspace administrator:

```powershell
$env:ALLOW_SUPERADMIN_BOOTSTRAP='true'
$env:SUPERADMIN_EMAIL='existing-owner@example.com'
npm run migrate:v5
Remove-Item Env:ALLOW_SUPERADMIN_BOOTSTRAP
Remove-Item Env:SUPERADMIN_EMAIL
```

Do not rerun `migrate:v5` afterward. Do not create Super Admin through a normal invitation form.

## Manual staging acceptance tests

- **Super Admin:** receives all active companies, sees all modules, can assign Owner/Team, edit Owners, reset non-super-admin passwords, and change branding.
- **Owner in Learning only:** sees Learning only; cannot read IT & Products records via `x-company-id` forgery; can add/remove only Team in Learning; cannot grant Owner.
- **Team in Advisory + IT:** sees only those two company options; sees only granted modules; no access to Learning even by copying a URL or API call.
- **Team with `projects:read`:** can view Projects but receives 403 when trying create/edit through API. Add `projects:write` and retry after new sign-in.
- **Assign 2 companies:** exactly two memberships are created; existing memberships retain original roles; assigning a company twice returns a clear 409.
- **Edit:** role or permission changes affect exactly one selected company; other company memberships are unchanged; affected session is invalidated.
- **Removal with responsibilities:** request without replacement returns 409; with a valid replacement, active assignments are transferred and audit records remain attached to the original user. Invalid or self-approving replacement is blocked.
- **Final Owner:** cannot be removed until another Owner exists; Super Admin remains a protected workspace account.
- **MFA, login/logout, finance approval:** continue working with the original encryption/JWT keys and maker–checker rules.
- **Live deployment:** run backend TypeScript tests, frontend Vite build, MongoDB transaction tests and browser flows before production use.

## Known verification limits

No live MongoDB/browser test was run in the build environment. Source tests cannot establish the runtime behavior of session cookies, CORS/rewrite configuration, Atlas transactions or a deployed Render instance. Test with a staging DB and account matrix before using production.
