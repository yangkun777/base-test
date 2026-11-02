const test = require('node:test');
const assert = require('node:assert/strict');
const { REGIONS, resolveRegion } = require('../lib/engine');

test('the three selectable locations all carry GPT and Gemini search location parameters', () => {
  for (const id of ['cn', 'us', 'eu']) {
    const region = resolveRegion(id);
    assert.equal(region.id, id);
    assert.ok(region.gpt?.country);
    assert.ok(Number.isFinite(region.gemini?.latLng?.latitude));
    assert.equal(region.gemini?.languageCode, 'en');
  }
  assert.equal(REGIONS.eu.gpt.country, 'DE');
  assert.match(REGIONS.eu.label, /欧洲/);
});
