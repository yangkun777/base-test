const test = require('node:test');
const assert = require('node:assert/strict');
const baseline = require('../data/runs/run-2026-10-22-054420.json');
const pending = require('../config/questions.json');
const { mergeWithBaseline } = require('../lib/reuse-run');

test('combines old replies with new results without changing the old answers', () => {
  const next = {
    models: baseline.models,
    questions: [{ id: 'q24', text: 'A new English question?' }],
    results: [{ questionId: 'q24', modelId: 'gpt', status: 'ok', answer: 'New answer' }]
  };
  const merged = mergeWithBaseline(baseline, next);
  assert.equal(merged.questions.length, 24);
  assert.equal(merged.results.length, 47);
  assert.equal(merged.results[0].answer, baseline.results[0].answer);
  assert.equal(merged.results[0].modelName, baseline.results[0].modelName);
  assert.equal(merged.results[0].reusedFromRunId, baseline.id);
  assert.equal(merged.results.at(-1).answer, 'New answer');
});

test('only reuses replies for selected models', () => {
  const merged = mergeWithBaseline(baseline, {
    models: [baseline.models[0]],
    questions: [],
    results: []
  });
  assert.equal(merged.questions.length, 23);
  assert.equal(merged.results.length, 23);
  assert.ok(merged.results.every(result => result.modelId === 'gpt'));
});

test('rejects a question already present in the reused baseline', () => {
  assert.throws(() => mergeWithBaseline(baseline, {
    models: baseline.models,
    questions: [{ id: 'q99', text: baseline.questions[0].text }],
    results: []
  }), /重复/);
});

test('rejects current bank questions that already exist in the reused baseline', () => {
  assert.throws(() => mergeWithBaseline(baseline, {
    models: baseline.models,
    questions: pending,
    results: []
  }), /重复/);
});

test('current question bank combines with 23 historical questions without duplicates', () => {
  const fresh = pending.filter(question =>
    !baseline.questions.some(old => old.id === question.id || old.text === question.text)
  );
  const merged = mergeWithBaseline(baseline, {
    models: baseline.models,
    questions: fresh,
    results: []
  });
  assert.ok(fresh.length > 0);
  assert.equal(merged.questions.length, baseline.questions.length + fresh.length);
  assert.equal(merged.results.length, 46);
  assert.equal(new Set(merged.questions.map(question => question.text)).size, merged.questions.length);
});
