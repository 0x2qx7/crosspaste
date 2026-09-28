import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestEnvironment, teardownTestEnvironment } from './helpers/test-env.js';

const TEST_TOKEN = 'secret-test-token-12345';
const tempDir = await setupTestEnvironment({
  OPTIONAL_ACCESS_TOKEN: TEST_TOKEN,
});

const { createApp } = await import('../server/app.js');
const { closeDatabase } = await import('../server/database.js');

const app = await createApp();

test.after(async () => {
  closeDatabase();
  await teardownTestEnvironment(tempDir);
});

test('GET /api/health succeeds without authentication even when OPTIONAL_ACCESS_TOKEN is configured', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
});

test('Protected API endpoints return 401 when accessed without token', async () => {
  const response = await request(app).get('/api/state');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'ACCESS_TOKEN_REQUIRED');
});

test('Protected API endpoints succeed when accessed with Authorization: Bearer token header', async () => {
  const response = await request(app)
    .get('/api/state')
    .set('Authorization', `Bearer ${TEST_TOKEN}`);
  assert.equal(response.status, 200);
  assert.ok(response.body.clipboard);
});

test('Protected API endpoints succeed when accessed with x-access-token header', async () => {
  const response = await request(app)
    .get('/api/state')
    .set('x-access-token', TEST_TOKEN);
  assert.equal(response.status, 200);
  assert.ok(response.body.clipboard);
});

test('Protected API endpoints succeed when accessed with crosspaste_access cookie', async () => {
  const response = await request(app)
    .get('/api/state')
    .set('Cookie', [`crosspaste_access=${TEST_TOKEN}`]);
  assert.equal(response.status, 200);
  assert.ok(response.body.clipboard);
});

test('HTML pages redirect to /access.html when accessed without token', async () => {
  const response = await request(app).get('/');
  assert.equal(response.status, 302);
  assert.equal(response.header.location, '/access.html');
});
