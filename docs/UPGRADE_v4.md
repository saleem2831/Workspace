# v4 Upgrade Notes and Requirements Coverage

Legend: **Implemented in source** means a change exists but has not passed live end-to-end testing. **Partial** means workflow or integration scope remains.

| Request | Status | Notes |
|---|---|---|
| Slow module loading | Implemented in source | React Query cache, paging, skeletons, summary endpoint. Root network latency must be profiled against actual deployment. |
| Task assignment and delete | Implemented in source | Assigned member selector; soft archive with confirmation. |
| Google/Zoom meeting links | Implemented in source | Manual HTTPS links, not OAuth auto-creation. |
| Student field label | Implemented in source | Name label for student title. |
| Mentor master data | Implemented in source | Master tab and dependent dropdowns. |
| Batch students / seats left | Implemented in source | Occupancy endpoint + group detail. |
| Student fees and installments | Partial | Initial full-fee installment auto-created; collection updates outstanding. Payment-plan splitting and scheduled due dates need a dedicated workflow. |
| Internship offer/certificate upload | Implemented in source | Private file API with download. Virus scan and S3 not implemented. |
| Learning dashboard values | Implemented in source | Replaces several text placeholders with calculated counts. |
| Trader master (Indian/forex) | Implemented in source | Trader record and linked account. |
| Trading performance filter/charts | Implemented in source | Account/date-specific realized P&L. |
| Capital deposit/withdrawal/transfer | Implemented in source | Approved same-currency settlement changes account capital. External broker/wallet movements not automated. |
| USDT buy/sell and profit | Implemented in source | Buy-lot matching + realized P&L; no fees/broker settlement. |
| Client → lead fields | Implemented in source | Contact and email auto-filled. |
| Lead ownership | Implemented in source | User dropdown. |
| Sales stage drag/drop | Implemented in source | HTML5 drag/drop; backend PATCH. |
| Proposal data inheritance/templates | Partial | Lead amount, owner, editable template content and file upload. PDF/DOCX generation from template not implemented. |
| Product owner / client links | Implemented in source | User and client selectors. |
| Subscription chart + reminders | Implemented in source | Renewals chart and in-app counts; no email/WhatsApp notifications yet. |
| Subscription start/duration | Implemented in source | Today by default; 1/2/3/4/6/9/12 month choices. |
| Project client and milestone timeline | Implemented in source | Milestones grouped in project record. |
| Invoice linked client/project and reviewer | Implemented in source | Linked project can fill client. |
| Vendor master | Implemented in source | Company-scoped vendor entries. |
| Multiple alternative approvers | Implemented in source | Multi-select approvers, any one eligible approver can decide. |
| Approval notifications | Implemented in source | Company/assignee-scoped counts in top bar. |
| Detailed reports | Partial | Expanded KPI cards, report scope, charts and existing financial summaries. Audited statements and full analytical reporting need additional specifications. |
| Company-restricted users | Implemented in source | Server-enforced membership + module grants. |
| Simpler roles | Implemented in source | New roles Owner/Manager/Staff/Viewer. Legacy roles retained for safety. |
| Workspace name/logo | Implemented in source | Owner-only workspace branding + protected image endpoint. |
| Remove demo banner | Implemented in source | Banner removed; VITE_DEMO_MODE false by default. |
| Profile and password | Implemented in source | Profile change; current-password check and session invalidation. |
| Submission/loading animations | Implemented in source | Skeletons and save-button spinner; no global real-time notification websocket. |

## Architecture & limitations

- One frontend / one backend, independent installation and run commands, REST API via `/api`.
- Existing v3 collections are retained. New models, optional fields and indices are additive; a migration command handles initial missing fee installments.
- Records and uploads use company-scoped access checks; the private upload directory must be backed up.
- New role grants do not automatically overwrite older memberships.
- Avoid running against production data until test scenarios and backups have been verified.

## Important validation checklist

1. New student fee INR 65,000 → exactly one pending installment of INR 65,000; receipt INR 10,000 → student outstanding INR 55,000.
2. Batch seats 10 with two assigned students → 8 available; 11th student rejected at capacity.
3. New lead selects existing client → contact/email copied; assigning member and dragging stage persists after refresh.
4. Proposal selects lead → inherited amount/owner; attached document downloads through signed-in account.
5. Approvals assigned to two eligible users → either can approve; requester cannot approve; third unassigned user cannot approve.
6. Trading account A withdraws → balance falls only after approved settlement; transferring to B increases B atomically; second settlement rejected.
7. USDT 5,000 × 100 purchase → 5,000 × 101 sale → INR 5,000 realized; attempt to oversell is rejected.
8. Asad assigned only to Learning → no access to Advisory/Sales/Finance records, even via direct API; authorized Owners see all assigned companies.
9. Profile update persists; password change requires old password and revokes session.
10. Pagination, search, loading, no-API error, document permissions, and keyboard closing of drawers all behave correctly.
