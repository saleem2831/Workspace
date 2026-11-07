import test from 'node:test';
import assert from 'node:assert/strict';
import { mayManageMemberRole, roleAllows, resolveCompanySelection } from '../lib/access.js';

const learningCompany = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const advisoryCompany = 'bbbbbbbbbbbbbbbbbbbbbbbb';

test('Team with Learning, Finance and Approvals does not require Operations access', () => {
  const modules = ['operations', 'learning', 'finance', 'approvals', 'sales'];
  const grants = ['learning:write', 'finance:write', 'approvals:write'];
  const allowed = modules.filter(module => roleAllows('team', grants, module, 'read'));
  assert.deepEqual(allowed, ['learning','finance','approvals']);
  assert.equal(roleAllows('team', grants, 'operations','read'),false);
  assert.equal(roleAllows('team', grants, 'learning','write'),true);
});

test('Team all-company selection resolves to a company they belong to', () => {
  const roles = { [learningCompany]:'team' };
  assert.equal(resolveCompanySelection('all', roles, false), learningCompany);
  assert.equal(resolveCompanySelection(advisoryCompany, roles, false), learningCompany);
});

test('Super Admin can view all companies but Team cannot', () => {
  assert.equal(resolveCompanySelection('all',{[learningCompany]:'super_admin',[advisoryCompany]:'super_admin'},true),'all');
  assert.equal(mayManageMemberRole('team','team','owner'), false);
  assert.equal(mayManageMemberRole('owner','team','team'), true);
});
