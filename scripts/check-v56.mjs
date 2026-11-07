import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const get = p => readFileSync(new URL('../' + p,import.meta.url),'utf8');
const app = get('frontend/src/App.tsx');
const settings = get('frontend/src/pages/SettingsPage.tsx');
const ui = get('frontend/src/components/UI.tsx');
const dash = get('backend/src/routes/dashboard.ts');
const admin = get('backend/src/routes/admin.ts');
const security = get('backend/src/lib/security.ts');
const tests = [
 ['Settings is not remounted when company changes',!app.includes('<main className="page" key={company}>')],
 ['Authentication refresh preserves current settings tab',app.includes("void query.invalidateQueries({ queryKey: ['auth'] })")],
 ['All Companies member editor has explicit target',settings.includes('Company for this membership') && settings.includes('forCompany(editing.companyId)')],
 ['All Companies member creation has explicit company',settings.includes('Company for new membership') && settings.includes('forCompany(newMemberTarget)')],
 ['Super Admin can edit company details',settings.includes('Edit company') && admin.includes("router.patch('/companies/:id'")],
 ['Today API does not assume operations access',dash.includes("allowedCompanies(req, 'operations').length ? Task.find")],
 ['Record forms use company-scoped requests',ui.includes('const [targetCompany, setTargetCompany]') && ui.includes('saveRecord(entity,body,initial?._id,targetCompany)')],
 ['Backend blocks unauthorized company headers',security.includes("throw new HttpError(403, 'Company is not assigned to this user')")],
];
for (const [description,passed] of tests){console.log(`${passed?'PASS':'FAIL'} ${description}`);assert.ok(passed,description);}
console.log(`${tests.length} source-level regression assertions passed.`);
