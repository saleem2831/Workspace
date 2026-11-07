import test from 'node:test';
import assert from 'node:assert/strict';
import {base32,totp,matchTotp} from '../lib/mfa.js';
test('RFC 6238 TOTP derivation with 6-digit codes',()=>{
 const s=base32(Buffer.from('12345678901234567890'));
 assert.equal(totp(s,Math.floor(59/30)),'287082');
 assert.equal(matchTotp(s,'287082',-1,59000),1);
 assert.equal(matchTotp(s,'287082',1,59000),-1);
 assert.equal(matchTotp(s,'nototp',-1,59000),-1);
});
