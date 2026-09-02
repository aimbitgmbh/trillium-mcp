import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadConfig } from '../src/config.js';
import { TrilliumClient } from '../src/client.js';

const config = loadConfig();
if (config.permissions !== 'READ;WRITE') throw new Error('Live test requires TRILLIUM_PERMISSIONS=READ;WRITE');
const exportDir = await mkdtemp(path.join(os.tmpdir(), 'trillium-mcp-live-'));
const direct = new TrilliumClient(config);
const childEnv = Object.fromEntries(Object.entries({ ...process.env, TRILLIUM_EXPORTS_DIR: exportDir, TRILLIUM_PERMISSIONS: 'READ;WRITE' }).filter((entry): entry is [string, string] => entry[1] !== undefined));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve('dist/index.js')],
  env: childEnv,
  stderr: 'pipe',
});
const mcp = new Client({ name: 'trillium-mcp-live-test', version: '0.2.0' });
await mcp.connect(transport);

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let testRoot: string | undefined;
let temporaryWeekAttribute: string | undefined;
const newCalendarNotes: string[] = [];

async function call(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await mcp.callTool({ name, arguments: args }) as { content: Array<{ text?: string }>; isError?: boolean };
  const text = (result.content[0] as { text?: string })?.text || '';
  if (result.isError) throw new Error(`${name}: ${text}`);
  console.log(`ok - ${name}`);
  return text;
}
function idFrom(text: string, pattern = /(?:note|Note) ([A-Za-z0-9_]{4,32})/): string {
  const match = text.match(pattern);
  if (!match) throw new Error(`Could not parse ID from: ${text}`);
  return match[1];
}
async function existingFor(query: string): Promise<Set<string>> {
  const response = await direct.searchNotes({ search: query, includeArchivedNotes: false, limit: 100 });
  return new Set(response.results.map(({ noteId }) => noteId));
}

try {
  const tools = await mcp.listTools();
  assert.equal(tools.tools.length, 38);

  testRoot = idFrom(await call('note_create', { parentNoteId: 'root', title: `MCP v0.2 live ${suffix}`, content: '# Live test\nbase line', type: 'text' }));
  const alpha = idFrom(await call('note_create', { parentNoteId: testRoot, title: `Alpha ${suffix}`, content: 'first\nneedle old\nlast', type: 'code', mime: 'text/markdown' }));
  const betaCreate = await call('note_create', { parentNoteId: testRoot, title: `Beta ${suffix}`, content: 'beta', type: 'text' });
  const beta = idFrom(betaCreate);
  assert.match(await call('notes_search', { query: suffix, limit: 20 }), new RegExp(testRoot));
  assert.match(await call('note_get', { noteId: alpha }), /needle old/);
  await call('note_overwrite', { noteId: alpha, title: `Alpha updated ${suffix}`, content: 'first\nneedle old\nlast' });
  await call('note_prepend', { noteId: alpha, content: 'prepended' });
  await call('note_append', { noteId: alpha, content: 'appended' });
  await call('note_edit', { noteId: alpha, old_string: 'needle old', new_string: 'needle new' });
  assert.match(await call('note_grep', { noteId: alpha, pattern: 'needle new', context_lines: 1 }), /matching line/);
  assert.match(await call('note_get_lines', { noteId: alpha, start_line: -2, end_line: -1 }), /appended/);
  await call('note_reorder', { noteId: beta, parentNoteId: testRoot, position: 'first' });
  await call('note_reorder_children', { parentNoteId: testRoot, sortBy: 'title' });
  assert.match(await call('note_list_children', { noteId: testRoot }), new RegExp(alpha));

  const attributeText = await call('attributes_create', { noteId: alpha, type: 'label', name: `mcpLive${suffix.replace(/-/g, '')}`, value: 'one', position: 10, isInheritable: true });
  const attribute = idFrom(attributeText, /attribute ([A-Za-z0-9_]{4,32})/i);
  await call('attributes_get', { attributeId: attribute });
  await call('attributes_update', { attributeId: attribute, value: 'two', position: 20 });
  await call('attributes_delete', { attributeId: attribute });

  const branchText = await call('branches_create', { noteId: beta, parentNoteId: alpha, prefix: 'linked ', notePosition: 10, isExpanded: false });
  const branch = idFrom(branchText, /branch ([A-Za-z0-9_]{4,32})/i);
  await call('branches_get', { branchId: branch });
  await call('branches_update', { branchId: branch, prefix: 'updated ', notePosition: 20 });
  await call('branches_delete', { branchId: branch });

  await call('note_create_revision', { noteId: alpha, description: 'v0.2 live test' });
  const revisions = await call('note_list_revisions', { noteId: alpha, limit: 20 });
  const revision = idFrom(revisions, /\[([A-Za-z0-9_]{4,32})\]/);
  assert.match(await call('revision_get', { revisionId: revision, includeContent: true }), /needle new/);

  const original = Buffer.from([0, 255, 1, 128, 65, 66, 67]);
  const attachmentText = await call('attachments_create', { ownerId: alpha, role: 'file', mime: 'application/octet-stream', title: '../live.bin', content: original.toString('base64') });
  const attachment = idFrom(attachmentText, /attachment ([A-Za-z0-9_]{4,32})/i);
  assert.match(await call('note_list_attachments', { noteId: alpha }), new RegExp(attachment));
  await call('attachments_get', { attachmentId: attachment });
  const saved = await call('attachments_get_content', { attachmentId: attachment });
  const savedPath = saved.match(/ to (.+)$/)?.[1];
  assert.ok(savedPath && path.dirname(savedPath) === exportDir);
  assert.deepEqual(await readFile(savedPath), original);
  await call('attachments_update', { attachmentId: attachment, title: 'live-updated.bin', position: 20 });
  const replacement = Buffer.from('replacement bytes');
  await call('attachments_update_content', { attachmentId: attachment, content: replacement.toString('base64'), mime: 'text/plain' });
  const savedReplacement = await call('attachments_get_content', { attachmentId: attachment });
  assert.deepEqual(await readFile(savedReplacement.match(/ to (.+)$/)![1]), replacement);
  await call('attachments_delete', { attachmentId: attachment });

  assert.match(await call('notes_history', { ancestorNoteId: testRoot, limit: 50 }), new RegExp(alpha));
  await call('note_delete', { noteId: alpha });
  assert.match(await call('notes_history', { ancestorNoteId: 'root', limit: 500, deletedOnly: true }), new RegExp(alpha));
  await call('note_undelete', { noteId: alpha });
  assert.match(await call('note_get', { noteId: alpha, includeContent: false }), new RegExp(alpha));

  const calendarQueries = ['#yearNote=2099', '#monthNote=2099-06', '#weekNote=2099-W25', '#dateNote=2099-06-15'];
  const beforeCalendar = await Promise.all(calendarQueries.map(existingFor));
  const calendarRoots = await direct.searchNotes({ search: '#calendarRoot', limit: 10 });
  assert.equal(calendarRoots.results.length, 1, 'Expected exactly one calendar root');
  const existingWeekSetting = await direct.searchNotes({ search: '#enableWeekNote', limit: 10 });
  if (existingWeekSetting.results.length === 0) {
    const weekAttributeText = await call('attributes_create', { noteId: calendarRoots.results[0].noteId, type: 'label', name: 'enableWeekNote', value: '' });
    temporaryWeekAttribute = idFrom(weekAttributeText, /attribute ([A-Za-z0-9_]{4,32})/i);
  }

  const calendarCalls: Array<[string, Record<string, unknown>]> = [
    ['calendar_get_year', { year: '2099' }], ['calendar_get_month', { month: '2099-06' }],
    ['calendar_get_week', { week: '2099-W25' }], ['calendar_get_day', { date: '2099-06-15' }],
    ['inbox_get', { date: '2099-06-15' }],
  ];
  for (const [name, args] of calendarCalls) {
    const id = idFrom(await call(name, args), /noteId=([A-Za-z0-9_]{4,32})/);
    if (!beforeCalendar.some((set) => set.has(id)) && !newCalendarNotes.includes(id)) newCalendarNotes.push(id);
  }

  console.log('Live MCP integration passed.');
} finally {
  if (temporaryWeekAttribute) await call('attributes_delete', { attributeId: temporaryWeekAttribute }).catch((error) => console.error(`cleanup: ${error}`));
  for (const noteId of [...newCalendarNotes].reverse()) await call('note_delete', { noteId }).catch((error) => console.error(`cleanup: ${error}`));
  if (testRoot) await call('note_delete', { noteId: testRoot }).catch((error) => console.error(`cleanup: ${error}`));
  await mcp.close().catch(() => undefined);
  await direct.close().catch(() => undefined);
  await rm(exportDir, { recursive: true, force: true });
}
