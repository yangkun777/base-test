// 题目分类：规则兜底 + 模型分类结果缓存（config/question-taxonomy.json）。
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'config', 'question-taxonomy.json');
const VERSION = 'taxonomy-v1';

const CATEGORIES = [
  'EV 充电连接器',
  '储能连接器',
  '电动自行车连接器',
  '端子台',
  '圆形连接器',
  '重载连接器',
  '铁路连接器',
  '光伏连接器',
  '其他及跨品类'
];
const INTENTS = ['推荐名单', '供应商对比', '选型方法', '认证合规', '价格与交期', 'OEM定制', '其他'];

const RULES = [
  ['电动自行车连接器', /e[- ]?bike|electric (?:bike|bicycle)|pedelec|电动自行车|电助力/i],
  ['储能连接器', /energy storage|battery energy|\bBESS\b|battery (?:cluster|rack|container)|储能|电池簇/i],
  ['光伏连接器', /photovoltaic|\bPV\b|solar (?:connector|panel|cable|module)|光伏/i],
  ['EV 充电连接器', /\bEV\b|EVSE|charging (?:cable|connector|station|pile|plug|port|socket|gun)|wallbox|\bCCS ?[12]\b|type ?[12]\b|j1772|nacs|chaoji|充电(?:枪|线|桩|座|连接器)|电动汽车/i],
  ['铁路连接器', /railway|railroad|rail traffic|rolling stock|铁路|轨道交通/i],
  ['重载连接器', /heavy[- ]duty|\bHDC\b|重载/i],
  ['圆形连接器', /\bM(?:5|8|12|16|23)\b|circular connector|round connector|7\/8 connector|圆形连接/i],
  ['端子台', /terminal block|terminal-block|DIN[- ]?rail|PCB terminal|pluggable terminal|barrier terminal|feed[- ]through|端子|导轨/i]
];

const INTENT_RULES = [
  ['价格与交期', /price|pricing|cost|MOQ|minimum order|lead time|delivery time|交期|价格|报价/i],
  ['供应商对比', /compare|comparison|versus|\bvs\.?\b|difference|better than|alternative|替代|对比/i],
  ['OEM定制', /\bOEM\b|custom|private label|tooling|sample|定制|贴牌/i],
  ['认证合规', /certif|\bUL ?\d|\bCE\b|TÜV|TUV|\bVDE\b|\bCQC\b|RoHS|\bIEC ?\d|\bEN ?\d|complian|认证|合规/i],
  ['推荐名单', /recommend|best |top |which .*brands|shortlist|suppliers?|manufacturers?|推荐|哪家|品牌/i],
  ['选型方法', /how (?:should|do|to)|what should .*compare|select|choose|selection|选型|如何/i]
];

function ruleClassify(question) {
  const text = `${question?.text || ''} ${question?.topic || ''}`;
  const category = (RULES.find(([, pattern]) => pattern.test(text)) || [])[0] || '其他及跨品类';
  const intent = (INTENT_RULES.find(([, pattern]) => pattern.test(text)) || [])[0] || '其他';
  return { category, intent, source: 'rule' };
}

function loadTaxonomy(file = FILE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { version: VERSION, source: 'rule', questions: {} }; }
}

function saveTaxonomy(cache, file = FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = { version: VERSION, updatedAt: new Date().toISOString(), source: cache.source || 'llm', questions: cache.questions || {} };
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  try { fs.renameSync(temp, file); } catch { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); try { fs.unlinkSync(temp); } catch { /* ignore */ } }
  return data;
}

function normalize(row) {
  const category = CATEGORIES.includes(row?.category) ? row.category : null;
  const intent = INTENTS.includes(row?.intent) ? row.intent : null;
  return { category, intent };
}

function mergeRows(questions, rows, cache, source) {
  const byId = new Map(rows.map(row => [row?.id, row]));
  for (const question of questions) {
    const existing = cache.questions[question.id];
    if (existing?.source === 'manual') continue;
    const normalized = normalize(byId.get(question.id));
    const rule = ruleClassify(question);
    cache.questions[question.id] = {
      category: normalized.category || rule.category,
      intent: normalized.intent || rule.intent,
      source: normalized.category && normalized.intent ? source : 'rule',
      updatedAt: new Date().toISOString()
    };
  }
  return cache;
}

function taxonomyFor(questions, cache) {
  const byId = {};
  for (const question of questions) {
    const cached = cache?.questions?.[question.id];
    const rule = ruleClassify(question);
    const category = CATEGORIES.includes(cached?.category) ? cached.category : rule.category;
    const intent = INTENTS.includes(cached?.intent) ? cached.intent : rule.intent;
    byId[question.id] = { category, intent };
  }
  return byId;
}

module.exports = { CATEGORIES, INTENTS, VERSION, FILE, ruleClassify, loadTaxonomy, saveTaxonomy, mergeRows, taxonomyFor };
