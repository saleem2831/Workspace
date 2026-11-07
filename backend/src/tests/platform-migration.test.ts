import test from 'node:test';
import assert from 'node:assert/strict';
import {MIGRATION_CONFIRM,eligibleForApproval,eligibleForExecution,safeLabel} from '../saas/migration-policy.js';

test('migration plans require safe display labels',()=>{
 assert.equal(safeLabel('Old Atlas database'),true);
 assert.equal(safeLabel('AWS S3 - Mumbai'),true);
 assert.equal(safeLabel('mongodb+srv://username:secret@cluster'),false);
 assert.equal(safeLabel(''),false);
});
test('requester cannot approve own migration',()=>{
 const plan={status:'planned',requestedBy:'person-a'};
 assert.equal(eligibleForApproval(plan,'person-a'),false);
 assert.equal(eligibleForApproval(plan,'person-b'),true);
 assert.equal(eligibleForApproval({...plan,status:'approved'},'person-b'),false);
});
test('migration cannot run until approved by a different person',()=>{
 assert.equal(eligibleForExecution({status:'approved',requestedBy:'a',approvedBy:'a'}),false);
 assert.equal(eligibleForExecution({status:'planned',requestedBy:'a',approvedBy:'b'}),false);
 assert.equal(eligibleForExecution({status:'approved',requestedBy:'a',approvedBy:'b'}),true);
 assert.equal(eligibleForExecution({status:'verified',requestedBy:'a',approvedBy:'b'}),false);
});
test('cutover confirmation phrase is nontrivial',()=>{
 assert.equal(MIGRATION_CONFIRM,'I_HAVE_VERIFIED_BACKUPS_AND_STOPPED_WRITES');
});
