import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { roleAllows,mayManageMemberRole,resolveCompanySelection,mayUseAllCompanies,MODULE_DOMAINS } from '../lib/access.js';

test('Super Admin is global and has all business and administrative capabilities',()=>{
 for(const module of [...MODULE_DOMAINS,'settings']) for(const action of ['read','write','approve','admin'] as const)
   assert.equal(roleAllows('super_admin',[],module,action),true);
});
test('Owner has full scope within company',()=>{
 for(const module of [...MODULE_DOMAINS,'settings']) assert.equal(roleAllows('owner',[],module,'write'),true);
 assert.equal(roleAllows('owner',[],'settings','admin'),true);
});
test('Team requires explicit per-module permissions',()=>{
 const permissions=['learning:write','approvals:write','reports:read'];
 assert.equal(roleAllows('team',permissions,'learning','read'),true);
 assert.equal(roleAllows('team',permissions,'learning','write'),true);
 assert.equal(roleAllows('team',permissions,'sales','read'),false);
 assert.equal(roleAllows('team',permissions,'reports','write'),false);
 assert.equal(roleAllows('team',permissions,'approvals','approve'),true);
 assert.equal(roleAllows('team',permissions,'settings','admin'),false);
});
test('Legacy role values cannot grant access after migration',()=>{
 for(const r of ['manager','admin','staff','viewer','executive']) assert.equal(roleAllows(r,[],'finance','read'),false);
});
test('Owner may manage Team but not promote or remove another Owner',()=>{
 assert.equal(mayManageMemberRole('owner',undefined,'team'),true);
 assert.equal(mayManageMemberRole('owner','team','team'),true);
 assert.equal(mayManageMemberRole('owner','owner','team'),false);
 assert.equal(mayManageMemberRole('owner',undefined,'owner'),false);
 assert.equal(mayManageMemberRole('team',undefined,'team'),false);
 assert.equal(mayManageMemberRole('super_admin','owner','team',true),true);
});
test('Team can access only its assigned companies',()=>{
 const assigned={a:'team',b:'team'};
 assert.equal(mayUseAllCompanies(assigned),false);
 assert.equal(resolveCompanySelection('all',assigned),'a');
 assert.equal(resolveCompanySelection('b',assigned),'b');
 assert.equal(resolveCompanySelection('unknown',assigned),'a');
 assert.equal(mayUseAllCompanies({a:'owner',b:'owner'}),true);
 assert.equal(resolveCompanySelection('all',assigned,true),'all');
});
