const assert = require('node:assert/strict');
const {
  classifyHost,
  cleanUrl,
  allSourcesForAnswer,
  sourcesForAnswer,
  summarizeSources,
  attachSources
} = require('../lib/citation-sources');

const answer = [
  '- **DEGSON** — CE and TÜV. ([degson.com](https://degson.com/content/details_472.html))',
  '- **Slocable** — ([slocable.com.cn](https://www.slocable.com.cn/cable))'
].join('\n');
const degsonAt = answer.indexOf('DEGSON');
const matches = [{ brandId: 'degson', start: degsonAt, end: degsonAt + 6 }];

const degsonOnly = sourcesForAnswer(answer, matches, [], []);
assert.equal(degsonOnly.length, 1);
assert.equal(degsonOnly[0].kind, 'official');
assert.equal(degsonOnly[0].host, 'degson.com');
assert.equal(degsonOnly[0].degsonRelated, true);

const all = allSourcesForAnswer(answer, matches, [], []);
assert.equal(all.length, 2);
assert.equal(all.find(item => item.host === 'slocable.com.cn').kind, 'competitor');

const linkedin = sourcesForAnswer(
  '- **DEGSON** profile ([LinkedIn](https://www.linkedin.com/company/degson))',
  [{ brandId: 'degson', start: 4, end: 10 }],
  [],
  []
);
assert.equal(linkedin[0].kind, 'social');
assert.equal(classifyHost('www.linkedin.com').id, 'social');
assert.equal(classifyHost('degson.com.cn').id, 'official');
assert.equal(classifyHost('en.degson.com').id, 'official');
assert.equal(classifyHost('www.tme.eu').id, 'distributor');
assert.equal(classifyHost('www.ul.com').id, 'certification');
assert.equal(classifyHost('www.phoenixcontact.com').id, 'competitor');
assert.equal(classifyHost('www.connectorsupplier.com').id, 'media');
assert.equal(classifyHost('www.gminsights.com').id, 'research');
assert.equal(classifyHost('www.alibaba.com').id, 'marketplace');
assert.equal(classifyHost('evmotions.cz').id, 'local');
assert.equal(classifyHost('viox.com').id, 'directory');
assert.equal(classifyHost('nectogroup.com').id, 'distributor');
assert.equal(classifyHost('utl-electric.com').id, 'competitor');
assert.equal(classifyHost('ebikes.ca').id, 'local');
assert.equal(classifyHost('ebikegaragehq.com').id, 'media');
assert.equal(classifyHost('agxconnector.com').id, 'competitor');
assert.equal(classifyHost('connoder.com').id, 'media');
assert.equal(classifyHost('digikey.de').id, 'distributor');
assert.equal(classifyHost('wwwtest.degson.com').id, 'test');
assert.equal(cleanUrl('https://degson.com/x?utm_source=openai'), 'https://degson.com/x');
assert.equal(cleanUrl('https://degson.com/x`'), 'https://degson.com/x');
const deduped = allSourcesForAnswer('**DEGSON** [a](https://degson.com/x?utm_source=openai) and [b](https://degson.com/x)', [{ brandId: 'degson', start: 0, end: 8 }], [], []);
assert.equal(deduped.length, 1);
assert.equal(deduped[0].url, 'https://degson.com/x');
assert.equal(deduped[0].rawUrls.length, 2);

const prose = '### 4. Degson\nTheir cables are CE certified.\n### 5. Zencar';
const degsonIndex = prose.indexOf('Degson');
const fromCitation = sourcesForAnswer(prose, [{ brandId: 'degson', start: degsonIndex, end: degsonIndex + 6 }], [
  { url: 'https://www.degson.com/ev', title: 'EV cables', start: prose.indexOf('### 4'), end: prose.indexOf('### 5'), segment: '### 4. Degson\nTheir cables are CE certified.' },
  { url: 'https://zencar.com/a', title: 'Zencar', start: prose.indexOf('Zencar'), end: prose.length, segment: '### 5. Zencar' }
], []);
assert.equal(fromCitation.length, 1);
assert.equal(fromCitation[0].host, 'degson.com');

const retrieval = allSourcesForAnswer('**DEGSON** is listed.', [{ brandId: 'degson', start: 2, end: 8 }], [], [
  { url: 'https://www.tme.eu/degson', title: 'TME DEGSON' },
  { url: 'https://example.com/other', title: 'Other' }
]);
assert.equal(retrieval.length, 2);
assert.equal(retrieval[0].kind, 'distributor');
assert.equal(retrieval[0].degsonRelated, false);
assert.deepEqual(retrieval[0].brands, []);

const results = [
  { status: 'ok', questionId: 'q1', modelId: 'gpt', mentions: [{ brandId: 'degson' }], matches, answer, citations: [], retrievalSources: [] },
  { status: 'ok', questionId: 'q2', modelId: 'gemini', mentions: [{ brandId: 'degson' }], matches: [{ brandId: 'degson', start: 0, end: 6 }], answer: '**DEGSON** only', citations: [], retrievalSources: [] },
  { status: 'ok', questionId: 'q3', modelId: 'gpt', mentions: [{ brandId: 'wago' }], matches: [], answer: 'WAGO is recommended. ([wago.com](https://www.wago.com/a))', citations: [{ url: 'https://www.wago.com/a', title: 'WAGO' }], retrievalSources: [] }
];
const summary = summarizeSources(results, [
  { id: 'q1', category: '端子台' },
  { id: 'q2', category: '端子台' },
  { id: 'q3', category: '端子台' }
]);
assert.equal(summary.mentioned, 2);
assert.equal(summary.sourced, 1);
assert.equal(summary.unsourced, 1);
assert.equal(summary.allCitationCount, 3);
assert.equal(summary.degson.citationCount, 1);
assert.equal(summary.uniqueUrlCount, 3);
assert.equal(summary.uniqueHostCount, 3);
assert.equal(summary.absent.brandAnswers, 1);
assert.equal(summary.absent.noBrandAnswers, 0);
assert.equal(summary.absent.citationCount, 1);
assert.equal(summary.models.find(item => item.modelId === 'gpt').sourced, 1);
assert.equal(summary.models.find(item => item.modelId === 'gemini').sourced, 0);
const gptModel = summary.models.find(item => item.modelId === 'gpt');
const geminiModel = summary.models.find(item => item.modelId === 'gemini');
assert.equal(gptModel.categories.find(item => item.id === 'official').count, 1);
assert.equal(geminiModel.categories.length, 0);
assert.equal(gptModel.degson.citationCount, 1);
assert.equal(geminiModel.degson.citationCount, 0);
assert.match(summary.advice, /Gemini|没有引用/);
assert.equal(summary.allCategories.find(item => item.id === 'official').count, 1);
assert.equal(summary.allCategories.find(item => item.id === 'competitor').count, 2);
assert.equal(summary.byCategory[0].category, '端子台');
assert.equal(summary.byCategory[0].answers, 3);
assert.equal(summary.absent.topHosts[0].host, 'wago.com');

const attached = attachSources({
  status: 'ok',
  answer,
  matches,
  citations: [],
  retrievalSources: []
});
assert.equal(attached.sources.length, 2);
assert.equal(attached.degsonSources.length, 1);
console.log('citation-sources ok');
