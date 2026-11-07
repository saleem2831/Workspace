import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredOrigins, normalizeOrigin, originAllowed} from '../lib/origin-policy.js';

test('browser origin normalization accepts an optional trailing slash', () => {
    assert.equal(normalizeOrigin('http://localhost:5173/'), 'http://localhost:5173');
    assert.equal(normalizeOrigin('  https://app.example.com  '), 'https://app.example.com');
});
test('explicit CORS/CSRF allowlist accepts primary and additional origins', () => {
    const allowed = configuredOrigins('http://localhost:5173', 'https://app.example.com, http://localhost:5173/');
    assert.deepEqual(allowed, ['http://localhost:5173','https://app.example.com']);
    assert.equal(originAllowed('http://localhost:5173', allowed), true);
    assert.equal(originAllowed('https://app.example.com', allowed), true);
    assert.equal(originAllowed('https://evil.example.com', allowed), false);
    assert.equal(originAllowed('null', allowed), false);
    assert.equal(originAllowed('http://127.0.0.1:5173', allowed), false);
});
test('invalid origin policies reject paths, queries, wildcards and credentials', () => {
    for (const value of ['https://example.com/app','https://example.com/?x=1','*', 'https://user:pass@example.com']) {
        assert.throws(() => normalizeOrigin(value));
    }
});
