function prepareRun(body, expectedQuestions) {
  if (!Array.isArray(body.questions) || body.questions.length !== expectedQuestions.length ||
    body.questions.some((question, index) => question.id !== expectedQuestions[index].id || question.text !== expectedQuestions[index].text)) {
    throw new Error('题库在评测期间发生变化，未保存。');
  }
  const models = body.models || [];
  if (!Array.isArray(models) || models.length === 0 || new Set(models.map(model => model.id)).size !== models.length) {
    throw new Error('模型列表无效，未保存。');
  }
  const results = body.results;
  const stoppedByUser = body.stoppedByUser === true;
  if (!Array.isArray(results) || (!stoppedByUser && results.length === 0)) {
    throw new Error('评测结果为空，未保存。');
  }
  const plannedCount = expectedQuestions.length * models.length;
  const questionIds = new Set(expectedQuestions.map(question => question.id));
  const modelIds = new Set(models.map(model => model.id));
  const seen = new Set();
  const cleanResults = [];
  const cleanCitations = (list) => (Array.isArray(list) ? list : []).slice(0, 40).map(item => ({
    url: String(item?.url || '').slice(0, 2000),
    title: String(item?.title || '').slice(0, 300),
    ...(Number.isFinite(item?.start) ? { start: item.start } : {}),
    ...(Number.isFinite(item?.end) ? { end: item.end } : {}),
    ...(item?.segment ? { segment: String(item.segment).slice(0, 1200) } : {})
  })).filter(item => /^https?:\/\//i.test(item.url));
  const cleanRetrieval = (list) => (Array.isArray(list) ? list : []).slice(0, 40).map(item => ({
    url: String(item?.url || '').slice(0, 2000),
    title: String(item?.title || '').slice(0, 300)
  })).filter(item => /^https?:\/\//i.test(item.url));
  for (const result of results) {
    if (!questionIds.has(result.questionId) || !modelIds.has(result.modelId) || result.regionId !== body.regionId || !['ok', 'error'].includes(result.status)) {
      throw new Error('评测结果与本轮题目、模型或地区不一致，未保存。');
    }
    const key = `${result.questionId}:${result.modelId}`;
    if (seen.has(key)) throw new Error(`评测结果重复：${key}`);
    seen.add(key);
    const clean = { ...result, citations: cleanCitations(result.citations), retrievalSources: cleanRetrieval(result.retrievalSources) };
    delete clean.sources;
    delete clean.degsonSources;
    cleanResults.push(clean);
  }
  if (!stoppedByUser && cleanResults.length !== plannedCount) throw new Error('本轮评测未完成，未保存。');
  const completedQuestions = new Set(cleanResults.map(result => result.questionId));
  return {
    models,
    questions: stoppedByUser ? expectedQuestions.filter(question => completedQuestions.has(question.id)) : expectedQuestions,
    results: cleanResults,
    plannedCount,
    stoppedByUser
  };
}

module.exports = { prepareRun };
