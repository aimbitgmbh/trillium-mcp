import assert from 'node:assert/strict';
import test from 'node:test';
import { hasReadPermission, hasWritePermission, loadConfig } from '../src/config.js';

test('config applies secure defaults and exact permissions', () => {
  const config = loadConfig({ TRILLIUM_API_URL: 'https://notes.example/etapi/', TRILLIUM_API_TOKEN: 'token' });
  assert.equal(config.verifySsl, true);
  assert.equal(config.requestTimeoutMs, 30_000);
  assert.equal(config.maxAttachmentBytes, 25 * 1024 ** 2);
  assert.equal(hasReadPermission(config), true);
  assert.equal(hasWritePermission(config), false);
  assert.throws(() => loadConfig({ TRILLIUM_API_URL: 'https://notes.example/not-etapi', TRILLIUM_API_TOKEN: 'x' }));
  assert.throws(() => loadConfig({ TRILLIUM_API_URL: 'https://notes.example/etapi', TRILLIUM_API_TOKEN: 'x', TRILLIUM_PERMISSIONS: 'BREAD' }));
});

test('config accepts explicit write and local TLS settings', () => {
  const config = loadConfig({
    TRILLIUM_API_URL: 'http://localhost:8080/etapi', TRILLIUM_API_TOKEN: 'token',
    TRILLIUM_PERMISSIONS: 'READ;WRITE', TRILLIUM_VERIFY_SSL: 'false', TRILLIUM_REQUEST_TIMEOUT_MS: '1234',
  });
  assert.equal(hasReadPermission(config), true);
  assert.equal(hasWritePermission(config), true);
  assert.equal(config.verifySsl, false);
  assert.equal(config.requestTimeoutMs, 1234);
  assert.equal(loadConfig({ TRILLIUM_API_URL: 'https://notes.example/etapi', TRILLIUM_API_TOKEN: 'x', VERIFY_SSL: 'false' }).verifySsl, false);
});
