# Bitstek Workspace v6.2.7 — Origin Fix, AI Credits, GitHub / Render / AWS Deployment

## A. Cause of subscription plan `403 Origin rejected`

This occurs in `backend/src/lib/security.ts:csrfGuard`, **before** the plan route runs. The HTTP `Origin` request header was not equal to backend `WEB_ORIGIN` in v6.2.6. The fix shares a normalized exact allowlist between Express CORS and CSRF; no wildcard origins are allowed.

Inspect DevTools > Network > `PATCH /api/platform/plans/...` > **Request Headers > Origin**. If browser is `http://localhost:5173`, backend must have `WEB_ORIGIN=http://localhost:5173`. If browser uses `http://127.0.0.1:5173`, explicitly include this as `WEB_ORIGINS=http://127.0.0.1:5173` (or, preferably, consistently use `localhost`). Restart backend after .env edits.

Run `GET http://localhost:5000/api/ready`. If browser displays CORS errors, verify API reaches intended backend and Vite proxy settings. A remaining `403` with **different message** (`Invalid CSRF token`, or `MFA-enabled Platform Owner required`) needs different remediation; do not disable CSRF or MFA.

## B. Local setup, frontend and backend independent processes

**Backend** `backend/.env` (these lines are examples; keep your existing valid MongoDB URI/JWT/MFA keys):

```env
NODE_ENV=development
PORT=5000
WEB_ORIGIN=http://localhost:5173
WEB_ORIGINS=
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
TRUST_PROXY=false
SERVE_FRONTEND=false
# MONGODB_URI=<your existing URI>  <-- in a PRIVATE file, never commit
# JWT_SECRET=<existing>           <-- preserve existing account sessions if feasible
# MFA_ENCRYPTION_KEY=<existing>   <-- NEVER rotate without MFA recovery plan
STORAGE_BACKEND=local
```

**Frontend** `frontend/.env`:

```env
VITE_API_BASE_URL=/api
VITE_BACKEND_URL=
VITE_DEV_PROXY_TARGET=http://127.0.0.1:5000
VITE_APP_TITLE=Bitstek Workspace
VITE_DEMO_MODE=false
```

```powershell
# Terminal A
cd backend
npm install
npm run typecheck
npm test
npm run dev

# Terminal B
cd frontend
npm install
npm run typecheck
npm run build
npm run dev
```

Open exactly `http://localhost:5173`, log in as MFA-enabled Platform Owner, and update an unused test subscription plan. In DevTools check `Origin: http://localhost:5173`, `PATCH` success, and backend `WEB_ORIGIN` as above. You do **not** need a new database or bootstrap for this patch.

## C. GitHub repository (existing folder with `frontend/` and `backend/`)

1. Make a private GitHub repository (e.g. `bitstek-workspace`). Keep the two folders and `render.yaml` at repository root. Don't upload archives, private documents, credentials, MongoDB exports, generated `.env` files or old database backups.
2. `.gitignore` ignores `.env`, `.env.*` except safe `.example` templates and local private uploads. Run `git status --short` and verify **no secret files** were staged.
3. If repo is new, in the repository root:

```powershell
git init -b main
git add .
git status --short
git commit -m "Bitstek Workspace v6.2.7 origin and API deployment fixes"
git remote add origin https://github.com/YOUR-ORG/YOUR-PRIVATE-REPO.git
git push -u origin main
```

For an existing Git repo, use `git add`, `git commit`, `git push` instead of reinitializing or overwriting its remote. Never push live `.env` or passwords. Previously exposed MongoDB/password/JWT secrets must be rotated or recovered with care.

## D. Render: two services, same-origin /api proxy **recommended for onrender.com hosts**

1. Render **New > Web Service**, connect the private GitHub repository:
   - Root directory `backend`
   - Node 24
   - Build `npm install --include=dev && npm run build`
   - Start `npm start`
   - Health check `/api/ready`
   - Production env from section F (private variables on backend only).
2. Deploy backend first and test `https://YOUR-API.onrender.com/api/ready` returns JSON `database: connected`.
3. Render **New > Static Site**, select same repository:
   - Root directory `frontend`
   - Build `npm install --include=dev && npm run build`
   - Publish `dist`
   - Environment `VITE_API_BASE_URL=/api`, `VITE_BACKEND_URL=` (blank), `VITE_DEMO_MODE=false`.
4. Add Static Site **Redirects/Rewrites**, in this order:
   - `/api/*` -> `https://YOUR-API.onrender.com/api/*` **Rewrite**
   - `/*` -> `/index.html` **Rewrite**
5. Set backend `WEB_ORIGIN=https://YOUR-FRONTEND.onrender.com`, `COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax`, `TRUST_PROXY=true`. Trigger backend redeploy/restart after setting.
6. Verify `https://YOUR-FRONTEND.onrender.com/api/ready` returns backend JSON, **not** React HTML. Verify login/MFA, plan update, CSV uploads, invitation activation and cross-tenant isolation. Browser session cookies and CSRF must be tested through the rewrite; do not assume success from `/api/ready` alone.

`VITE_BACKEND_URL` is intentionally blank in this deployment because the **Render rewrite** contains the backend hostname. A direct `https://api-service.onrender.com` frontend-to-backend request from a different `onrender.com` hostname can run into third-party-cookie restrictions. If Render's rewrite does not correctly forward cookies/headers in your environment, use the repo's existing one-service `render.yaml` or an authenticated reverse proxy under your custom domain.

## E. AWS / custom domain: backend URL inside frontend (direct, two-host mode)

Use for example **HTTPS** `https://app.example.com` on Amplify or CloudFront, and `https://api.example.com` on an ALB/ECS/EC2 service. These hostnames share one registrable site and avoid most third-party cookie issues.

**Frontend build variables** (AWS Amplify, etc.):

```env
VITE_BACKEND_URL=https://api.example.com
VITE_API_BASE_URL=/api
VITE_APP_TITLE=Bitstek Workspace
VITE_DEMO_MODE=false
```

Browser API calls now go to `https://api.example.com/api/...`. Do **not** put `/api` at the end of `VITE_BACKEND_URL`.

**Backend runtime variables:**

```env
NODE_ENV=production
WEB_ORIGIN=https://app.example.com
WEB_ORIGINS=
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
TRUST_PROXY=true
SERVE_FRONTEND=false
STORAGE_BACKEND=s3
# MONGODB_URI, JWT_SECRET, MFA_ENCRYPTION_KEY, AWS IAM / bucket secrets -> backend only
```

V6.2.7 provides `GET /api/auth/csrf` for frontend JS to retrieve a CSRF token even when the API cookie is on `api.example.com` (therefore inaccessible to JS on `app.example.com`). Axios retains `withCredentials:true`; CORS only allows `WEB_ORIGIN`/`WEB_ORIGINS`. The session cookie stays HttpOnly.

`COOKIE_SAMESITE=none` is only for HTTPS **cross-site** browser calls and requires `COOKIE_SECURE=true`; browser privacy settings may still block third-party cookies, so a same-site custom domain or same-origin reverse proxy is strongly preferred. Test in Chrome, Firefox and Safari.

If your app is served from several different tenant subdomains, do not set wildcard CORS. The current allowlist supports explicit origins, not secure dynamic tenant-origin validation. Either proxy all SaaS requests through a single app origin or develop validated per-tenant origin resolution before enabling arbitrary tenant hostnames.

## F. Other required deployment settings

- `NODE_ENV=production`, no hardcoded `PORT` on Render (Render assigns it).
- Keep `WEB_ORIGIN` **exactly** the frontend origin (scheme, host and port), no path.
- Private S3 storage: `STORAGE_BACKEND=s3`, `S3_BUCKET`, `AWS_REGION`, restricted credentials or role. Uploaded files from local storage are **not** migrated merely by setting `s3`.
- Preserve existing production database, user passwords, JWT/MFA keys unless following a controlled rotation; no fresh bootstrap or seed.
- Don't deploy demo bootstrap flags or infrastructure migration keys; don't expose `MONGODB_URI` or `OPENAI_API_KEY` to Vite.
- `VITE_` variables are compiled into static frontend at build time: changes require a frontend rebuild/redeploy.
- Check credentials in GitHub commit history and rotate leaked secrets; removing an exposed value in the latest commit is not enough.

## G. AI credits: current actual behavior

`SaaSPlan.aiMonthlyCredits` is stored with plans and transmitted by Platform Console. The current `/api/insights/summary` endpoint computes existing business data counts; it does **not** call a language model. There is an `AiUsage` model but **no implemented reservation/debit, monthly reset, model pricing or billing enforcement**. `OPENAI_API_KEY` is unused by the current rules-based business insights.

Before selling AI credits as a feature implement: tenant-scoped credit ledger, policy for per-action credits, atomic reservations/finalization/refunds, tenant cycle boundaries, low-balance errors, provider/token cost tracking, operator audit and rate limits. Do not charge credits for an action unless it has a verifiable completed result.

## H. Acceptance tests

- [ ] `npm run typecheck`, `npm test`, and frontend build pass.
- [ ] Local `PATCH /api/platform/plans/:id` succeeds with matching Origin and MFA-enabled Platform Owner.
- [ ] A mismatching Origin receives a 403.
- [ ] `GET /api/auth/csrf` returns JSON with a cookie; authenticated cross-host PATCH passes in a real browser.
- [ ] Frontend build with `VITE_BACKEND_URL` calls the correct external `/api` hostname.
- [ ] Login/MFA, logout and session invalidation remain correct across both deployed origins.
- [ ] Existing Bitstek and Advancerex tenant data, storage, permissions and billing metadata remain intact.
- [ ] No secrets are committed to GitHub.

**Release note:** v6.2.7 is a source patch; no full live MongoDB, Render or AWS acceptance testing was possible here. Validate in staging prior to production use.
