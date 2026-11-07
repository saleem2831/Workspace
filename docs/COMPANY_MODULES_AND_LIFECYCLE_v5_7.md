# Bitstek Workspace v5.7 — Company configuration and lifecycle specification

## Design intent

A **vertical is a preset**, not a hard restriction. Company capability is a saved `Company.enabledModules: string[]` property. Authorization is the intersection of **company membership**, **enabled modules**, and **role/Team permissions**. No app may bypass backend checks by displaying a sidebar or choosing a company ID in the browser.

Company fields include `_id`, `name`, unique `code`, `vertical`, `currency`, `timezone`, `active`, `enabledModules`, and `deactivatedAt`. Legacy companies missing `enabledModules` use vertical-derived defaults until the migration is applied. An explicitly empty list does not fall back to defaults.

## Key examples

- Learning Owner sees Home, Today, Work Board, Calendar, Learning, Sales, Finance, Approvals, Reports, Settings. Not Advisory, Products or Projects by default.
- Advisory Owner sees Advisory and shared modules. Super Admin may enable Products/Projects later; products and projects remain scoped to **Advisory's company ID**.
- IT Owner sees Products, Projects and shared modules by default, not Learning or Advisory.
- Team with `learning:write`, `finance:write`, `approvals:write` in Learning sees only those enabled modules, plus Home/Today/Settings. It cannot load other modules by a direct REST API request.
- An Owner assigned to multiple companies sees different modules, records and dashboards when switching companies; previously disabled features do not leak through `/api/records`, lookups, or workflows.
- New company forms choose a vertical preset but may select arbitrary enabled modules. After creation, company Owners/Team users are assigned in Team & Access.

## Lifecycle

The deletion sequence is **impact → export → resolve/migrate eligible records → deactivate or conditional delete**. You cannot hard-delete a company with invoices, journal entries, documents, payroll/student finance or business records. An archive is not a substitute for legal/accounting retention. Exports are sensitive TAR.GZ files and must be secured.

### Supported automated migration

**Operations only:** tasks, task updates and events. The migration checks source/target are active, modules are enabled on target, target membership exists for assigned people, and tasks have no links to un-migrated business records. One MongoDB session transaction moves the records and logs source/destination audit events. Operations may be migrated without moving the company's entire finance or learning system.

**Not automatically migratable:** students/courses/batches/fee installments, clients/leads/proposals, products/subscriptions, projects/milestones, advisory account history, approved finance, posted journals, intercompany transfers and attachments bound to those records. Export instead; do not rewrite IDs or historical `createdBy` fields without an approved migration specification.

### Approval and operational safeguards

A company with pending approvals/open invoices or certain unpaid expenses cannot be deactivated. Disabling sensitive modules with unresolved obligations is rejected. Disabling populated but non-critical modules shows an impact warning and requires confirmation. Disabling a module retains data, which becomes inaccessible via ordinary module screens until re-enabled.

## API samples

Create an Advisory company with optional Projects and Products:

```json
{
  "name": "Example Advisory",
  "code": "EXADV",
  "vertical": "Advisory & Trading",
  "currency": "INR",
  "enabledModules": ["operations", "advisory", "sales", "products", "projects", "finance", "approvals", "reports"]
}
```

Change enabled modules: `PATCH /api/admin/companies/:id` with `{ "name", "vertical", "currency", "enabledModules" }`. After an impact warning, resend with `"acknowledgeImpact": true` **only after reviewing the risk**.

Deactivate: `POST /api/admin/companies/:id/deactivate` with `{"confirmation":"EXADV"}`.

Migrate: `POST /api/admin/companies/:id/migrate-operations` with `{"targetCompanyId":"<id>","confirmation":"MIGRATE EXADV"}`.

Delete: `DELETE /api/admin/companies/:id` with `{"confirmation":"DELETE EXADV","acknowledgeExport":true}`. Even with confirmation, the API refuses deletion when company data exists.

## Acceptance testing checklist

1. Log in with an Owner belonging to Learning only; verify no Advisory, Products or Projects navigation and direct API calls return 403.
2. Log in with an Owner of IT; verify products and projects, but no Learning/Advisory.
3. Super Admin enables Products and Projects on Advisory; reload and verify both render, and new projects/products use Advisory's company ID.
4. Disable Products on Advisory (after impact review); navigation disappears, API access is rejected, data remains in MongoDB; re-enable and confirm records reappear.
5. Team user with Learning-only permission never receives Advisory/Projects data, even by changing API `x-company-id` header.
6. Create a General/Custom company, assign Owner and Team users, and verify the vertical does not force a fixed module set.
7. Add a private document and an ordinary record. Export TAR.GZ; verify `manifest.json`, `records.ndjson` and `documents/` files; do not expose the archive publicly.
8. Verify hard deletion is rejected when records or external transfer references exist. Deactivate a company only after obligations are settled.
9. Create an empty demo company and verify confirmation-protected deletion, retained audit event, and no remaining memberships.
10. Move operations records to another active company with authorized assignees; ensure task/event records are moved and audit logs written, and other module data remains in the source.
11. Validate a legacy v5.6 company using dry-run migration, migrate once, and confirm no role, MFA or financial data changed.
12. Test frontend/backend builds, route security and end-to-end browser workflows before production rollout.
