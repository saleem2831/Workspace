# v5.4 — Multi-company Manager access and company data isolation

## Objective

A user may be a Manager of one, two, or more companies. Each company has its own membership and role. There is **no global Manager role that automatically grants access to all companies**.

## What changed

- **Settings → Team & access → Assign companies** opens a multi-company assignment panel for an existing user.
- An authorized Owner can select one or several **new** companies and choose a common role (Owner / Manager / Team / Viewer).
- Existing active memberships are displayed and cannot be silently changed by this form; use **Edit member** with the correct company selected.
- The backend performs all-or-nothing MongoDB transaction writes for the requested company assignments; requests naming an unassigned/unmanaged company are rejected.
- Manager role has full business module read/write access **within each assigned company** but cannot grant Owner or Manager privileges to another person.
- The top-left company selector lists only companies assigned to the signed-in account. Non-owner roles see a single selected company by default, never an All Companies aggregation.
- Switching companies remounts the active business page, avoids prior-company placeholder data, and updates the API request scope.
- Record lists, insight queries, client/project/bank-account lookup APIs, and file download authorization respect the selected company scope.
- The session endpoint refreshes periodically and on focus so newly assigned companies appear without requiring the administrator to recreate the user.
- No schema migration is needed. Existing `Membership` documents already support one user in multiple companies.

## Example

| User | Bitstek Learning | Bitstek Advisory | Bitstek IT & Products |
| --- | --- | --- | --- |
| Workspace Admin | Owner | Owner | Owner |
| Kumayl | Manager | Not assigned | Manager |
| Asad | Team (Learning only) | Not assigned | Not assigned |

When Kumayl chooses **Bitstek Learning**, the dashboard, tasks, lists, linked records, and reports are scoped to Learning. When he switches to **Bitstek IT & Products**, those views reload for IT only. Advisory will not appear in the company picker or respond through the API for Kumayl.

## Exact admin steps

1. Sign in as an **Owner** with access to every company you want to grant.
2. Open **Settings → Team & access**.
3. In **All accessible companies** (Owners only), find the member and click **Assign companies**.
4. Choose **Manager** as the new role.
5. Check one or more additional companies and click **Assign**.
6. The member can switch among the newly assigned companies in the header. If their session is already open, refresh the page or allow the session query to update.
7. To edit a user's role in an existing company, choose that company in the top selector and use **Edit member**. To revoke one company, use **Remove** with the existing assignment-handoff safeguards.

## Security rules

- The Owner may grant Manager access only in companies where they are already an Owner.
- Managers may assign Team/Viewer in companies they manage, but cannot make another Manager or Owner.
- Managers cannot see or assign unrelated companies, even by changing the URL or request header.
- No cross-company record aggregation is offered to Managers; Owners may see an All Companies aggregate if they have Owner access to all assigned companies.
- Audit entries are written for each newly assigned membership, recording the target company and role.
- An inactive member must be reactivated through permitted controls; existing memberships are not overwritten by the bulk assignment form.
- The backend is the security boundary; sidebar filtering alone does not grant or restrict access.

## Test checklist

- [ ] Owner grants an existing Manager both Learning and IT while preserving their current Advisory membership.
- [ ] The Manager sees only these assigned companies in the header and can switch between them.
- [ ] Learning dashboard/records show Learning data only and change to IT data after switching.
- [ ] Manager cannot select unassigned company IDs in the URL or `x-company-id` request header.
- [ ] Manager cannot use `x-company-id: all` to aggregate records from multiple companies.
- [ ] Direct access to an unassigned company document or record returns an authorization failure.
- [ ] Manager cannot grant Owner or Manager status; an Owner can grant Manager within their Owner companies.
- [ ] Editing membership for one company does not modify membership in another.
- [ ] No previous-company values flash while loading after a switch.
- [ ] Removal of a company membership with active assignments invokes the existing responsibility-handoff workflow.

## Verification limitations

Static source parsing and role/selection policy assertions are available in this build. Live transactional assignment tests, real MongoDB authorization tests and end-to-end browser tests must still be performed in a staging environment.
