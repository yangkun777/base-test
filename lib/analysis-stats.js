// 确定性统计：分类、提及率、顺位、竞品对照。模型不得更改这些数字。
const fs = require('node:fs');
const path = require('node:path');
const { isBrandAnswer, excludesBrandEvaluation } = require('./question-intent');
const { CATEGORIES, ruleClassify } = require('./question-taxonomy');
const BRANDS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'brands.json'), 'utf8'));
const STATS_VERSION = 'stats-v3';

function isDegson(mention) {
  return mention.brandId === 'degson' || /degson|高松/i.test(mention.brandName || '');
}

function hasDegson(result) {
  return (result.mentions || []).some(isDegson);
}

function rateOf(results) {
  const ok = (results || []).filter(isBrandAnswer);
  const hits = ok.filter(hasDegson).length;
  return { hits, denominator: ok.length, percent: ok.length ? Number((hits / ok.length * 100).toFixed(1)) : null };
}

function modelsOf(run) {
  const seen = new Map();
  for (const model of run.models || []) seen.set(model.id, { id: model.id, label: model.label || model.id, model: model.model });
  for (const result of run.results || []) if (!seen.has(result.modelId)) seen.set(result.modelId, { id: result.modelId, label: result.modelId });
  return [...seen.values()];
}

function questionsOf(run) {
  if (run.questions?.length) return run.questions;
  return [...new Set((run.results || []).map(result => result.questionId))].map(id => ({ id, text: id }));
}

function categoryGroup(name, rows, run, models) {
  const questions = rows.filter(row => row.category === name);
  const eligible = questions.filter(row => !row.excluded);
  const ids = new Set(eligible.map(row => row.id));
  const brandAnswers = (run.results || []).filter(result => ids.has(result.questionId) && isBrandAnswer(result));
  const successful = (run.results || []).filter(result => ids.has(result.questionId) && result.status === 'ok');
  const mentioned = brandAnswers.filter(hasDegson);
  const questionsWithBrandAnswer = new Set(brandAnswers.map(result => result.questionId));
  const questionsWithDegson = new Set(mentioned.map(result => result.questionId));
  const byModel = models.map(model => {
    const mine = brandAnswers.filter(result => result.modelId === model.id);
    const hits = mine.filter(hasDegson);
    return {
      id: model.id,
      label: model.label,
      ...rateOf(mine),
      top1: hits.filter(result => (result.mentions || []).some(mention => isDegson(mention) && mention.rank === 1)).length,
      top3: hits.filter(result => (result.mentions || []).some(mention => isDegson(mention) && mention.rank <= 3)).length
    };
  });
  const competitors = BRANDS.filter(brand => !brand.self).map(brand => {
    const hits = brandAnswers.filter(result => (result.mentions || []).some(mention => mention.brandId === brand.id));
    return {
      id: brand.id,
      name: brand.name,
      hits: hits.length,
      percent: brandAnswers.length ? Number((hits.length / brandAnswers.length * 100).toFixed(1)) : null,
      top1: hits.filter(result => (result.mentions || []).some(mention => mention.brandId === brand.id && mention.rank === 1)).length
    };
  }).sort((a, b) => b.hits - a.hits);
  const missingQuestionIds = eligible.filter(row => {
    const answers = (run.results || []).filter(result => result.questionId === row.id && result.status === 'ok' && isBrandAnswer(result));
    return answers.length > 0 && !answers.some(hasDegson);
  }).map(row => row.id);
  return {
    name,
    questionCount: questions.length,
    eligibleCount: eligible.length,
    excludedCount: questions.length - eligible.length,
    chineseCount: questions.filter(row => row.chinese).length,
    namedCount: questions.filter(row => row.named).length,
    brandAnswerCount: brandAnswers.length,
    successAnswerCount: successful.length,
    questionIds: eligible.map(row => row.id),
    missingQuestionIds,
    rate: rateOf(brandAnswers),
    questionRate: {
      hits: questionsWithDegson.size,
      denominator: questionsWithBrandAnswer.size,
      percent: questionsWithBrandAnswer.size ? Number((questionsWithDegson.size / questionsWithBrandAnswer.size * 100).toFixed(1)) : null
    },
    top1: byModel.reduce((sum, model) => sum + model.top1, 0),
    top3: byModel.reduce((sum, model) => sum + model.top3, 0),
    byModel,
    competitors
  };
}

function buildAnalysisStats(run, taxonomy = {}) {
  const models = modelsOf(run);
  const results = run.results || [];
  const rawQuestions = questionsOf(run);
  const rows = rawQuestions.map((question, index) => {
    const assigned = taxonomy[question.id] || ruleClassify(question);
    const answers = results.filter(result => result.questionId === question.id && result.status === 'ok');
    const competitorIds = new Set(answers.flatMap(result => (result.mentions || []).filter(mention => !isDegson(mention)).map(mention => mention.brandId)));
    return {
      index: index + 1,
      id: question.id,
      text: question.text || question.id,
      category: assigned.category,
      intent: assigned.intent,
      excluded: excludesBrandEvaluation(question, results),
      chinese: /\bchinese\b|中国/i.test(question.text || ''),
      named: /degson|高松/i.test(question.text || ''),
      competitorCount: competitorIds.size
    };
  });
  const categories = CATEGORIES.map(name => categoryGroup(name, rows, run, models)).filter(group => group.questionCount > 0);
  const brandAnswers = results.filter(isBrandAnswer);
  const brands = BRANDS.map(brand => {
    const hits = brandAnswers.filter(result => (result.mentions || []).some(mention => mention.brandId === brand.id));
    const ranks = brandAnswers.flatMap(result => (result.mentions || []).filter(mention => mention.brandId === brand.id).map(mention => mention.rank));
    return {
      id: brand.id,
      name: brand.name,
      self: !!brand.self,
      total: hits.length,
      byModel: Object.fromEntries(models.map(model => [model.id, hits.filter(result => result.modelId === model.id).length])),
      top1: hits.filter(result => (result.mentions || []).some(mention => mention.brandId === brand.id && mention.rank === 1)).length,
      top3: hits.filter(result => (result.mentions || []).some(mention => mention.brandId === brand.id && mention.rank <= 3)).length,
      averageRank: ranks.length ? Number((ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length).toFixed(1)) : null,
      percent: brandAnswers.length ? Number((hits.length / brandAnswers.length * 100).toFixed(1)) : null
    };
  }).sort((a, b) => b.total - a.total);
  const intents = ['推荐名单', '供应商对比', '选型方法', '认证合规', '价格与交期', 'OEM定制', '其他']
    .map(name => {
      const group = rows.filter(row => row.intent === name);
      const ids = new Set(group.filter(row => !row.excluded).map(row => row.id));
      const answers = brandAnswers.filter(result => ids.has(result.questionId));
      return { name, questionCount: group.length, excludedCount: group.filter(row => row.excluded).length, rate: rateOf(answers), questionIds: [...ids] };
    })
    .filter(group => group.questionCount > 0);
  const planned = run.plannedCount ?? rows.length * models.length;
  return {
    version: STATS_VERSION,
    models,
    denominatorRule: 'successful-brand-answers-v1',
    questionCount: rows.length,
    plannedCount: planned,
    resultCount: results.length,
    successCount: results.filter(result => result.status === 'ok').length,
    failedCount: results.filter(result => result.status === 'error').length,
    notRunCount: Math.max(0, planned - results.length),
    excludedQuestionCount: rows.filter(row => row.excluded).length,
    excludedAnswerCount: results.filter(result => result.status === 'ok' && !isBrandAnswer(result)).length,
    reusedCount: results.filter(result => result.reusedFromRunId).length,
    brandAnswerCount: brandAnswers.length,
    degsonAnswerCount: brandAnswers.filter(hasDegson).length,
    degsonRate: rateOf(brandAnswers),
    attemptedQuestionCount: new Set(results.filter(result => result.status === 'ok').map(result => result.questionId)).size,
    categories,
    intents,
    brands,
    questions: rows
  };
}

// 重点题：每类挑 2 道“有竞品品牌、但 DEGSON 缺席”的题，最多 12 道。
function focusQuestionIds(stats, limit = 12) {
  const ids = [];
  const ordered = [...stats.categories].sort((a, b) => (a.rate.percent ?? 101) - (b.rate.percent ?? 101));
  for (const category of ordered) {
    const missing = stats.questions
      .filter(question => category.missingQuestionIds.includes(question.id))
      .sort((a, b) => b.competitorCount - a.competitorCount);
    for (const question of missing.slice(0, 2)) {
      if (!ids.includes(question.id) && ids.length < limit) ids.push(question.id);
    }
  }
  return ids;
}

module.exports = { STATS_VERSION, buildAnalysisStats, focusQuestionIds, rateOf, isDegson };
