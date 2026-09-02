import assert from 'node:assert/strict';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { loadConfig } from '../src/config.js';
import { getToolDefinitions } from '../src/tools/index.js';

const baseUrl = process.env.OPENAI_BASE_URL?.replace(/\/+$/, '');
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
if (!baseUrl || !apiKey || !model) throw new Error('Set OPENAI_BASE_URL, OPENAI_API_KEY, and OPENAI_MODEL');

const config = loadConfig({ TRILLIUM_API_URL: 'http://localhost:8080/etapi', TRILLIUM_API_TOKEN: 'evaluation-only', TRILLIUM_PERMISSIONS: 'READ;WRITE' });
const definitions = getToolDefinitions(config);
const tools = definitions.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
const schemas = new Map(definitions.map((tool) => [tool.name, tool.inputSchema]));
const ajv = new Ajv2020({ strict: false });

interface Case { prompt: string; expected?: string; check?: (args: Record<string, unknown>) => boolean }
const cases: Case[] = [
  { prompt: 'Suche in Trilium nach Notizen zum Projekt Alpha, maximal 7 Treffer.', expected: 'notes_search', check: (a) => a.query === 'Projekt Alpha' && a.limit === 7 },
  { prompt: 'Hole die Notiz abcd1234 samt Inhalt.', expected: 'note_get', check: (a) => a.noteId === 'abcd1234' },
  { prompt: 'Erstelle unter root eine Textnotiz mit Titel Einkauf und Inhalt Milch.', expected: 'note_create', check: (a) => a.parentNoteId === 'root' && a.title === 'Einkauf' },
  { prompt: 'Ersetze den gesamten Inhalt von abcd1234 durch Fertig.', expected: 'note_overwrite', check: (a) => a.noteId === 'abcd1234' && typeof a.content === 'string' && a.content.startsWith('Fertig') },
  { prompt: 'Ändere in Notiz abcd1234 exakt alt zu neu, überall.', expected: 'note_edit', check: (a) => a.replace_all === true },
  { prompt: 'Zeige mir die letzten zehn Zeilen der Notiz abcd1234.', expected: 'note_get_lines', check: (a) => a.start_line === -10 && a.end_line === -1 },
  { prompt: 'Liste die direkten Kinder von abcd1234 alphabetisch.', expected: 'note_list_children', check: (a) => a.sortBy === 'title' },
  { prompt: 'Lege für abcd1234 einen Snapshot mit Beschreibung vor Umbau an.', expected: 'note_create_revision', check: (a) => a.description === 'vor Umbau' },
  { prompt: 'Liste die letzten 5 Revisionen von abcd1234.', expected: 'note_list_revisions', check: (a) => a.limit === 5 },
  { prompt: 'Hole Revision revA1234 inklusive Inhalt.', expected: 'revision_get', check: (a) => a.revisionId === 'revA1234' },
  { prompt: 'Zeige nur gelöschte Einträge im Verlauf unter root, maximal 25.', expected: 'notes_history', check: (a) => a.deletedOnly === true && a.limit === 25 },
  { prompt: 'Stelle die gelöschte Notiz abcd1234 wieder her.', expected: 'note_undelete' },
  { prompt: 'Liste alle Anhänge der Notiz abcd1234.', expected: 'note_list_attachments' },
  { prompt: 'Lade den Anhang attA1234 lokal herunter.', expected: 'attachments_get_content' },
  { prompt: 'Erstelle an abcd1234 die Datei a.txt aus Base64 YWJj, MIME text/plain, Rolle file.', expected: 'attachments_create', check: (a) => a.content === 'YWJj' },
  { prompt: 'Hole oder erstelle die Kalenderwoche 25 im Jahr 2099.', expected: 'calendar_get_week', check: (a) => a.week === '2099-W25' && !('date' in a) },
  { prompt: 'Füge auf abcd1234 das vererbbare Label projekt=alpha hinzu.', expected: 'attributes_create', check: (a) => a.isInheritable === true && a.type === 'label' },
  { prompt: 'Verlinke die existierende Notiz abcd1234 zusätzlich unter parent123.', expected: 'branches_create' },
  { prompt: 'Was ist die Hauptstadt von Frankreich? Nutze kein Trilium-Werkzeug.', check: () => true },
];

let passed = 0;
for (const [index, evaluation] of cases.entries()) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, temperature: 0, parallel_tool_calls: false, tools,
      messages: [
        { role: 'system', content: 'Du bist ein präziser MCP-Assistent. Nutze genau das passende Werkzeug, wenn Trilium betroffen ist. Erfinde keine IDs oder Parameter.' },
        { role: 'user', content: evaluation.prompt },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Model API ${response.status}: ${(await response.text()).slice(0, 1_000)}`);
  const payload = await response.json() as { choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }> };
  const calls = payload.choices?.[0]?.message?.tool_calls || [];
  if (!evaluation.expected) {
    assert.equal(calls.length, 0, `case ${index + 1}: expected no tool, got ${calls[0]?.function?.name}`);
  } else {
    assert.equal(calls.length, 1, `case ${index + 1}: expected exactly one tool`);
    const selected = calls[0].function?.name;
    assert.equal(selected, evaluation.expected, `case ${index + 1}: ${evaluation.prompt}`);
    const args = JSON.parse(calls[0].function?.arguments || '{}') as Record<string, unknown>;
    const validate = ajv.compile(schemas.get(selected!)!);
    assert.equal(validate(args), true, `case ${index + 1}: invalid args ${ajv.errorsText(validate.errors)}`);
    assert.equal(evaluation.check?.(args) ?? true, true, `case ${index + 1}: wrong arguments ${JSON.stringify(args)}`);
  }
  passed += 1;
  console.log(`ok ${index + 1} - ${evaluation.expected || 'no tool'}`);
}

console.log(`Model evaluation passed: ${passed}/${cases.length}; schema payload=${JSON.stringify(tools).length} characters; model=${model}`);
