const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareRun } = require('../lib/run-record');

const questions = [
  { id: 'q1', text: 'First question?' },
  { id: 'q2', text: 'Second question?' }
];
const models = [
  { id: 'gpt', label: 'GPT', model: 'gpt-test' },
  { id: 'gemini', label: 'Gemini', model: 'gemini-test' }
];
const answer = { questionId: 'q1', modelId: 'gpt', regionId: 'eu', status: 'ok', answer: 'Answer' };

test('user-stopped run keeps only completed results and questions', () => {
  const run = prepareRun({ regionId: 'eu', questions, models, results: [answer], stoppedByUser: true }, questions);
  assert.equal(run.stoppedByUser, true);
  assert.equal(run.plannedCount, 4);
  assert.equal(run.results.length, 1);
  assert.deepEqual(run.questions, [questions[0]]);
});

test('stopping before the first reply saves an empty, clearly stopped run', () => {
  const run = prepareRun({ regionId: 'eu', questions, models, results: [], stoppedByUser: true }, questions);
  assert.equal(run.results.length, 0);
  assert.deepEqual(run.questions, []);
});

test('an ordinary completed run cannot omit planned calls', () => {
  assert.throws(() => prepareRun({ regionId: 'eu', questions, models, results: [answer] }, questions), /未完成/);
});

test('duplicate results cannot inflate the stopped-run denominator', () => {
  assert.throws(() => prepareRun({ regionId: 'eu', questions, models, results: [answer, answer], stoppedByUser: true }, questions), /重复/);
});
