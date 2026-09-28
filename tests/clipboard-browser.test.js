import test from 'node:test';
import assert from 'node:assert/strict';
import { copyImageUrl } from '../public/scripts/clipboard.js';

test('image clipboard write begins inside the click gesture before the image fetch completes', async () => {
  const originals = { window: globalThis.window, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), fetch: globalThis.fetch, ClipboardItem: globalThis.ClipboardItem };
  let finishFetch;
  let writeStarted = false;
  try {
    globalThis.window = { isSecureContext: true, ClipboardItem: true };
    globalThis.ClipboardItem = class { constructor(data) { this.data = data; } };
    globalThis.fetch = () => new Promise(resolve => { finishFetch = resolve; });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: {
      write(items) {
        writeStarted = true;
        assert.ok(items[0].data['image/png'] instanceof Promise);
        return items[0].data['image/png'].then(blob => assert.equal(blob.type, 'image/png'));
      },
    } } });
    const pending = copyImageUrl('/api/images/1/file');
    assert.equal(writeStarted, true);
    finishFetch({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) });
    assert.deepEqual(await pending, { ok: true });
    window.isSecureContext = false;
    assert.deepEqual(await copyImageUrl('/api/images/1/file'), { ok: false, reason: 'unsupported' });
  } finally {
    globalThis.window = originals.window;
    globalThis.fetch = originals.fetch;
    globalThis.ClipboardItem = originals.ClipboardItem;
    if (originals.navigator) Object.defineProperty(globalThis, 'navigator', originals.navigator);
    else delete globalThis.navigator;
  }
});
