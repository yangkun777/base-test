const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startReport, readReport, stopReport, previewReport, jobs, buildAnalysisStats } = require('../lib/analysis-report');

const CATEGORY = { q1: '端子台', q2: 'EV 充电连接器', q3: '其他及跨品类', q4: '储能连接器' };

function fixture() {
  return {
    id: 'run-analysis-v3-test',
    createdAt: '2026-10-30T00:00:00.000Z',
    regionLabel: '欧洲（德国柏林）',
    models: [{ id: 'gpt', label: 'GPT' }, { id: 'gemini', label: 'Gemini' }],
    plannedCount: 8,
    questions: [
      { id: 'q1', text: 'Which UL-certified PCB terminal blocks are recommended for 24V PLC controllers?' },
      { id: 'q2', text: 'Which Chinese EV charging cable brands have CE and TUV certification?' },
      { id: 'q3', text: 'How should engineers select wire size for a control cabinet?' },
      { id: 'q4', text: 'Which energy storage connector brands offer UL4128 products?' }
    ],
    results: [
      { questionId: 'q1', modelId: 'gpt', status: 'ok', answer: 'WAGO is recommended for PLC terminal blocks.', mentions: [{ brandId: 'wago', brandName: 'WAGO', rank: 1 }] },
      { questionId: 'q1', modelId: 'gemini', status: 'ok', answer: 'Degson and WAGO are both options.', mentions: [{ brandId: 'wago', brandName: 'WAGO', rank: 1 }, { brandId: 'degson', brandName: 'Degson', rank: 2 }] },
      { questionId: 'q2', modelId: 'gpt', status: 'ok', answer: 'TE Connectivity leads with CE and TUV.', mentions: [{ brandId: 'te', brandName: 'TE Connectivity', rank: 1 }] },
      { questionId: 'q2', modelId: 'gemini', status: 'error', error: 'upstream timeout' },
      { questionId: 'q3', modelId: 'gpt', status: 'ok', answer: 'Use 1.5 mm2 copper wire for control circuits.', mentions: [] },
      { questionId: 'q4', modelId: 'gpt', status: 'error', error: 'upstream timeout' },
      { questionId: 'q4', modelId: 'gemini', status: 'ok', answer: 'Degson offers UL4128 energy storage connectors.', mentions: [{ brandId: 'degson', brandName: 'Degson', rank: 1 }] }
    ]
  };
}

function response(text, extra = {}) {
  return { text: typeof text === 'string' ? text : JSON.stringify(text), usage: { inputTokens: 11, outputTokens: 22 }, model: 'test-model', sources: [], searchCalls: 0, searchQueries: [], ...extra };
}

function makeGenerate(log, overrides = {}) {
  return async ({ stage, input, signal }) => {
    log.push(stage);
    if (overrides[stage]) return overrides[stage]({ stage, input, signal });
    const data = JSON.parse(input);
    if (stage === 'classify') {
      return response({ questions: data.questions.map(question => ({ id: question.id, category: CATEGORY[question.id] || '其他及跨品类', intent: '认证合规' })) });
    }
    if (stage === 'analysis' || stage === 'analysis-compact') {
      return response({ questions: data.questions.map(question => ({ qid: question.qid, who: 'WAGO 被列为首选', degson: '未提及', gap: '资料不可发现', action: `给 ${question.qid} 补型号页与认证文件`, confidence: '中', evidenceLevel: 'E1' })) });
    }
    if (stage === 'research') {
      return response('核查到官网型号页 https://example.com/a', { searchCalls: 1, sources: [{ url: 'https://example.com/a', title: '型号页' }] });
    }
    if (stage === 'summary') {
      return response({ headline: '测试结论', summaryPoints: ['p1'], strengths: [], weaknesses: [], competitorGaps: [], actions: [{ priority: 1, title: '行动', questionIds: ['q1'], changes: ['改型号页'], owner: '产品', deliverable: '页面', acceptance: '可追溯' }], roadmap: { d30: [], d60: [], d90: [] }, retest: '复测', limits: '限制' });
    }
    throw new Error(`unexpected stage ${stage}`);
  };
}

function workspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-report-v3-'));
  return { directory, taxonomyFile: path.join(directory, 'taxonomy.json'), backupDirectory: path.join(directory, 'backups') };
}

test('stats keep method questions out of brand denominators', () => {
  const stats = buildAnalysisStats(fixture(), { q1: { category: '端子台', intent: '认证合规' }, q2: { category: 'EV 充电连接器', intent: '认证合规' }, q3: { category: '其他及跨品类', intent: '选型方法' }, q4: { category: '储能连接器', intent: '认证合规' } });
  assert.equal(stats.questionCount, 4);
  assert.equal(stats.excludedQuestionCount, 1);
  assert.equal(stats.excludedAnswerCount, 1);
  assert.equal(stats.brandAnswerCount, 4);
  const terminal = stats.categories.find(category => category.name === '端子台');
  assert.equal(terminal.rate.hits, 1);
  assert.equal(terminal.rate.denominator, 2);
  assert.equal(terminal.questionRate.hits, 1);
  assert.equal(terminal.questionRate.denominator, 1);
  const ev = stats.categories.find(category => category.name === 'EV 充电连接器');
  assert.equal(ev.rate.hits, 0);
  assert.equal(ev.rate.denominator, 1);
  assert.deepEqual(ev.missingQuestionIds, ['q2']);
  assert.equal(stats.brands.find(brand => brand.self).total, 2);
});

test('preview estimates calls without touching the model', () => {
  const space = workspace();
  const run = fixture();
  const preview = previewReport(run, { taxonomyFile: space.taxonomyFile });
  assert.equal(preview.status, 'missing');
  assert.equal(preview.stats.questionCount, 4);
  assert.equal(preview.estimatedAnalysisCalls, 1);
  assert.equal(preview.estimatedResearchCalls, 1);
  assert.equal(preview.estimatedCalls, 4);
  fs.rmSync(space.directory, { recursive: true, force: true });
});

test('generation runs every stage once and cached reads spend nothing', async () => {
  const space = workspace();
  const run = fixture();
  const log = [];
  try {
    startReport(run, { ...space, generate: makeGenerate(log) });
    await Promise.all([...jobs.values()]);
    const saved = readReport(run.id, space.directory);
    assert.equal(saved.status, 'complete');
    assert.equal(saved.version, 'geo-analysis-v3');
    assert.equal(Object.keys(saved.questionAnalysis).length, 4);
    assert.equal(saved.research[0].status, 'complete');
    assert.equal(saved.narrative.fallback, false);
    assert.equal(saved.quality.level, 'complete');
    assert.deepEqual(log, ['classify', 'analysis', 'research', 'summary']);
    startReport(run, { ...space, generate: makeGenerate(log) });
    assert.equal(log.length, 4);
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});

test('simultaneous starts attach to the same job', async () => {
  const space = workspace();
  const run = fixture();
  const log = [];
  try {
    startReport(run, { ...space, generate: makeGenerate(log) });
    startReport(run, { ...space, generate: makeGenerate(log) });
    await Promise.all([...jobs.values()]);
    assert.equal(log.filter(stage => stage === 'classify').length, 1);
    assert.equal(readReport(run.id, space.directory).status, 'complete');
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});

test('a failed batch leaves a partial report and is retried only on explicit resume', async () => {
  const space = workspace();
  const run = fixture();
  const log = [];
  let broken = true;
  const generate = async settings => {
    if (settings.stage === 'analysis' && broken) { log.push('analysis-failed'); throw new Error('upstream 500'); }
    return makeGenerate(log)(settings);
  };
  try {
    startReport(run, { ...space, generate });
    await Promise.all([...jobs.values()]);
    let saved = readReport(run.id, space.directory);
    assert.equal(saved.status, 'complete');
    assert.equal(saved.quality.level, 'partial');
    assert.equal(saved.quality.missingQuestionIds.length, 4);
    assert.equal(saved.narrative.fallback, false);
    broken = false;
    startReport(run, { ...space, generate });
    assert.equal(log.filter(stage => stage === 'classify').length, 1);
    await Promise.all([...jobs.values()]);
    saved = readReport(run.id, space.directory);
    assert.equal(Object.keys(saved.questionAnalysis).length, 4);
    assert.equal(saved.quality.level, 'complete');
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});

test('content rejection gets one compact retry instead of dropping the batch', async () => {
  const space = workspace();
  const run = fixture();
  const log = [];
  let rejected = false;
  const generate = async settings => {
    if (settings.stage === 'analysis' && !rejected) {
      rejected = true;
      log.push('analysis');
      throw new Error('HTTP 400: Invalid prompt: flagged as potentially violating usage policy');
    }
    if (settings.stage === 'analysis') log.push('analysis');
    return makeGenerate(log)(settings);
  };
  try {
    startReport(run, { ...space, generate });
    await Promise.all([...jobs.values()]);
    const saved = readReport(run.id, space.directory);
    assert.equal(saved.status, 'complete');
    assert.equal(saved.quality.level, 'complete');
    assert.ok(log.includes('analysis-compact'));
    assert.equal(Object.keys(saved.questionAnalysis).length, 4);
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});

test('stop aborts the active call and resume reuses saved stages', async () => {
  const space = workspace();
  const run = fixture();
  const log = [];
  const working = makeGenerate(log);
  const blocking = async settings => {
    if (settings.stage === 'analysis') {
      return new Promise((_resolve, reject) => {
        settings.signal.addEventListener('abort', () => reject(Object.assign(new Error('stopped'), { name: 'AbortError' })), { once: true });
      });
    }
    return working(settings);
  };
  try {
    startReport(run, { ...space, generate: blocking });
    await new Promise(resolve => setTimeout(resolve, 120));
    const stopped = await stopReport(run.id, { directory: space.directory });
    assert.equal(stopped.status, 'stopped');
    const callsAfterStop = log.length;
    startReport(run, { ...space, generate: working });
    await Promise.all([...jobs.values()]);
    const saved = readReport(run.id, space.directory);
    assert.equal(saved.status, 'complete');
    assert.ok(log.slice(callsAfterStop).every(stage => stage !== 'classify'));
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});

test('a JSON-wrapped research answer is stored as readable markdown', async () => {
  const space = workspace();
  const run = fixture();
  const log = [];
  const generate = makeGenerate(log, { research: () => response(JSON.stringify({ 报告: '## 核查结论\n\n来源：https://example.com/a' }), { searchCalls: 1, sources: [{ url: 'https://example.com/a', title: 'A' }] }) });
  try {
    startReport(run, { ...space, generate });
    await Promise.all([...jobs.values()]);
    const saved = readReport(run.id, space.directory);
    assert.equal(saved.research[0].text, '## 核查结论\n\n来源：https://example.com/a');
    assert.equal(saved.research[0].status, 'complete');
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});

test('summary failure falls back to a clearly marked partial report', async () => {
  const space = workspace();
  const run = fixture();
  const log = [];
  const generate = makeGenerate(log, { summary: () => { throw new Error('HTTP 400: Invalid prompt: flagged as potentially violating usage policy'); } });
  try {
    startReport(run, { ...space, generate });
    await Promise.all([...jobs.values()]);
    const saved = readReport(run.id, space.directory);
    assert.equal(saved.status, 'complete');
    assert.equal(saved.narrative.fallback, true);
    assert.equal(saved.quality.level, 'partial');
    assert.ok(saved.quality.reasons.includes('AI 汇总未完成，使用结构化兜底'));
    assert.ok(saved.narrative.actions.length >= 1);
    assert.match(saved.narrative.limits, /结构化兜底/);
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});

test('unverified research is retried and the summary rebuilt on explicit resume', async () => {
  const space = workspace();
  const run = fixture();
  const log = [];
  let verified = false;
  const generate = async settings => {
    if (settings.stage === 'research') {
      return verified
        ? response('## 已核验\n\nhttps://example.com/a', { searchCalls: 1, sources: [{ url: 'https://example.com/a', title: 'A' }] })
        : response('没有任何来源的检索摘要');
    }
    return makeGenerate(log)(settings);
  };
  try {
    startReport(run, { ...space, generate });
    await Promise.all([...jobs.values()]);
    let saved = readReport(run.id, space.directory);
    assert.equal(saved.research[0].status, 'unverified');
    assert.equal(saved.quality.level, 'partial');
    log.length = 0;
    verified = true;
    startReport(run, { ...space, generate });
    await Promise.all([...jobs.values()]);
    saved = readReport(run.id, space.directory);
    assert.equal(saved.research.length, 1);
    assert.equal(saved.research[0].status, 'complete');
    assert.equal(saved.quality.level, 'complete');
    assert.ok(log.includes('summary'), 'summary should be rebuilt after research retry');
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});

test('research without tool calls and sources is marked unverified', async () => {
  const space = workspace();
  const run = fixture();
  const log = [];
  const generate = makeGenerate(log, { research: () => response('没有任何来源的检索摘要') });
  try {
    startReport(run, { ...space, generate });
    await Promise.all([...jobs.values()]);
    const saved = readReport(run.id, space.directory);
    assert.equal(saved.research[0].status, 'unverified');
    assert.equal(saved.quality.level, 'partial');
    assert.ok(saved.quality.reasons.includes('联网结果缺少可核验来源'));
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});

test('legacy reports are backed up and regenerated instead of reused', async () => {
  const space = workspace();
  const run = fixture();
  fs.mkdirSync(space.directory, { recursive: true });
  fs.writeFileSync(path.join(space.directory, `${run.id}.json`), JSON.stringify({ version: 'geo-analysis-v2-web', status: 'complete', runId: run.id, summary: 'old' }), 'utf8');
  const log = [];
  try {
    startReport(run, { ...space, generate: makeGenerate(log) });
    await Promise.all([...jobs.values()]);
    const saved = readReport(run.id, space.directory);
    assert.equal(saved.version, 'geo-analysis-v3');
    assert.equal(saved.summary, undefined);
    assert.ok(fs.readdirSync(space.backupDirectory).length >= 1);
    assert.equal(log[0], 'classify');
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});

test('explicit regenerate keeps a backup and only rebuilds on request', async () => {
  const space = workspace();
  const run = fixture();
  const log = [];
  try {
    startReport(run, { ...space, generate: makeGenerate(log) });
    await Promise.all([...jobs.values()]);
    const first = log.length;
    startReport(run, { ...space, generate: makeGenerate(log) });
    assert.equal(log.length, first);
    startReport(run, { ...space, generate: makeGenerate(log), regenerate: true });
    await Promise.all([...jobs.values()]);
    assert.equal(log.length, first + 3);
    assert.ok(fs.readdirSync(path.join(space.directory, 'backups')).length >= 1);
  } finally { fs.rmSync(space.directory, { recursive: true, force: true }); }
});
