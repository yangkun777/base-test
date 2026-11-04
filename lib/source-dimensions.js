const { isBrandAnswer } = require('./question-intent');
const WEIGHTS = { EV: 0.35, storage: 0.25, terminal: 0.25, ebike: 0.15 };
const percent = (part, total) => total ? Number((100 * part / total).toFixed(1)) : null;

function summarizeDimensions(results, questions, items, targetLanding) {
  const byId = new Map(questions.map(question => [question.id, question]));
  const hitKeys = new Set(targetLanding.flatMap(target => items.filter(item => target.hitUrls.includes(item.url) && (!target.questions.length || target.questions.includes(item.questionId))).map(item => `${item.questionId}:${item.modelId}`)));
  function group(key, value) {
    const subset = results.filter(result => result.status === 'ok' && (key === 'module' ? (byId.get(result.questionId)?.module || 'other') : (result.answerMode || 'other')) === value);
    const brand = subset.filter(isBrandAnswer);
    const itemKeys = new Set(items.filter(item => subset.some(result => result.questionId === item.questionId && result.modelId === item.modelId)).map(item => `${item.questionId}:${item.modelId}`));
    const hits = subset.filter(result => (result.mentions || []).some(mention => mention.brandId === 'degson')).length;
    const base = { questionCount: new Set(subset.map(result => result.questionId)).size, answerCount: subset.length, brandAnswerCount: brand.length, degsonMentions: hits, degsonRate: percent(brand.filter(result => (result.mentions || []).some(mention => mention.brandId === 'degson')).length, brand.length), sourceAnswers: itemKeys.size, targetHits: subset.filter(result => hitKeys.has(`${result.questionId}:${result.modelId}`)).length };
    if (key === 'module') {
      base.questionCount = questions.filter(question => (question.module || 'other') === value).length;
      base.competitorAnswers = new Set(items.filter(item => item.kind === 'competitor' && subset.some(result => result.questionId === item.questionId && result.modelId === item.modelId)).map(item => `${item.questionId}:${item.modelId}`)).size;
      base.directoryAnswers = new Set(items.filter(item => item.kind === 'directory' && subset.some(result => result.questionId === item.questionId && result.modelId === item.modelId)).map(item => `${item.questionId}:${item.modelId}`)).size;
    }
    return base;
  }
  const modes = [...new Set(results.filter(result => result.status === 'ok').map(result => result.answerMode || 'other'))];
  const modules = [...new Set(questions.map(question => question.module || 'other'))];
  const byAnswerMode = Object.fromEntries(modes.map(mode => [mode, group('answerMode', mode)]));
  const byModule = Object.fromEntries(modules.map(module => [module, group('module', module)]));
  const active = Object.entries(WEIGHTS).filter(([module]) => byModule[module]?.brandAnswerCount);
  const moduleScore = active.length ? Number((active.reduce((sum, [module, weight]) => sum + byModule[module].degsonRate * weight, 0) / active.reduce((sum, [, weight]) => sum + weight, 0)).toFixed(1)) : null;
  const brands = new Map(), competitors = new Map();
  for (const item of items) for (const brand of item.brands || []) {
    const answerKey = `${item.questionId}:${item.modelId}`;
    const row = brands.get(brand.brandId) || { brandId: brand.brandId, brandName: brand.brandName, citations: 0, answerSet: new Set(), questionSet: new Set(), hostSet: new Set(), modelSet: new Set() };
    row.citations++; row.answerSet.add(answerKey); row.questionSet.add(item.questionId); row.hostSet.add(item.host); row.modelSet.add(item.modelId); brands.set(brand.brandId, row);
    if (brand.brandId === 'degson') continue;
    const key = `${brand.brandId}:${item.host}:${item.kindLabel}`;
    const competitor = competitors.get(key) || { brandId: brand.brandId, brandName: brand.brandName, host: item.host, kindLabel: item.kindLabel, citations: 0, answerSet: new Set(), questionSet: new Set(), modelSet: new Set() };
    competitor.citations++; competitor.answerSet.add(answerKey); competitor.questionSet.add(item.questionId); competitor.modelSet.add(item.modelId); competitors.set(key, competitor);
  }
  const flatten = row => { const { answerSet, questionSet, hostSet, modelSet, ...data } = row; return { ...data, answers: answerSet.size, questions: questionSet.size, ...(hostSet ? { hosts: [...hostSet] } : {}), models: [...modelSet] }; };
  return { byAnswerMode, byModule, moduleScore, sourceBrands: [...brands.values()].map(flatten).sort((a, b) => b.citations - a.citations), competitorSourceMap: [...competitors.values()].map(flatten).sort((a, b) => b.citations - a.citations) };
}
module.exports = { summarizeDimensions, WEIGHTS };
