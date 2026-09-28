import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { setupTestEnvironment, teardownTestEnvironment } from './helpers/test-env.js';
const dir = await setupTestEnvironment({ FILE_COUNT_LIMIT: 0, IMAGE_COUNT_LIMIT: 0, UPLOAD_RATE_LIMIT_MAX: 0 });
const { createApp } = await import('../server/app.js');
const { closeDatabase } = await import('../server/database.js');
const app = await createApp();
test.after(async () => { closeDatabase(); await teardownTestEnvironment(dir); });
test('more than ten files and photos and twenty uploads per minute are accepted', async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
  for (let i = 0; i < 12; i++) {
    assert.equal((await request(app).post('/api/files').attach('file', Buffer.from('file'), `${i}.txt`)).status, 201);
    assert.equal((await request(app).post('/api/images').attach('image', png, `${i}.png`)).status, 201);
  }
  const { body } = await request(app).get('/api/state');
  assert.equal(body.files.length, 12);
  assert.equal(body.images.length, 12);
});
