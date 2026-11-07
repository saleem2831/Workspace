# Architecture migration notes

- Based on Bitstek Workspace v1.1 (single Express REST API), preserving the React design and MongoDB workflows.
- Removed npm workspace root requirement: `frontend/` and `backend/` are separate installable packages.
- No gateway and no separate finance, learning, advisory, CRM, or identity processes.
- All backend modules remain grouped by Express routes and data models, while the single REST API owns authentication and authorization.
- Added standalone `.env.example` for both apps, local frontend `.env`, safe environment bootstrap, health scripts, and a dependency-free structure verifier.
- Kept cookie/CSRF auth and company permissions in original source.
- Kept the existing smoke suite; changed its environment-file path for this layout.
- Production still requires a same-origin API reverse proxy; Vite dev proxy alone does not serve built SPA.
- This refactor does not claim the entire application has passed live database and browser tests.
