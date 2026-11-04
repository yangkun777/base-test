const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeText, enrichRun } = require('../lib/engine');

test('extracts brand names before model parentheses, colons and mixed case', () => {
  const text = '- **Phoenix Contact (CHARX connect eco / comfort)**\n- **LAPP**\n- **miio**\n- **Mennekes:** charging cables\n- **DEGSON**';
  const mentions = analyzeText(text).mentions;
  assert.deepEqual(mentions.map(x => x.brandName.toLowerCase()), ['phoenix contact', 'lapp', 'miio', 'mennekes', 'degson']);
  assert.equal(mentions[0].firstIndex, text.indexOf('Phoenix Contact'));
});

test('does not classify certification and generic headings as brands', () => {
  const mentions = analyzeText('**CE:** marking\n**UL:** approval\n**Key Considerations:** review requirements').mentions;
  assert.deepEqual(mentions, []);
});

test('extracts all-caps and industry-suffix brands from bullet lists', () => {
  const text = [
    '- **OMG** (https://example.com/a)',
    '- **MIDA** (https://example.com/b)',
    '- **UTL (Utility)** (https://example.com/c)',
    '- **Kangyu Terminal** (https://example.com/d)',
    '- **AOSI** (https://example.com/e)'
  ].join('\n');
  const names = analyzeText(text).mentions.map(item => item.brandName);
  assert.deepEqual(names, ['OMG', 'MIDA', 'UTL', 'Kangyu Terminal', 'AOSI']);
});

test('reanalysis is labelled without modifying the input record', () => {
  const run = { results: [{ status: 'ok', answer: '**Mennekes:**', mentions: [] }] };
  const result = enrichRun(run);
  assert.equal(result.analysis.reanalyzed, true);
  assert.ok(result.analysis.parserVersion);
  assert.deepEqual(run.results[0].mentions, []);
  assert.equal(result.results[0].mentions[0].brandName, 'Mennekes');
});
