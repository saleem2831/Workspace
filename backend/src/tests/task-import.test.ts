import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateTaskRows} from '../routes/task-import.js';
test('tasks default to P2 and reject invalid dates and missing titles',()=>{
 const v=validateTaskRows([{title:'A',vertical:'Learning',priority:'High',dueDate:'2027-01-25'},{title:'',vertical:'Learning',priority:'P2',dueDate:'2027-02-30'}]);
 assert.equal(v.rows[0].priority,'P1');assert.equal(v.rows[0].dueAt?.toISOString().slice(0,10),'2027-01-25');assert.equal(v.errors.length,1);
});
