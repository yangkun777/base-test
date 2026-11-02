const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRunDocx } = require('../lib/export-docx');

function report(regionLabel) {
  return {
    id: 'run-test',
    createdAt: '2026-10-30T00:00:00.000Z',
    regionLabel,
    models: [],
    questions: [],
    results: []
  };
}

test('Word export states the region recorded on this run', () => {
  const docx = buildRunDocx(report('美国（纽约）'));
  assert.ok(docx.includes(Buffer.from('本轮测试地区：美国（纽约）')));
});

test('Word export marks historical runs without recorded region', () => {
  const docx = buildRunDocx(report(undefined));
  assert.ok(docx.includes(Buffer.from('本轮测试地区：历史轮次未记录地区')));
});

test('Word export explains an interrupted run and its actual count', () => {
  const run = report('欧洲（德国柏林）');
  run.stoppedByUser = true;
  run.plannedCount = 100;
  run.questions = [{ id: 'q1', text: 'Question?' }];
  run.results = [{ questionId: 'q1', modelId: 'gpt', status: 'error', error: 'Failed' }];
  const docx = buildRunDocx(run);
  assert.ok(docx.includes(Buffer.from('用户中途主动停止：实际完成 1 / 原计划 100 条调用')));
});

test('Word export distinguishes an untested model from a failed call after stopping', () => {
  const run = report('欧洲（德国柏林）');
  run.stoppedByUser = true;
  run.plannedCount = 2;
  run.models = [{ id: 'gpt', label: 'GPT' }, { id: 'gemini', label: 'Gemini' }];
  run.questions = [{ id: 'q1', text: 'Question?' }];
  run.results = [{
    questionId: 'q1', modelId: 'gpt', status: 'ok', answer: 'DEGSON',
    mentions: [{ brandId: 'degson', brandName: 'DEGSON', rank: 1 }]
  }];
  const docx = buildRunDocx(run);
  assert.ok(docx.includes(Buffer.from('未测试（已停止）')));
});

test('Word export includes the dashboard overview, brand rates, top twelve ranking, and answer summary', () => {
  const run = report('欧洲（德国柏林）');
  run.models = [{ id: 'gpt', label: 'GPT' }, { id: 'gemini', label: 'Gemini' }];
  run.questions = [{ id: 'q1', text: 'Which brands?' }];
  run.brands = [
    { id: 'degson', name: 'DEGSON', self: true },
    { id: 'phoenix', name: 'Phoenix Contact', self: false }
  ];
  run.results = [
    { questionId: 'q1', modelId: 'gpt', status: 'ok', answer: '- **Phoenix Contact**\n- **DEGSON**', mentions: [
      { brandId: 'phoenix', brandName: 'Phoenix Contact', rank: 1 },
      { brandId: 'degson', brandName: 'DEGSON', rank: 2 }
    ] },
    { questionId: 'q1', modelId: 'gemini', status: 'ok', answer: '- **DEGSON**', mentions: [
      { brandId: 'degson', brandName: 'DEGSON', rank: 1 }
    ] }
  ];
  const docx = buildRunDocx(run);
  for (const label of ['本轮概览', '品牌综合得分', '模型覆盖率', '各品牌提及率', '各品牌首次提及及排名', '模型原始回答', 'Phoenix Contact', '2 / 2（100.0%）', '前 3 位']) {
    assert.ok(docx.includes(Buffer.from(label)), label);
  }
});
