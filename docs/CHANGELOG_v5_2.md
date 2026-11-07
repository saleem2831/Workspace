# Bitstek Workspace v5.2 — Changes

1. **Approvals:** Expose explanation when request creator is assigned as reviewer; protect maker/checker separation. An Owner may reassign pending requests to eligible active members. The reviewer then sees approve/reject controls; rejection requires a comment. Decisions work from All companies view using explicit authorized company header.
2. **Team & access:** Member removal opens a reassignment drawer. Backend returns counts of active assignments and atomically transfers operational owner/reviewer/assignee fields before deactivating membership, with audit entry. Historical authors and financial history remain intact. Last Owner cannot remove themselves or leave company ownerless.
3. **MFA:** Scan a locally rendered authenticator enrollment QR using `qrcode.react`. No third-party QR generation service. Manual setup key still available.
4. **USDT:** Added an easily discovered Void selected trade action while retaining existing audited reversal behavior. Financial trade data is never physically deleted by generic Delete actions.
5. **Navigation performance:** In-memory TanStack Query cache increased to 2-minute freshness / 15-minute retention; switching to the current company no longer unnecessarily invalidates everything. Login/logout still clears sensitive client cache; no financial records are persisted offline.
6. **Render:** Includes `render.yaml`, `.node-version`, `scripts/render-build.sh`, production SPA serving, secure cookie configuration and a detailed Render guide. Same-origin serving avoids cross-site CSRF cookie problems. Persistent disk included for local uploads.

**Verification status:** Parsed source files and structural checks are possible offline; full npm build, MongoDB integration and browser verification remain required locally/CI.
