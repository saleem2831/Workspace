/** Create safe local .env files without installing npm packages or overwriting existing values. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendEnv = path.join(root, 'backend', '.env');
const frontendEnv = path.join(root, 'frontend', '.env');
const backendExample = fs.readFileSync(path.join(root, 'backend', '.env.example'), 'utf8');
const frontendExample = fs.readFileSync(path.join(root, 'frontend', '.env.example'), 'utf8');
const secret = crypto.randomBytes(48).toString('hex');
const password = `Demo-${crypto.randomBytes(18).toString('base64url')}9!`;
function createIfMissing(destination, content) {
  if (fs.existsSync(destination)) {
    console.log(`KEEP   ${path.relative(root, destination)} (existing settings unchanged)`);
    return false;
  }
  fs.writeFileSync(destination, content, { flag: 'wx', mode: 0o600 });
  console.log(`CREATE ${path.relative(root, destination)}`);
  return true;
}
const createdBackend = createIfMissing(backendEnv, backendExample
  .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`)
  .replace(/^MFA_ENCRYPTION_KEY=.*$/m, `MFA_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}`)
  .replace(/^SEED_ADMIN_PASSWORD=.*$/m, `SEED_ADMIN_PASSWORD=${password}`));
createIfMissing(frontendEnv, frontendExample);
if (createdBackend) {
  console.log('\nDemo login: admin@bitstek.local');
  console.log(`Demo password: ${password}`);
  console.log('The password is also saved inside backend/.env. Keep it private.');
} else {
  console.log('\nExisting backend/.env was preserved. Use its SEED_ADMIN_PASSWORD to sign in.');
}
console.log('\nNext: run `npm install` separately in backend/ and frontend/.');
