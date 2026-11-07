/* Dependency-free project package sanity checks; NOT a full TypeScript or runtime test. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const required=[
 'frontend/src/i18n.tsx','frontend/src/pages/PlatformConsole.tsx',
 'backend/src/saas/migration-model.ts','backend/src/saas/migration-policy.ts',
 'backend/src/saas/migrate-database.ts','backend/src/saas/migrate-storage.ts',
 'backend/src/saas/bootstrap-demo-roles.ts','docs/v6_2/SETUP_AND_CREDENTIALS.md',
 'docs/v6_2/MIGRATION_OPERATIONS.md','docs/v6_2/LOCALIZATION.md'
];
for(const f of required)assert.ok(fs.statSync(path.join(root,f)).isFile(),`Missing ${f}`);
for(const app of ['backend','frontend']){
 const pkg=JSON.parse(fs.readFileSync(path.join(root,app,'package.json'),'utf8'));
 assert.equal(pkg.version,'6.2.0');assert.ok(pkg.scripts.dev);
}
const platform=fs.readFileSync(path.join(root,'backend/src/saas/platform.ts'),'utf8');
assert.ok(platform.includes("'/migrations/:id/approve'"));
assert.ok(platform.includes('MFA-enabled Platform Owner required'));
const locale=fs.readFileSync(path.join(root,'frontend/src/i18n.tsx'),'utf8');
assert.ok(locale.includes('document.documentElement.dir'));
console.log('v6.2 structure and policy source markers: PASSED');
console.log('A full build, database test, and S3 integration test are still REQUIRED.');
