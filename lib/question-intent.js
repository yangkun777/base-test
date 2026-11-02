// 只按实际回答中的品牌识别结果统计，不再按问题措辞或旧标记排除。
function isBrandAnswer(result) {
  return result?.status === 'ok' && Array.isArray(result.mentions) && result.mentions.length > 0;
}
function excludesBrandEvaluation(question, results = []) {
  const successful = results.filter(r => r.questionId === question?.id && r.status === 'ok');
  return successful.length > 0 && !successful.some(isBrandAnswer);
}
module.exports = { excludesBrandEvaluation, isBrandAnswer };
