# Bitstek Workspace v3 — verification report

## Scope

v3 is a two-application refactor of the v1.1 source: one React/Vite frontend and one Express/TypeScript backend. The API gateway and split business microservices of v2 are not included.

## Checks completed here

- **PASS:** Standalone project layout and required environment templates (`node scripts/check-structure.mjs`).
- **PASS:** The backend has all five REST API route families (`auth`, `records`, `workflows`, `admin`, `dashboard`) and public health/readiness endpoints.
- **PASS:** Frontend uses Vite's `/api` proxy to `http://127.0.0.1:5000`, with configurable environment values.
- **PASS:** Parsed 42 TypeScript and TSX source files using the TypeScript parser with no parse diagnostics. This is a syntax check, not typechecking.
- **PASS:** Node syntax checks on setup, smoke, and health/structure scripts.
- **PASS:** Environment bootstrap created a random JWT secret and demo password in a throwaway local check and did not overwrite existing files on the second run. Generated backend `.env` was excluded from the release archive.

## Not executed here

- npm dependency install, full TypeScript typecheck, frontend Vite build, backend build, and runtime unit tests.
- MongoDB-connected API integration suite and browser E2E flows.

Reason: npm offline cache does not contain needed registry metadata/dependencies (observed `ENOTCACHED` for `@types/bcryptjs`); MongoDB is not running in this environment. No claim of full runtime verification is made.

## Local commands to complete verification

Backend terminal:

```powershell
cd backend
npm install
npm run verify
npm run dev
```

Frontend terminal:

```powershell
cd frontend
npm install
npm run verify
npm run dev
```

Root terminal:

```powershell
node scripts/check-structure.mjs
# Use a disposable dev MongoDB database only:
$env:SMOKE_ALLOW_WRITES='true'
node scripts/smoke.mjs
Remove-Item Env:SMOKE_ALLOW_WRITES
```

See `docs/WINDOWS_TESTING.md` for 12-module functional and security checklist.
