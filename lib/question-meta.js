const fs = require('node:fs');
const path = require('node:path');
const { ruleClassify } = require('./question-taxonomy');
const FILE = path.join(__dirname, '../config/question-metadata.json');
const MODULES = { 'EV 充电连接器': 'EV', '储能连接器': 'storage', '端子台': 'terminal', '电动自行车连接器': 'ebike', '圆形连接器': 'circular', '铁路连接器': 'railway' };
const TYPES = { '推荐名单': 'recommendation', '认证合规': 'certification', '供应商对比': 'comparison', '选型方法': 'engineering', '价格与交期': 'procurement', 'OEM定制': 'procurement' };
function loadQuestionMetadata(file = FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}
function mergeQuestionMetadata(questions, metadata = loadQuestionMetadata()) {
  return questions.map(question => {
    const classified = ruleClassify(question);
    const module = MODULES[classified.category] || 'other';
    return { ...question, module, questionType: TYPES[classified.intent] || 'engineering', priority: ['EV', 'storage', 'terminal'].includes(module) ? 1 : module === 'ebike' ? 2 : 3, productFit: 'generic', ...(metadata[question.id] || {}), id: question.id, text: question.text };
  });
}
module.exports = { loadQuestionMetadata, mergeQuestionMetadata };
