import crypto from 'node:crypto';
import { config } from '../config.js';
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes:Buffer) {
 let bits=0,value=0,out=''; for(const n of bytes){value=(value<<8)|n;bits+=8;while(bits>=5){out+=ALPHABET[(value>>>(bits-5))&31];bits-=5;}}
 if(bits)out+=ALPHABET[(value<<(5-bits))&31];return out;
}
function decodeBase32(input:string){let bits=0,value=0,arr:number[]=[];for(const c of input.replace(/=|\s/g,'').toUpperCase()){const v=ALPHABET.indexOf(c);if(v<0)throw new Error('Invalid secret');value=(value<<5)|v;bits+=5;if(bits>=8){arr.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(arr);}
export const newSecret=()=>base32(crypto.randomBytes(20));
export function encryptSecret(secret:string){if(!/^[a-f0-9]{64}$/i.test(config.mfaEncryptionKey))throw new Error('MFA encryption key not configured');const iv=crypto.randomBytes(12), c=crypto.createCipheriv('aes-256-gcm',Buffer.from(config.mfaEncryptionKey,'hex'),iv);const encrypted=Buffer.concat([c.update(secret,'utf8'),c.final()]);return [iv,c.getAuthTag(),encrypted].map(x=>x.toString('base64url')).join('.');}
export function decryptSecret(value:string){if(!/^[a-f0-9]{64}$/i.test(config.mfaEncryptionKey))throw new Error('MFA encryption key not configured');const [iv,tag,body]=value.split('.').map(s=>Buffer.from(s,'base64url'));const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(config.mfaEncryptionKey,'hex'),iv);d.setAuthTag(tag);return Buffer.concat([d.update(body),d.final()]).toString('utf8');}
export function totp(secret:string,counter:number){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter));const h=crypto.createHmac('sha1',decodeBase32(secret)).update(b).digest();const i=h[h.length-1]&15;const n=(h.readUInt32BE(i)&0x7fffffff)%1000000;return n.toString().padStart(6,'0');}
export function matchTotp(secret:string,code:string,lastCounter=-1,at=Date.now()){
 if(!/^\d{6}$/.test(code))return -1;const now=Math.floor(at/30000);
 for(let i=-1;i<=1;i++){const counter=now+i;if(counter>lastCounter){const expected=totp(secret,counter);if(crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(code)))return counter;}}
 return -1;
}
