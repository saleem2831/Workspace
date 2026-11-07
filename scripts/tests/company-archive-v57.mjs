import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { archiveEntries } from '../../backend/src/lib/company-tar.ts';

test('company export tar.gz includes readable metadata, NDJSON, and document files',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bitstek-tar-test-'));
  try{
    const fn=path.join(dir,'document');await fs.writeFile(fn,'private attachment\n');
    const content=Buffer.from('{"collection":"companies","doc":{"name":"Example"}}\n');
    const manifest=Buffer.from('{"format":"bitstek-workspace-company-v1"}');
    const archive=path.join(dir,'export.tar.gz');
    await pipeline(Readable.from(archiveEntries([
      {name:'manifest.json',content:manifest,size:manifest.length},
      {name:'records.ndjson',content,size:content.length},
      {name:'documents/file-1234abcd',file:fn,size:(await fs.stat(fn)).size}
    ])),createGzip(),createWriteStream(archive));
    const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');
    assert.deepEqual(names,['manifest.json','records.ndjson','documents/file-1234abcd']);
    assert.equal(execFileSync('tar',['-xOzf',archive,'manifest.json'],{encoding:'utf8'}),manifest.toString());
    assert.equal(execFileSync('tar',['-xOzf',archive,'documents/file-1234abcd'],{encoding:'utf8'}),'private attachment\n');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
