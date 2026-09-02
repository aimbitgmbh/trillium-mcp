import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { loadConfig } from '../src/config.js';
import { getToolDefinitions, toolRegistry } from '../src/tools/index.js';

const readConfig = loadConfig({ TRILLIUM_API_URL: 'http://localhost:8080/etapi', TRILLIUM_API_TOKEN: 'x' });
const writeConfig = loadConfig({ TRILLIUM_API_URL: 'http://localhost:8080/etapi', TRILLIUM_API_TOKEN: 'x', TRILLIUM_PERMISSIONS: 'READ;WRITE' });

test('registry exposes 13 read tools and 38 full tools without duplicates', () => {
  assert.equal(getToolDefinitions(readConfig).length, 13);
  assert.equal(getToolDefinitions(writeConfig).length, 38);
  assert.equal(new Set(toolRegistry.map(({ name }) => name)).size, 38);
  assert.equal(toolRegistry.filter(({ permission }) => permission === 'write').length, 25);
});

test('all generated input schemas compile and use real booleans', () => {
  const ajv = new Ajv2020({ strict: false });
  for (const tool of getToolDefinitions(writeConfig)) {
    assert.doesNotThrow(() => ajv.compile(tool.inputSchema), tool.name);
    assert.ok(!JSON.stringify(tool.inputSchema).includes('"type":["boolean","string"]'), tool.name);
    assert.equal((tool.inputSchema as { additionalProperties?: boolean }).additionalProperties, false, tool.name);
  }
  const update = getToolDefinitions(writeConfig).find(({ name }) => name === 'note_overwrite')!;
  assert.equal(ajv.compile(update.inputSchema)({ noteId: 'abcd' }), false);
});

test('week schema and non-empty updates are strict', () => {
  const week = toolRegistry.find(({ name }) => name === 'calendar_get_week')!;
  assert.deepEqual(week.schema.parse({ week: '2099-W25' }), { week: '2099-W25' });
  assert.throws(() => week.schema.parse({ date: '2099-06-15' }));
  assert.throws(() => toolRegistry.find(({ name }) => name === 'attributes_update')!.schema.parse({ attributeId: 'abcd' }));
  assert.throws(() => toolRegistry.find(({ name }) => name === 'attributes_update')!.schema.parse({ attributeId: 'abcd', isInheritable: true }));
  assert.throws(() => toolRegistry.find(({ name }) => name === 'branches_update')!.schema.parse({ branchId: 'abcd', isExpanded: true }));
});

test('tool schema surface remains compact for small local models', () => {
  assert.ok(JSON.stringify(getToolDefinitions(writeConfig)).length < 21_000);
});
