import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { apply } from '../lib/index.js';
const files = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url))).files;
let route;
let released = false;
let dispose;
apply({ inject(_, callback) { callback({ get() { return { register(value) { route = value; return () => { released = true; }; } }; }, effect(factory) { dispose = factory(); } }); } });
async function request(url, method = 'GET', headers = {}) {
  const result = {};
  const response = { writeHead(status, values) { result.status = status; result.headers = values; return this; }, end(body) { result.body = body; return this; } };
  await route.handler({ url, method, headers }, response);
  return result;
}
test('packaged artwork is served byte-correctly with immutable caching', async () => {
  const result = await request('/skin-assets/whale-gallery/' + files[0]);
  assert.equal(result.status, 200);
  assert.equal(result.headers['Content-Type'], 'image/png');
  assert.match(result.headers['Cache-Control'], /immutable/);
  assert.equal(createHash('sha256').update(result.body).digest('hex'), files[0].slice(0, 64));
});
test('HEAD and conditional requests preserve HTTP semantics', async () => {
  const uri = '/skin-assets/whale-gallery/' + files[0];
  const head = await request(uri, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body, undefined);
  assert.ok(head.headers['Content-Length'] > 10000);
  const cached = await request(uri, 'GET', { 'if-none-match': 'W/"' + files[0].slice(0, 64) + '"' });
  assert.equal(cached.status, 304); assert.equal(cached.body, undefined);
});
test('unknown files, traversal, encoded paths and unsupported methods are rejected', async () => {
  for (const uri of ['/skin-assets/whale-gallery/package.json', '/skin-assets/whale-gallery/../package.json', '/skin-assets/whale-gallery/%2e%2e/package.json', '/skin-assets/whale-gallery/' + 'a'.repeat(64) + '.png', '/skin-assets/whale-gallery-other/' + files[0]]) assert.equal((await request(uri)).status, 404, uri);
  const post = await request('/skin-assets/whale-gallery/' + files[0], 'POST');
  assert.equal(post.status, 405); assert.equal(post.headers.Allow, 'GET, HEAD');
});
test('route registration returns its cleanup', () => { dispose(); assert.equal(released, true); });
