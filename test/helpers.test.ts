import assert from 'node:assert/strict';
import test from 'node:test';
import { extractLines, hybridMatch, sanitizeFilename, smartReplace } from '../src/tools/helpers.js';

test('smart replacement maps flexible whitespace to original text', () => {
  const value = smartReplace('alpha  beta\ngamma', 'alpha beta gamma', 'done');
  assert.equal(value.result, 'done');
  assert.equal(value.strategy, 'whitespace');
});

test('replacement refuses ambiguous input unless replace_all is set', () => {
  assert.equal(smartReplace('one one', 'one', 'two').strategy, 'ambiguous');
  assert.equal(smartReplace('one one', 'one', 'two', true).result, 'two two');
  const html = hybridMatch('<p>same</p><p>same</p>', 'same', 'new', true);
  assert.equal(html.success, true);
  assert.equal(html.result, '<p>new</p><p>new</p>');
});

test('line extraction supports negative line numbers', () => {
  assert.deepEqual(extractLines('a\nb\nc\nd', -2, -1), { lines: 'c\nd', totalLines: 4, actualStart: 3, actualEnd: 4 });
});

test('download filenames cannot traverse directories', () => {
  assert.equal(sanitizeFilename('../../secret?.pdf'), '_.._secret_.pdf');
  assert.ok(!sanitizeFilename('../../secret').includes('/'));
});
