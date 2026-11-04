const assert = require('node:assert/strict');
const { classifySourceAuthority } = require('../lib/source-authority');
const { summarizeSources } = require('../lib/citation-sources');

assert.equal(classifySourceAuthority({ host: 'degson.com', kind: 'official' }).authority, 'manufacturer');
assert.equal(classifySourceAuthority({ host: 'degson.com', kind: 'official' }).ownership, 'first_party');
assert.equal(classifySourceAuthority({ host: 'en.degson.com', kind: 'official' }).ownership, 'first_party');
assert.equal(classifySourceAuthority({ host: 'wago.com', kind: 'competitor' }).authority, 'manufacturer');
assert.equal(classifySourceAuthority({ host: 'wago.com', kind: 'competitor' }).ownership, 'third_party');
assert.equal(classifySourceAuthority({ host: 'productiq.ul.com', kind: 'certification' }).authority, 'certification_body');
assert.equal(classifySourceAuthority({ host: 'viox.com', kind: 'directory' }).authority, 'directory');
assert.equal(classifySourceAuthority({ host: 'nectogroup.com', kind: 'distributor' }).authority, 'distributor');
assert.equal(classifySourceAuthority({ host: 'zbotic.in', kind: 'other' }).authority, 'blog_or_reseller');
assert.equal(classifySourceAuthority({ host: 'wwwtest.degson.com', kind: 'test' }).authority, 'unknown');
assert.equal(classifySourceAuthority({ host: 'wwwtest.degson.com', kind: 'test' }).ownership, 'unknown');
assert.equal(classifySourceAuthority({ host: 'example.com', kind: 'media' }).authority, 'trade_media');
assert.equal(classifySourceAuthority({ host: 'zbotic.in', kind: 'other', authorityOverride: 'directory' }).authority, 'directory');
assert.equal(classifySourceAuthority({ host: 'zbotic.in', kind: 'other', authorityOverride: 'directory' }).authoritySource, 'manual');

const summary = summarizeSources([
  {
    questionId: 'q1',
    modelId: 'gpt',
    status: 'ok',
    answer: 'https://degson.com/a https://wago.com/a https://viox.com/a https://zbotic.in/a https://productiq.ul.com/a https://wago.com/a',
    mentions: [{ brandId: 'degson', brandName: 'DEGSON' }],
    matches: []
  },
  {
    questionId: 'q1',
    modelId: 'gemini',
    status: 'ok',
    answer: 'https://wago.com/b https://zbotic.in/b',
    mentions: [],
    matches: []
  }
], [{ id: 'q1', category: '端子台' }]);

assert.equal(summary.byAuthority.reduce((sum, row) => sum + row.citations, 0), summary.allItems.length);
assert.equal(summary.authoritySummary.authoritativeThirdParty.citations, 2);
assert.equal(summary.authoritySummary.manufacturerClaims.citations, 3);
assert.equal(summary.authoritySummary.lowAuthority.citations, 2);
assert.equal(summary.authoritySummary.lowAuthority.answers, 2);
assert.equal(summary.models.find(model => model.modelId === 'gpt').byAuthority.reduce((sum, row) => sum + row.citations, 0), 5);
assert.equal(summary.models.find(model => model.modelId === 'gemini').byAuthority.find(row => row.id === 'blog_or_reseller').answers, 1);
assert.equal(summary.degson.byAuthority.find(row => row.id === 'manufacturer').firstPartyCitations, 1);
assert.equal(summary.absent.byAuthority.find(row => row.id === 'manufacturer').thirdPartyCitations, 1);
assert.ok(summary.byCategory[0].byAuthority.reduce((sum, row) => sum + row.citations, 0) > 0);
assert.equal(summary.allItems.find(item => item.host === 'degson.com').ownership, 'first_party');
assert.equal(summary.allItems.find(item => item.host === 'wago.com').ownership, 'third_party');
