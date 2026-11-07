# Bitstek Workspace v5.2 — Render deployment

## Deployment shape

This repository continues to contain exactly two applications: `frontend/` (React + Vite) and `backend/` (Express + MongoDB). For production, the React `dist/` is built and served by the Express server on **one HTTPS origin**. This avoids cross-site cookie/CSRF problems with the application's current authentication implementation. In local development, both applications can run independently.

The included `render.yaml` is a Render Blueprint for **one paid Node web service** with a **persistent disk**. A persistent disk is required for the backend's current local private document-upload implementation. For multi-instance scaling or independently deployed frontend/backend services, first migrate documents to private S3 and revisit cross-origin cookie/CSRF design; do not treat the current filesystem storage as durable on a diskless Render service.

## Before deploying

1. Back up your current MongoDB database and `backend/.env`. **Never commit** either `.env` file or secret keys.
2. Create a **private** GitHub repository and push the unpacked project. Check `git status` to ensure no `.env`, `node_modules`, or private uploads are tracked.
3. Provision MongoDB Atlas as a replica-set-backed database. Create a database user with a strong password and allow your Render service's egress address according to your network policy. Avoid unrestricted public access where possible.
4. Use Node.js **24 LTS** (`.node-version` is included). The supported Render Node.js env variable is `NODE_VERSION`.
5. If migrating accounts with MFA already enabled, **reuse the original exact `MFA_ENCRYPTION_KEY`**. Never rotate it without a managed key-migration procedure.

## Create the Render service

1. In Render, choose **New > Blueprint** and connect the private repository. Render reads `render.yaml`.
2. Blueprint creates `bitstek-workspace` Node web service on the paid Starter plan, mounts `/var/data`, builds frontend and backend, and runs `cd backend && node dist/server.js`.
3. At creation, supply `MONGODB_URI`, `JWT_SECRET`, and `MFA_ENCRYPTION_KEY` as secret environment variables. `JWT_SECRET` must be at least 32 random characters. `MFA_ENCRYPTION_KEY` must be **exactly 64 hexadecimal characters** (generate locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). Do **not** share secrets in chat or code.
4. Leave `WEB_ORIGIN` unset for the default `https://<service>.onrender.com`: the backend reads the `RENDER_EXTERNAL_URL` environment variable automatically. If attaching a custom domain, explicitly set `WEB_ORIGIN=https://your-domain` and redeploy.
5. Blueprint specifies `COOKIE_SECURE=true`, `TRUST_PROXY=true`, `SERVE_FRONTEND=true`, `UPLOAD_DIR=/var/data/private-uploads`. It binds the port from Render's `PORT` variable.
6. Wait for deployment to finish and test `https://<service>.onrender.com/api/health` and `/api/ready`. A ready endpoint returns HTTP 200 only when MongoDB is connected.
7. Open `https://<service>.onrender.com/`. Test sign-in, company selection, creating a task, approval reassignment, and MFA QR enrollment.

**Use a paid service and disk for uploaded PDFs/certificates.** Free/disposable Render instances lose local uploads during restarts/deploys. A mounted disk also limits scaling and prevents zero-downtime deployments. S3 private buckets with controlled downloads are the recommended longer-term solution.

## Alternative manual Render settings

Create **one Web Service** with repository root (blank root directory), Node runtime, build command `bash scripts/render-build.sh`, start command `cd backend && node dist/server.js`, health check `/api/ready`, Node 24, and the environment variables listed above. Mount persistent disk at `/var/data` and set `UPLOAD_DIR=/var/data/private-uploads`.

## Local development

```powershell
# In the project root: create config only if missing
node scripts/setup-local.mjs
# If migrating from an earlier v5 version, preserve old backend/.env and its MFA key
cd backend
npm install
npm run dev
```

Open another PowerShell terminal:

```powershell
cd frontend
npm install
npm run dev
```

The frontend uses its Vite `/api` proxy in development; the backend uses `http://localhost:5000`.

## Approval recovery test

1. Sign in as Admin, choose **Bitstek Advisory**, create a capital-movement request and assign Admin as reviewer. It is visible in the Approval Inbox, but the maker must **not** approve their own transaction.
2. Open the pending approval; the details clearly explain why action buttons aren't available to the requester.
3. If Admin has the Owner role, select **Reassign approvers**, choose the independent Finance Reviewer (or another eligible account), and save.
4. Sign out, sign in as the selected reviewer, open Approvals, and select the request. Now Approve and Reject are available; Reject requires a reason.
5. Confirm that a decided request cannot be decided twice and that the underlying capital movement's status updates.

## User removal with handoff test

1. In Settings > Team & Access select a company and click Remove on a member who owns active tasks.
2. The dialog displays responsibility counts and requires a replacement member; cancellation does not change anything.
3. Submit; verify the assigned tasks, pending review ownership, and user access. Historical createdBy, requestedBy, and audit entries remain unchanged.
4. Try removing the last Owner: the backend should reject it.
5. Try assigning a pending approval to its own maker: the backend should reject it.

## MFA scan test

1. Sign in, open Settings > Security and enter your password for enrollment.
2. Scan the QR code in Google/Microsoft Authenticator. The QR is rendered locally in your browser from the `otpauth://` value; no third-party QR API receives the secret.
3. Enter a current six-digit code; enrollment requires a subsequent sign-in.
4. Log in with password followed by a fresh authenticator code.

## USDT void test

1. Create a Buy transaction (inventory increases). Complete a Sell or a combined buy/sell; verify realized P&L.
2. Select a posted trade, choose **Void selected trade** or **Void / delete transaction (audited)** in the details drawer.
3. A Buy with dependent sales can't be voided until those sales are voided first. Voiding preserves an audit record and restores inventory when appropriate.
4. Check inventory totals after refresh. The app uses in-memory TanStack Query caching and targeted invalidation; **it does not store financial records in persistent browser storage**.

## Known limitations / release safety

- The previous source's backend and browser integration suites have **not been executed here** because npm packages and MongoDB runtime are unavailable in this environment. Run `npm run verify` in backend and frontend, and the authorized smoke tests on a **disposable database** before going live.
- This is a development release, **not audited accounting software**. Test authorization, concurrency, financial records, reconciliation and database backups before exposing to external users.
- The current source stores supporting documents on the private local filesystem. The Blueprint's paid disk helps with persistence on a single instance but is not a substitute for off-site backups or scalable object storage.
- Owner reassignment and user removal rely on MongoDB transactions: MongoDB Atlas or a local replica set is required.
