import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const read=file=>fs.readFileSync(new URL(`../../${file}`,import.meta.url),'utf8');
test('Today uses tenant-specific company names rather than hard-coded brands',()=>{
  const s=read('frontend/src/pages/Dashboard.tsx');
  assert.match(s,/companySummaries/);assert.match(s,/c\.name/);
  assert.doesNotMatch(s,/Bitstek Learning|Bitstek Advisory|IT & Products/);
});
test('Reports tabs derive from backend module ACL',()=>{
  const s=read('frontend/src/pages/ReportsPage.tsx');
  assert.match(s,/availableModules/);assert.match(s,/availableTabs/);
  assert.match(read('backend/src/routes/dashboard.ts'),/allowedCompanies\(req,m\)/);
});
test('Plan edit/delete have owner authorization and assignment guards',()=>{
  const s=read('backend/src/saas/platform.ts');
  assert.match(s,/router\.patch\('\/plans\/:id'/);
  assert.match(s,/router\.delete\('\/plans\/:id'/);
  assert.match(s,/SaaSSubscription\.exists\(\{planId:plan\._id\}\)/);
  assert.match(s,/TenantMembership\.countDocuments/);
});
test('Tenant theme and platform settings use independent persistence',()=>{
  assert.match(read('backend/src/saas/models.ts'),/export const PlatformSetting/);
  assert.match(read('backend/src/saas/routes.ts'),/\/settings\/theme/);
  assert.match(read('frontend/src/App.tsx'),/data-theme=/);
  const s=read('frontend/src/components/ThemePicker.tsx');
  for(const v of ['violet','ocean','emerald','sunset','slate']) assert.match(s,new RegExp(v));
});
test('Advanced migration UI is opt-in',()=>{
  const s=read('frontend/src/pages/PlatformConsole.tsx');
  assert.match(s,/isOwner&&showMigrations&&/);
  assert.match(s,/enabled:isOwner&&showMigrations/);
});
