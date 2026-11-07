# v6.2.6 Change Log

- Replaces tenant-agnostic, hard-coded Today vertical card labels with authorized tenant company cards and backend-calculated per-company metrics.
- Reports now rely on backend `availableModules` and avoid unrelated KPIs/tabs.
- Adds audited Platform Owner subscription plan update and safe delete endpoints.
- Adds platform settings singleton and separately scoped platform brand/theme.
- Adds five per-tenant palette choices and tenant-admin/platform-admin setting endpoints.
- Adds tenant theme selection during onboarding, defaults for existing tenants, and tenant-derived default branding.
- Streamlines tenant-user management layout.
- Hides advanced migration controls until explicitly requested.

Previous documentation remains in `docs/`, including SaaS onboarding, S3 portability, and credential setup.
