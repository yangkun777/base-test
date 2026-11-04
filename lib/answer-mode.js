const fs = require('node:fs');
const path = require('node:path');
const brands = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/brands.json'), 'utf8'));
const MODES = new Set(['recommendation_list', 'certification', 'engineering_howto', 'comparison', 'procurement_alternative', 'brand_query', 'none', 'other']);

function classifyAnswerMode(questionText, answer, mentions = []) {
  if (!mentions.length || /^\s*NONE\s*$/i.test(String(answer || ''))) return 'none';
  const text = String(questionText || '');
  if (/how (?:should|do|can|to)\b|what should .*compare|evaluation criteria|如何|怎么选|选型方法/i.test(text)) return 'engineering_howto';
  if (/recommend|\btop\b|\bbest\b|shortlist|which .*?(?:suppliers|brands|manufacturers)|推荐|哪家/i.test(text)) return 'recommendation_list';
  if (/alternative|replace|substitute|second source|替代|第二供应商/i.test(text)) return 'procurement_alternative';
  if (/compare|comparison|\bvs\.?\b|versus|difference|对比|比较/i.test(text)) return 'comparison';
  if (/\b(?:UL|TUV|CE|RoHS|IEC|EN)\b|TÜV|certification|certified|认证|合规/i.test(text)) return 'certification';
  if (brands.some(brand => (brand.aliases || []).some(alias => new RegExp(alias.pattern, alias.flags || '').test(text)))) return 'brand_query';
  return 'other';
}

module.exports = { MODES, classifyAnswerMode };
