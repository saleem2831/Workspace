import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const req=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let ts;
for (const candidate of [path.join(root,'frontend/node_modules/typescript'),path.join(root,'backend/node_modules/typescript'),'typescript']) {
  try { ts=req(candidate); break; } catch {}
}
if(!ts){console.error('TypeScript is not installed; run npm install inside frontend/ or backend/ first');process.exit(2);}

let fileCount=0,errors=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
 const p=path.join(dir,item.name);
 if(item.isDirectory() && !['node_modules','dist','build','.git'].includes(item.name))walk(p);
 else if(item.isFile()&&/\.(tsx?|mjs)$/.test(item.name)&&p.includes('/src/')){
  const source=fs.readFileSync(p,'utf8');const kind=p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS;
  const src=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true,kind);fileCount++;
  for(const d of src.parseDiagnostics)errors.push(`${p}: ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`);
  if(p.endsWith('.ts')||p.endsWith('.tsx'))for(const m of source.matchAll(/\bfrom\s+['"](\.{1,2}\/[^'"\n]+)['"]/g)){
   const base=path.resolve(path.dirname(p),m[1].replace(/\.js$/,''));
   if(!['.ts','.tsx','.js','.mjs','/index.ts','/index.tsx'].some(ext=>fs.existsSync(base+ext))) errors.push(`Missing import in ${p}: ${m[1]}`);
  }
 }
}}
walk(path.join(root,'backend/src'));walk(path.join(root,'frontend/src'));
const report={files:fileCount,errors};
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exit(1);
