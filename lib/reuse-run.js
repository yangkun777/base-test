// Merge an earlier completed run into a new run without requesting its questions again.
function mergeWithBaseline(baseline, next) {
  const oldQuestions = baseline.questions || [];
  const newQuestions = next.questions || [];
  const selected = new Set((next.models || []).map(model => model.id));
  const oldTexts = new Set(oldQuestions.map(question => question.text));
  const oldIds = new Set(oldQuestions.map(question => question.id));

  if (!selected.size) throw new Error('请选择至少一个模型。');
  for (const question of newQuestions) {
    if (oldTexts.has(question.text) || oldIds.has(question.id)) {
      throw new Error(`待测题库与复用结果重复：${question.id}`);
    }
  }

  const oldResults = [];
  for (const question of oldQuestions) {
    for (const modelId of selected) {
      const result = baseline.results.find(item =>
        item.questionId === question.id && item.modelId === modelId && item.status === 'ok' && item.answer
      );
      if (!result) throw new Error(`旧轮次缺少可复用回复：${question.id} × ${modelId}`);
      oldResults.push({
        ...result,
        reusedFromRunId: baseline.id,
        reusedFromCreatedAt: baseline.createdAt
      });
    }
  }

  return {
    questions: [...oldQuestions, ...newQuestions],
    results: [...oldResults, ...(next.results || [])]
  };
}

module.exports = { mergeWithBaseline };
