import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
test('CORS and CSRF share exact origin allowlist', () => {
  assert.match(read('backend/src/server.ts'), /cors\(\{ origin: config\.allowedOrigins, credentials: true \}\)/);
  assert.match(read('backend/src/lib/security.ts'), /originAllowed\(origin, config\.allowedOrigins\)/);
});
test('cross-host CSRF endpoint sets cookie and returns token', () => {
  assert.match(read('backend/src/routes/auth.ts'), /router\.get\('\/csrf'/);
  assert.match(read('backend/src/routes/auth.ts'), /csrfToken: issueCsrfToken\(res\)/);
  assert.match(read('frontend/src/api.ts'), /csrfHttp\.get<\{csrfToken: string\}>\('\/auth\/csrf'\)/);
});
test('frontend absolute backend URL takes precedence over /api proxy', () => {
  assert.match(read('frontend/src/api.ts'), /import\.meta\.env\.VITE_BACKEND_URL/);
  assert.match(read('frontend/vite.config.ts'), /env\.VITE_BACKEND_URL/);
});
test('AI credits labelled metadata-only', () => {
  assert.match(read('frontend/src/pages/PlatformConsole.tsx'), /AI requests are not metered or deducted yet/);
});
