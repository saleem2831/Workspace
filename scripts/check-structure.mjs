import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const get = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const be = JSON.parse(get('backend', 'package.json'));
const fe = JSON.parse(get('frontend', 'package.json'));
assert.ok(!be.workspaces && !fe.workspaces, 'Each app must be independently installable');
assert.ok(!fs.existsSync(path.join(root, 'apps', 'gateway')), 'No gateway should exist');
assert.ok(!fs.existsSync(path.join(root, 'services')), 'No backend microservices should exist');
assert.ok(!fs.existsSync(path.join(root, 'package.json')), 'Install should be app-local, not from root');
for (const file of ['frontend/.env.example', 'backend/.env.example',
  'frontend/vite.config.ts', 'backend/src/server.ts', 'backend/src/seed.ts']) {
  assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
}
const server = get('backend', 'src', 'server.ts');
const vite = get('frontend', 'vite.config.ts');
const api = get('frontend', 'src', 'api.ts');
for (const route of ['/api/auth','/api/records','/api/workflows','/api/admin','/api/dashboard']) {
  assert.ok(server.includes(route), `Missing backend route ${route}`);
}
assert.match(vite, /proxyTarget/);
assert.match(vite, /['"]\/api['"]/);
assert.match(api, /VITE_API_BASE_URL/);
const frontendEnv = fs.existsSync(path.join(root,'frontend','.env')) ? get('frontend','.env') : get('frontend','.env.example');
assert.match(frontendEnv, /VITE_API_BASE_URL=\/api/);
assert.ok(!frontendEnv.includes('JWT_SECRET'));
console.log('PASS — exactly two independently installable apps; backend REST API routes and frontend proxy configured.');
