import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/index.js';
import type { TrilliumClient } from '../src/client.js';

test('MCP protocol lists and invokes registry tools', async () => {
  const config = loadConfig({ TRILLIUM_API_URL: 'http://localhost:8080/etapi', TRILLIUM_API_TOKEN: 'x' });
  const fake = { searchNotes: async () => ({ results: [] }) } as unknown as TrilliumClient;
  const server = createServer(config, fake);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 13);
    const result = await client.callTool({ name: 'notes_search', arguments: { query: 'nothing' } }) as { content: Array<{ text: string }>; isError?: boolean };
    assert.equal(result.isError, undefined);
    assert.match((result.content[0] as { text: string }).text, /No notes found/);
    const denied = await client.callTool({ name: 'note_delete', arguments: { noteId: 'abcd' } }) as { isError?: boolean };
    assert.equal(denied.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
