// 三道固定英文题 × GPT/Gemini × 纽约/上海。逐条落盘，支持中断后续跑。
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadEnvFile, getQuestions, askModel, analyzeText, modelConfigs } = require('../lib/engine');

const QUESTION_IDS = ['q24', 'q27', 'q32'];
const MODEL_IDS = ['gpt', 'gemini'];
const REGION_IDS = ['us', 'cn'];
const OUT = path.join(ROOT, 'data', 'region-comparisons', 'us-cn-2026-10-30.json');

loadEnvFile(path.join(ROOT, '.env'));

function save(data) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function mainPlan() {
  const all = getQuestions();
  const questions = QUESTION_IDS.map(id => {
    const question = all.find(item => item.id === id);
    if (!question) throw new Error(`题库中找不到 ${id}`);
    return question;
  });
  return questions.flatMap(question => MODEL_IDS.flatMap(modelId => REGION_IDS.map(regionId => ({
    questionId: question.id, prompt: question.text, modelId, regionId
  }))));
}

async function main() {
  const plan = mainPlan();
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ calls: plan.length, models: modelConfigs(), plan: plan.map(({ questionId, prompt, modelId, regionId }) => ({ questionId, prompt, modelId, regionId })) }, (_, value) => {
      if (value && typeof value === 'object' && 'apiKey' in value) return { id: value.id, model: value.model, base: value.base, configured: !!value.apiKey };
      return value;
    }, 2));
    return;
  }

  const data = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, 'utf8'))
    : { title: 'US vs CN region comparison', createdAt: new Date().toISOString(), locations: { us: 'New York', cn: 'Shanghai' }, questions: plan.filter((row, index) => index % 4 === 0).map(({ questionId, prompt }) => ({ questionId, prompt })), results: [] };
  const invalid = new Set(data.results.filter(row => row.regionApplied === false).map(row => `${row.modelId}:${row.regionId}`));
  for (const item of plan) {
    const key = `${item.modelId}:${item.regionId}`;
    if (invalid.has(key)) {
      console.log(`skip ${item.questionId} ${key}: 地区参数已被拒绝`);
      continue;
    }
    const existingIndex = data.results.findIndex(row => row.questionId === item.questionId && row.modelId === item.modelId && row.regionId === item.regionId);
    if (existingIndex >= 0 && !(process.argv.includes('--retry-errors') && data.results[existingIndex].status === 'error')) {
      console.log(`skip ${item.questionId} ${key}: 已有结果`);
      continue;
    }
    process.stdout.write(`run ${item.questionId} ${key} ... `);
    try {
      const result = await askModel(item.modelId, item.prompt, item.regionId);
      const { mentions } = analyzeText(result.answer);
      const row = {
        ...item,
        status: 'ok',
        completedAt: new Date().toISOString(),
        modelName: result.modelName,
        regionApplied: result.regionApplied,
        answer: result.answer,
        brands: mentions.map(mention => ({ name: mention.brandName, rank: mention.rank, id: mention.brandId })),
        searchQueries: result.searchQueries,
        usage: result.usage,
        latencyMs: result.latencyMs
      };
      if (existingIndex >= 0) data.results[existingIndex] = row;
      else data.results.push(row);
      save(data);
      console.log(`ok location=${row.regionApplied} brands=${row.brands.slice(0, 6).map(brand => brand.name).join(', ')}`);
      if (!row.regionApplied) invalid.add(key);
    } catch (error) {
      const row = { ...item, status: 'error', completedAt: new Date().toISOString(), error: error.message };
      if (existingIndex >= 0) data.results[existingIndex] = row;
      else data.results.push(row);
      save(data);
      console.log(`error ${error.message}`);
    }
  }
  console.log(`saved ${OUT}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
