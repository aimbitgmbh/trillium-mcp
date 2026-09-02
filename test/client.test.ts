import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { TrilliumApiError, TrilliumClient } from '../src/client.js';
import { loadConfig } from '../src/config.js';

async function withServer(handler: http.RequestListener, run: (client: TrilliumClient) => Promise<void>, timeout = 1_000) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server address');
  const client = new TrilliumClient(loadConfig({
    TRILLIUM_API_URL: `http://127.0.0.1:${address.port}/etapi`, TRILLIUM_API_TOKEN: 'secret',
    TRILLIUM_REQUEST_TIMEOUT_MS: String(timeout),
  }));
  try { await run(client); } finally { await client.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test('client sends auth, JSON/text/octet-stream and preserves binary bytes', async () => {
  const seen: Array<{ url?: string; method?: string; type?: string; body: Buffer }> = [];
  await withServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      assert.equal(request.headers.authorization, 'Bearer secret');
      seen.push({ url: request.url, method: request.method, type: request.headers['content-type'], body: Buffer.concat(chunks) });
      if (request.url?.endsWith('/content') && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(Buffer.from([0, 255, 1, 128]));
      } else if (request.method === 'PUT') response.writeHead(204).end();
      else response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ noteId: 'abcd', title: 'x' }));
    });
  }, async (client) => {
    await client.updateNote('a/b', { title: 'new' });
    await client.updateNoteContent('abcd', 'plain');
    await client.updateAttachmentContent('efgh', Buffer.from([0, 255]), 'image/png');
    assert.deepEqual(await client.getAttachmentContent('efgh'), Buffer.from([0, 255, 1, 128]));
  });
  assert.equal(seen[0].url, '/etapi/notes/a%2Fb');
  assert.equal(seen[0].type, 'application/json');
  assert.equal(seen[1].type, 'text/plain; charset=utf-8');
  assert.equal(seen[2].type, 'image/png');
  assert.deepEqual(seen[2].body, Buffer.from([0, 255]));
});

test('client caps API error text and exposes status', async () => {
  await withServer((_request, response) => response.writeHead(418).end('x'.repeat(10_000)), async (client) => {
    await assert.rejects(client.getNote('abcd'), (error: unknown) => error instanceof TrilliumApiError && error.status === 418 && error.message.length < 4_200);
  });
});

test('client times out stalled requests', async () => {
  await withServer(() => undefined, async (client) => {
    await assert.rejects(client.getNote('abcd'), /timeout|aborted/i);
  }, 100);
});

test('client rejects known oversized attachments before download', async () => {
  await withServer((_request, response) => response.writeHead(500).end(), async (client) => {
    assert.throws(() => client.assertAttachmentSize(25 * 1024 ** 2 + 1), /exceeds/);
  });
});

test('transport retry is GET-only', async () => {
  let getCount = 0;
  await withServer((request, response) => {
    if (request.method === 'GET' && ++getCount === 1) return request.socket.destroy();
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ noteId: 'abcd', title: 'ok' }));
  }, async (client) => {
    assert.equal((await client.getNote('abcd')).title, 'ok');
    assert.equal(getCount, 2);
  });

  let postCount = 0;
  await withServer((request) => { postCount += 1; request.socket.destroy(); }, async (client) => {
    await assert.rejects(client.createNote({ parentNoteId: 'root', title: 'x', type: 'text', content: 'x' }));
    assert.equal(postCount, 1);
  });
});
