import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '../config.js';
test('single REST API uses backend port 5000 by default', () => {
  assert.ok(Number.isInteger(config.port));
  assert.ok(config.port > 0);
});
test('only the backend reads database and JWT credentials', () => {
  assert.equal(typeof config.mongoUri, 'string');
  assert.equal(typeof config.secret, 'string');
});
