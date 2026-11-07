import test from 'node:test';
import assert from 'node:assert/strict';
import { modulesForVertical, effectiveModules, normalizeModules, moduleEnabled, BUSINESS_MODULES } from '../../backend/src/lib/company-modules.ts';
import { roleAllows } from '../../backend/src/lib/access.ts';

test('Learning defaults have Learning but not Advisory, Products or Projects',()=>{
 const set=modulesForVertical('Learning & Education');
 assert.ok(set.includes('learning'));
 for(const item of ['advisory','products','projects'])assert.equal(set.includes(item),false);
});
test('Advisory defaults can enable Products and Projects without changing vertical',()=>{
 const defaults=modulesForVertical('Advisory & Trading');
 assert.ok(defaults.includes('advisory'));assert.equal(defaults.includes('learning'),false);
 const company={vertical:'Advisory & Trading',enabledModules:[...defaults,'products','projects']};
 assert.equal(moduleEnabled(company,'projects'),true);
 assert.equal(moduleEnabled(company,'products'),true);
 assert.equal(moduleEnabled(company,'learning'),false);
});
test('IT defaults contain Projects and Products, not Learning or Advisory',()=>{
 const mods=modulesForVertical('IT Services & Products');
 assert.ok(mods.includes('projects')&&mods.includes('products'));
 assert.ok(!mods.includes('advisory')&&!mods.includes('learning'));
});
test('Existing companies without module settings derive sensible vertical defaults',()=>{
 assert.deepEqual(effectiveModules({vertical:'Learning'}),modulesForVertical('Learning'));
 assert.deepEqual(effectiveModules({vertical:'Advisory'}),modulesForVertical('Advisory'));
 assert.deepEqual(effectiveModules({vertical:'IT & Products'}),modulesForVertical('IT & Products'));
});
test('Explicitly disabling all modules does not cause fallback',()=>{
 assert.deepEqual(effectiveModules({vertical:'Advisory',enabledModules:[]}),[]);
 assert.equal(moduleEnabled({vertical:'Advisory',enabledModules:[]},'advisory'),false);
 assert.equal(moduleEnabled({vertical:'Advisory',enabledModules:[]},'settings'),true);
});
test('Unknown modules are removed, names are unique, and order stable',()=>{
 assert.deepEqual(normalizeModules(['advisory','advisory','arbitrary','projects']),['advisory','projects']);
 assert.equal(BUSINESS_MODULES.length,9);
});
test('Company switch and role combine: Owner full enabled modules, Team only explicit grants',()=>{
 const learning=effectiveModules({vertical:'Learning'});
 const advisory=effectiveModules({vertical:'Advisory'});
 const allowed=(mods,role,grants,domain,action='read')=>mods.includes(domain)&&roleAllows(role,grants,domain,action);
 assert.equal(allowed(learning,'owner',[],'learning'),true);
 assert.equal(allowed(learning,'owner',[],'advisory'),false);
 assert.equal(allowed(advisory,'owner',[],'advisory'),true);
 assert.equal(allowed(advisory,'team',['learning:write'],'learning'),false);
 assert.equal(allowed(learning,'team',['learning:read'],'learning','read'),true);
 assert.equal(allowed(learning,'team',['learning:read'],'learning','write'),false);
});
