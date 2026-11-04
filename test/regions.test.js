const test = require('node:test');
const assert = require('node:assert/strict');
const { REGIONS, resolveRegion, regionRejected } = require('../lib/engine');

test('the selectable locations carry GPT and Gemini search location parameters', () => {
  for (const id of ['cz', 'de', 'eu', 'us', 'cn']) {
    const region = resolveRegion(id);
    assert.equal(region.id, id);
    assert.ok(region.gpt?.country);
    assert.ok(Number.isFinite(region.gemini?.latLng?.latitude));
    assert.ok(region.gemini?.languageCode);
  }
  assert.equal(REGIONS.eu.gpt.country, 'DE');
  assert.match(REGIONS.eu.label, /欧洲/);
});

test('content policy failures are not mistaken for invalid location parameters', () => {
  assert.equal(regionRejected('Invalid prompt: your prompt was flagged as potentially violating our usage policy'), false);
  assert.equal(regionRejected('Invalid value for user_location.country: DE'), true);
  assert.equal(regionRejected("Unknown parameter: 'user_location'"), true);
  assert.equal(regionRejected('Unknown parameter: max_tool_calls'), false);
});
