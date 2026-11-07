import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const model=read('backend/src/models.ts');
const security=read('backend/src/lib/security.ts');
const admin=read('backend/src/routes/admin.ts');
const routes=read('backend/src/routes/company-management.ts');
const lifecycle=read('backend/src/lib/company-lifecycle.ts');
const frontend=read('frontend/src/App.tsx');
const form=read('frontend/src/pages/CompanyManager.tsx');
const home=read('frontend/src/pages/HomePage.tsx');
const api=read('frontend/src/api.ts');
const settings=read('frontend/src/pages/SettingsPage.tsx');
const checks=[
  ['Company schema stores module list',/enabledModules:\s*\{type:\[String\]/.test(model)],
  ['Backend requires company module enabled',/companyModules\[companyId\]/.test(security)],
  ['Backend only queries assigned companies for Team users',/memberships\.map\(m=>m\.companyId\)/.test(security)],
  ['Auth/me sends module capabilities',/companyModules:req\.actor!\.companyModules/.test(read('backend/src/routes/auth.ts'))],
  ['Frontend sidebar filters enabled modules',/enabled\.includes\(domain\[n\.path\]\)/.test(frontend)],
  ['Home shortcuts filter enabled modules',/companyModules\?\.\[c\._id\]/.test(home)],
  ['Record forms respect per-company modules',/enabledModules \|\| \[\]/.test(read('frontend/src/components/UI.tsx'))],
  ['Request interceptor preserves explicit company scope',/if \(!request\.headers\['x-company-id'\]\)/.test(api)],
  ['Super Admin configures company modules',/enabledModules:modulesSchema/.test(routes)],
  ['CRUD requires Super Admin and confirmation',/superAdmin\(req\)/.test(routes)&&/DELETE \$\{company\.code\}/.test(routes)],
  ['Backups include private attachments',/storedFiles:StoredFile/.test(lifecycle)&&/attachments\.push/.test(lifecycle)],
  ['Operations-only migration constrained',/migrate-operations/.test(routes)&&/operationsMigrationPreview/.test(routes)],
  ['Team & Access remains available',/Team & access/.test(settings)],
  ['Companies UI includes module toggles, export and impact',/Enabled modules/.test(form)&&/Download complete company backup/.test(form)&&/company-impact/.test(form)],
  ['Company creation accepts module configuration',/enabledModules:z\.array/.test(admin)],
];
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);assert.ok(ok,name);}
console.log(`v5.7 checks passed: ${checks.length}`);
