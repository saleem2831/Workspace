# v6.2.2 — Platform dashboard and language-selector fix

## Reported issue
The dedicated platform-owner bootstrap creates a *normal tenant member with no company membership*. The display name "Platform Owner" can appear even though the `PlatformOperator` grant is absent. The backend returns `isPlatformOperator=false` until the user has verified MFA **and** the guarded platform promotion has completed. Thus the former UI displayed only Home, Today and Settings, and its business-company dropdown was empty.

## Fix
- A platform-only, MFA-authorized account has **Platform Console** and **Settings**, with `/` and `/today` redirecting to `/platform`.
- A dedicated account that has not completed platform activation sees an explicit onboarding/status screen with MFA and CLI promotion instructions, rather than empty business dashboards.
- The company picker and business notifications are hidden for identities with no business company assignment.
- After promotion the sidebar correctly identifies Platform Owner or Platform Operator from `/auth/me`, not the user display name.
- English/Arabic selector is fixed at the upper-right of the login and invitation pages. Inside the application it is always the far-right header control, in both English and Arabic. The login form is no longer laid out side-by-side with the selector.
- Previous company modules and database records remain unchanged. This is a frontend-only UI patch.

## Test steps
1. Keep your existing `.env` and MongoDB backup. Do not run a seed or SaaS adoption migration just for this fix.
2. Extract the package and copy your existing backend `.env` and frontend `.env` securely. Do not publish the `.env` files.
3. `cd backend && npm install && npm run dev`.
4. `cd frontend && npm install && npm run typecheck && npm run dev`.
5. Sign in as the new dedicated account. Without the PlatformOperator grant the setup screen displays and Settings > Security is available.
6. Complete authenticator MFA, set `PLATFORM_OPERATOR_EMAIL` to **that exact email**, set `PLATFORM_OPERATOR_LEVEL=owner`. Preview: `npm run bootstrap:platform`. Apply: `npm run bootstrap:platform:apply`. Both commands run in `backend/` on a backed-up staging database first.
7. Sign out and sign back in. Platform Console must be visible. Visit `http://localhost:5173/platform`.
8. Check language selector top-right on login, invite, Platform Console, English and Arabic; check responsive width on mobile.

## Important
If Platform Console remains absent, inspect `/api/auth/me` while signed in. `isPlatformOperator` and `isPlatformOwner` must both be `true` for an MFA-enabled owner. If not, the privilege promotion/MFA has not completed; UI changes cannot grant backend permissions.

This is a **source-level patch**; full app build, live MongoDB role-promotion, and browser testing require your installation and are not claimed here.
