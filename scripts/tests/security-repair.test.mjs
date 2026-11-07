import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
function prepare(){
 const dir=mkdtempSync(join(tmpdir(),'bitstek-env-'));
 mkdirSync(join(dir,'backend'));mkdirSync(join(dir,'scripts'));
 cpSync(join(root,'scripts','repair-security-env.mjs'),join(dir,'scripts','repair-security-env.mjs'));
 cpSync(join(root,'backend','.env.example'),join(dir,'backend','.env.example'));
 return dir;
}
function run(dir){return spawnSync(process.execPath,[join(dir,'scripts','repair-security-env.mjs')],{encoding:'utf8'});}
test('repairs missing secrets without replacing existing connection/password',()=>{
 const dir=prepare();
 try{
  const uri='mongodb://127.0.0.1:27017/real_database';
  writeFileSync(join(dir,'backend','.env'),`MONGODB_URI=${uri}\nJWT_SECRET=short\nMFA_ENCRYPTION_KEY=\nSEED_ADMIN_PASSWORD=KEEP-MY-EXISTING-PASSWORD\n`);
  const output=run(dir);assert.equal(output.status,0,output.stderr);
  const first=readFileSync(join(dir,'backend','.env'),'utf8');
  assert.match(first,/^JWT_SECRET=[a-f0-9]{96}$/m);assert.match(first,/^MFA_ENCRYPTION_KEY=[a-f0-9]{64}$/m);
  assert.ok(first.includes(uri));assert.ok(first.includes('KEEP-MY-EXISTING-PASSWORD'));
  assert.ok(existsSync(join(dir,'backend','.env.backup-before-security-fix')));
  assert.equal(run(dir).status,0);assert.equal(readFileSync(join(dir,'backend','.env'),'utf8'),first);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('refuses to overwrite an existing non-hex MFA encryption key',()=>{
 const dir=prepare();try{
  writeFileSync(join(dir,'backend','.env'),'JWT_SECRET=short\nMFA_ENCRYPTION_KEY=my-existing-but-invalid-key\n');
  const output=run(dir);assert.equal(output.status,1);
  assert.match(readFileSync(join(dir,'backend','.env'),'utf8'),/MFA_ENCRYPTION_KEY=my-existing-but-invalid-key/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('creates a secure first-time config using the example',()=>{
 const dir=prepare();try{
  const output=run(dir);assert.equal(output.status,0,output.stderr);
  const env=readFileSync(join(dir,'backend','.env'),'utf8');
  assert.match(env,/^JWT_SECRET=[a-f0-9]{96}$/m);assert.match(env,/^MFA_ENCRYPTION_KEY=[a-f0-9]{64}$/m);
  assert.doesNotMatch(env,/SEED_ADMIN_PASSWORD=replace-with/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
