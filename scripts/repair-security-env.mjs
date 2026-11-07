/** One-time migration helper: preserves real credentials and an existing MFA encryption key. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = path.join(root, 'backend', '.env');
const example = path.join(root, 'backend', '.env.example');
const original = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : fs.readFileSync(example, 'utf8');
let content = original; const changed=[];
function setValue(key, value) {
  const regex = new RegExp(`^${key}\\s*=.*$`, 'm');
  if (regex.test(content)) content = content.replace(regex, `${key}=${value}`);
  else content += `${content.endsWith('\n')?'':'\n'}${key}=${value}\n`;
  changed.push(key);
}
function getValue(key) { return content.match(new RegExp(`^${key}[ \t]*=[ \t]*(.*)$`, 'm'))?.[1]?.trim() || ''; }
const jwt = getValue('JWT_SECRET');
if (jwt.length < 32 || jwt.startsWith('replace-with')) setValue('JWT_SECRET', crypto.randomBytes(48).toString('hex'));
const mfa = getValue('MFA_ENCRYPTION_KEY');
if (!mfa) setValue('MFA_ENCRYPTION_KEY', crypto.randomBytes(32).toString('hex'));
else if (!/^[0-9a-f]{64}$/i.test(mfa)) {
  console.error('Existing MFA_ENCRYPTION_KEY has an invalid format. Not overwriting it: changing a used key makes enrolled MFA secrets unreadable.');
  process.exitCode = 1;
}
const seedPassword = getValue('SEED_ADMIN_PASSWORD');
if (!process.exitCode && (!seedPassword || seedPassword.startsWith('replace-with'))) setValue('SEED_ADMIN_PASSWORD', `Demo-${crypto.randomBytes(18).toString('base64url')}9!`);
if (changed.length && !process.exitCode) {
  if (fs.existsSync(filename)) fs.copyFileSync(filename, `${filename}.backup-before-security-fix`);
  fs.writeFileSync(filename, content, {mode:0o600});
  console.log(`Updated ${changed.join(', ')} in backend/.env. Existing MongoDB URI and passwords were preserved.`);
  console.log('Restart backend after making this change. Changing JWT_SECRET invalidates existing logins.');
} else if (!process.exitCode) console.log('Backend security configuration already appears complete; keys were not changed.');
