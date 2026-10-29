// 探测：前 2 题 × GPT/Gemini × CZ/DE/US，看地区参数会不会改变回答。
const path = require('node:path');
const { ROOT, loadEnvFile, getQuestions, askModel, analyzeText } = require('../lib/engine');

loadEnvFile(path.join(ROOT, '.env'));

const REGION_IDS = ['cz', 'de', 'us'];
const MODEL_IDS = ['gpt', 'gemini'];

function snapshot(answer) {
  const { mentions } = analyzeText(answer);
  return {
    hasDegson: /degson|高松/i.test(answer),
    brands: mentions.slice(0, 8).map(item => `${item.rank}.${item.brandName}`),
    degsonRank: mentions.find(item => item.brandId === 'degson')?.rank || null,
    head: String(answer).replace(/\s+/g, ' ').slice(0, 180)
  };
}

async function main() {
  const questions = getQuestions().slice(0, 2);
  const rows = [];
  for (const question of questions) {
    for (const regionId of REGION_IDS) {
      for (const modelId of MODEL_IDS) {
        process.stdout.write(`[${question.id} × ${modelId} × ${regionId}] `);
        try {
          const result = await askModel(modelId, question.text, regionId);
          const shot = snapshot(result.answer);
          const row = {
            questionId: question.id,
            modelId,
            regionId,
            regionApplied: result.regionApplied,
            ms: result.latencyMs,
            searchQueries: result.searchQueries || [],
            ...shot
          };
          rows.push(row);
          console.log(`ok applied=${row.regionApplied} degson=${row.hasDegson} rank=${row.degsonRank} brands=${row.brands.join(' / ')}`);
        } catch (error) {
          rows.push({ questionId: question.id, modelId, regionId, error: error.message });
          console.log(`fail ${error.message}`);
        }
      }
    }
  }

  console.log('\n=== 同题同模型，三地区是否不同 ===');
  for (const question of questions) {
    for (const modelId of MODEL_IDS) {
      const group = rows.filter(row => row.questionId === question.id && row.modelId === modelId && !row.error);
      const brands = group.map(row => `${row.regionId}:${row.brands.join(',')}`);
      const degson = group.map(row => `${row.regionId}:${row.hasDegson ? `Y#${row.degsonRank}` : 'N'}`);
      const queries = group.map(row => `${row.regionId}:${(row.searchQueries || []).join(' | ')}`);
      const applied = group.map(row => `${row.regionId}:${row.regionApplied}`);
      const heads = [...new Set(group.map(row => row.head))];
      console.log(`\n${question.id} ${modelId}`);
      console.log(`  位置是否生效: ${applied.join('  ')}`);
      console.log(`  Degson: ${degson.join('  ')}`);
      console.log(`  品牌: ${brands.join('  ||  ')}`);
      console.log(`  搜索词: ${queries.join('  ||  ')}`);
      console.log(`  开头是否互不相同: ${heads.length > 1 ? `是（${heads.length} 种）` : '否（三地开头一样）'}`);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
