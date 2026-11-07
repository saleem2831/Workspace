import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts;try {ts=require(require.resolve('typescript',{paths:[path.resolve(import.meta.dirname,'../frontend'),path.resolve(import.meta.dirname,'../backend')]}));} catch{try{ts=require(process.env.TYPESCRIPT_MODULE || 'typescript');}catch{console.error('Install frontend/backend dependencies first (typescript missing).');process.exit(2);}}
const base=path.resolve(import.meta.dirname,'..');
let files=0,imports=0;
const errors=[];
function walk(folder){for(const e of fs.readdirSync(folder,{withFileTypes:true})){
  const file=path.join(folder,e.name);if(e.isDirectory())walk(file);else if(/\.(ts|tsx)$/.test(e.name)){
    files++;const code=fs.readFileSync(file,'utf8');
    const parsed=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    for(const d of parsed.parseDiagnostics)errors.push(`${file}: ${d.messageText}`);
    const reg=/(?:from\s*|import\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;let m;
    while((m=reg.exec(code))){imports++;const lookup=path.resolve(path.dirname(file),m[1].replace(/\.js$/,''));
      const candidates=[lookup,lookup+'.ts',lookup+'.tsx',lookup+'.js',path.join(lookup,'index.ts'),path.join(lookup,'index.tsx')];
      if(!candidates.some(f=>fs.existsSync(f)))errors.push(`Unresolved import: ${file}: ${m[1]}`);
    }
  }
}}
walk(path.join(base,'backend','src'));walk(path.join(base,'frontend','src'));
const security=fs.readFileSync(path.join(base,'backend/src/lib/security.ts'),'utf8');
const models=fs.readFileSync(path.join(base,'backend/src/models.ts'),'utf8');
const auth=fs.readFileSync(path.join(base,'backend/src/routes/auth.ts'),'utf8');
const storage=fs.readFileSync(path.join(base,'backend/src/saas/storage.ts'),'utf8');
const checks={
 tenantBoundSession:security.includes('payload.tid')&&security.includes('TenantMembership.findOne'),
 tenantScopedModels:models.includes('tenantSchema(')&&models.includes('tenantId: 1, code: 1'),
 tenantQueryContext:security.includes('runWithTenant(tenantId'),
 separatePlatformRole:fs.readFileSync(path.join(base,'backend/src/saas/platform.ts'),'utf8').includes('PlatformOperator'),
 privateS3Path:storage.includes('tenants/${tenantId}/companies/${companyId}'),
 mfaTenantContext:auth.includes('payload.tid')&&auth.includes('mfa-login'),
 tenantImportValidation:fs.readFileSync(path.join(base,'backend/src/saas/portability.ts'),'utf8').includes('parseImport'),
};
for(const [name,passed] of Object.entries(checks)) if(!passed)errors.push(`Security check failed: ${name}`);
console.log(JSON.stringify({syntaxFiles:files,relativeImports:imports,checks,errors},null,2));
assert.equal(errors.length,0,'v6.1 source checks failed');
