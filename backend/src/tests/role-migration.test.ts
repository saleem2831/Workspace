import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { migrateMembershipRole } from '../lib/role-migration.js';
import { MODULE_DOMAINS } from '../lib/access.js';

test('Manager and Admin become Team with full operational access',()=>{
 for(const prior of ['manager','admin']){
  const outcome=migrateMembershipRole(prior,[]);
  assert.equal(outcome.role,'team');
  assert.deepEqual(outcome.permissions, MODULE_DOMAINS.map(x=>`${x}:write`));
 }
});
test('Owner stays Owner and Team/staff keep explicit grants',()=>{
 assert.deepEqual(migrateMembershipRole('owner',['finance:write']),{role:'owner',permissions:[]});
 assert.deepEqual(migrateMembershipRole('staff',['learning:write']),{role:'team',permissions:['learning:write']});
 assert.deepEqual(migrateMembershipRole('team',['sales:read']),{role:'team',permissions:['sales:read']});
});
test('Viewer remains read-only and unknown role receives no access',()=>{
 assert.deepEqual(migrateMembershipRole('viewer',['finance:write','learning:read']),{role:'team',permissions:['finance:read','learning:read']});
 assert.deepEqual(migrateMembershipRole('unknown',[]),{role:'team',permissions:[]});
});
