import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestEnvironment, teardownTestEnvironment } from './helpers/test-env.js';
const dir = await setupTestEnvironment({ TEXT_CHARACTER_LIMIT: 0 });
const { createApp } = await import('../server/app.js');
const { closeDatabase } = await import('../server/database.js');
const app = await createApp();
test.after(async () => { closeDatabase(); await teardownTestEnvironment(dir); });
test('text above both former character and 2 MiB request limits is stored without truncation', async () => {
  const text = 'Я'.repeat(1100000) + ' конец';
  const state = await request(app).get('/api/state');
  const saved = await request(app).put('/api/clipboard').send({ html: '<span>'+text+'</span>', baseRevision: state.body.clipboard.revision });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.clipboard.contentPlain, text);
  const loaded = await request(app).get('/api/state');
  assert.equal(loaded.body.clipboard.contentPlain, text);
  assert.equal(loaded.body.limits.textCharacterLimit, 0);
});
