// 命令行跑一轮完整基线（5 问 × 2 模型，串行），结果直接落盘 data/runs/。
// 用法：node scripts/run-baseline.js
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadEnvFile, getQuestions, modelConfigs, askModel, analyzeText, brandsFromResults } = require('../lib/engine');

loadEnvFile(path.join(ROOT, '.env'));

async function main() {
  const cfgs = modelConfigs();
  const models = Object.values(cfgs).filter(c => c.apiKey);
  if (models.length === 0) {
    console.error('未配置任何 API Key，请检查 .env。');
    process.exit(1);
  }
  const questions = getQuestions();
  const results = [];
  for (const question of questions) {
    for (const cfg of models) {
      process.stdout.write(`[${question.id} × ${cfg.label}] 请求中…`);
      try {
        const { answer, modelName, latencyMs } = await askModel(cfg.id, question.text);
        const { mentions, matches } = analyzeText(answer);
        results.push({ questionId: question.id, modelId: cfg.id, status: 'ok', answer, modelName, latencyMs, mentions, matches });
        console.log(` 完成（${(latencyMs / 1000).toFixed(1)}s，命中品牌 ${mentions.length} 个）`);
      } catch (error) {
        results.push({ questionId: question.id, modelId: cfg.id, status: 'error', error: error.message || String(error) });
        console.log(` 失败：${error.message}`);
      }
    }
  }
  const id = `run-${new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, 17)}`;
  const run = {
    id,
    createdAt: new Date().toISOString(),
    models: models.map(c => ({ id: c.id, label: c.label, model: c.model })),
    questions,
    brands: brandsFromResults(results),
    results
  };
  const dir = path.join(ROOT, 'data', 'runs');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(run, null, 2), 'utf8');
  console.log(`\n已保存：data/runs/${id}.json（成功 ${results.filter(r => r.status === 'ok').length}/${results.length}）`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
