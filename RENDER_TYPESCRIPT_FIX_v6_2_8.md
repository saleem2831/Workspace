# Bitstek Workspace v6.2.8 — Render TypeScript build fix

## What failed

Render's backend build fails in `npm run build` / `tsc` with `TS2339` on `Company.name`, `Membership.role`, `StoredFile.originalName`, `Task.status`, `Invoice.amount`, etc.

**Root cause:** `backend/src/saas/tenant-context.ts` constructs a Mongoose schema from `Record<string, any>`. TypeScript infers only `{ tenantId: ObjectId }` for these dynamic schemas, losing the rest of the document properties.

## What changed

- `backend/src/saas/tenant-context.ts`: makes `tenantSchema()` generic, so the schema records all supplied property names (while retaining permissive value types for the dynamic legacy factory).
- `backend/package.json`: version bumped to `6.2.8`. No dependency changes.
- No runtime schema, business-data, or tenant-isolation-middleware changes; **no database migration**.

The model types in this incremental fix are permissive. A future hardening pass should replace dynamic model factories with named, strongly typed Mongoose document interfaces. This patch addresses the reported build-time type collapse; it does not certify runtime security.

## Apply hotfix to existing v6.2.7 Git repository

1. Back up your working tree. Extract the `HOTFIX_ONLY.zip` at the project root. This replaces `backend/src/saas/tenant-context.ts` and `backend/package.json`.
2. From `backend` locally:

   ```bash
   npm install
   npm run typecheck
   npm run build
   npm run test
   ```

3. Commit and push ONLY the intended source files:

   ```bash
   git add backend/src/saas/tenant-context.ts backend/package.json
   git commit -m "Fix dynamic tenant-scoped Mongoose schema typing for Render"
   git push origin main
   ```

4. Render backend Web Service: Root Directory `backend`, Build Command `npm install --include=dev && npm run build`, Start Command `npm start`. Redeploy latest Git commit. If using Render build cache, try `Clear build cache & deploy` if old artifacts persist.
5. Confirm `https://YOUR-BACKEND.onrender.com/api/ready` and check logs. For the separately deployed frontend, confirm the Static Site `/api/*` rewrite still targets your backend URL.

## Validation performed in the creation environment

- Parsed/transpiled 56 backend TypeScript files: **no syntax errors**.
- Original project directory structure preserved.
- Complete dependency installation and `tsc` typecheck were **not available** in this environment. Your local build or Render build is the definitive check. If new errors remain, provide the **first 30 lines** from the new output.

## Important

- Do not disable `tsc`, set `noEmitOnError=false`, or change Render start to a development-only TypeScript runner as a workaround.
- Never commit `.env`, AWS keys, MongoDB credentials, or bootstrap passwords.
- Do not run `bootstrap:new:apply` or migration scripts for this fix. Existing Bitstek/Advancerex data should remain unchanged.
