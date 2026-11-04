const CONFIG = require('../config/source-authority.json');

const AUTHORITY_ORDER = [
  ['certification_body', '认证库'],
  ['distributor', '经销商'],
  ['directory', '目录'],
  ['trade_media', '行业媒体'],
  ['manufacturer', '厂商自述'],
  ['blog_or_reseller', '低权威'],
  ['unknown', '未判断']
];

const KIND_DEFAULT = {
  official: 'manufacturer',
  certification: 'certification_body',
  distributor: 'distributor',
  directory: 'directory',
  media: 'trade_media',
  competitor: 'manufacturer',
  marketplace: 'distributor',
  local: 'distributor',
  research: 'trade_media',
  social: 'unknown',
  test: 'unknown',
  redirect: 'unknown',
  search: 'unknown',
  other: 'unknown'
};

const LABELS = Object.fromEntries(AUTHORITY_ORDER);
const THIRD_PARTY = ['certification_body', 'distributor', 'directory', 'trade_media'];

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function isTestDegson(host) {
  return /^(wwwtest|test|staging|dev|preview)\./i.test(host) && /degson\./i.test(host);
}

function isDegsonHost(host) {
  return host === 'degson.com' || host === 'degson.com.cn' || host === 'degson.cn'
    || host.endsWith('.degson.com') || host.endsWith('.degson.com.cn') || host.endsWith('.degson.cn');
}

function classifySourceAuthority(source = {}) {
  const host = String(source.host || '').replace(/^www\./i, '').toLowerCase();
  if (source.authorityOverride || source.ownershipOverride) {
    const authority = LABELS[source.authorityOverride] ? source.authorityOverride : 'unknown';
    const ownership = source.ownershipOverride || (authority === 'unknown' ? 'unknown' : 'third_party');
    return { authority, authorityLabel: LABELS[authority], ownership, authoritySource: 'manual' };
  }
  if (isTestDegson(host)) {
    return { authority: 'unknown', authorityLabel: LABELS.unknown, ownership: 'unknown', authoritySource: 'rule' };
  }
  let authority = '';
  for (const id of Object.keys(CONFIG)) {
    if ((CONFIG[id] || []).some(domain => hostMatches(host, domain))) {
      authority = id;
      break;
    }
  }
  if (!authority) authority = KIND_DEFAULT[source.kind] || 'unknown';
  if (!LABELS[authority]) authority = 'unknown';
  let ownership = 'third_party';
  if (isDegsonHost(host)) ownership = 'first_party';
  else if (authority === 'unknown') ownership = 'unknown';
  return { authority, authorityLabel: LABELS[authority], ownership, authoritySource: 'rule' };
}

function stampAuthority(source) {
  return { ...source, ...classifySourceAuthority(source) };
}

function percent(part, total) {
  return total ? Number((part / total * 100).toFixed(1)) : 0;
}

function authorityRows(items, answerTotal) {
  const buckets = Object.fromEntries(AUTHORITY_ORDER.map(([id]) => [id, { citations: 0, answers: new Set(), hosts: new Set(), firstPartyCitations: 0, thirdPartyCitations: 0 }]));
  for (const item of items || []) {
    const id = LABELS[item.authority] ? item.authority : 'unknown';
    const bucket = buckets[id];
    bucket.citations += 1;
    bucket.answers.add(`${item.questionId}:${item.modelId}`);
    if (item.host) bucket.hosts.add(item.host);
    if (item.ownership === 'first_party') bucket.firstPartyCitations += 1;
    if (item.ownership === 'third_party') bucket.thirdPartyCitations += 1;
  }
  return AUTHORITY_ORDER.map(([id, label]) => ({
    id,
    label,
    citations: buckets[id].citations,
    answers: buckets[id].answers.size,
    answerPercent: percent(buckets[id].answers.size, answerTotal),
    uniqueHosts: buckets[id].hosts.size,
    firstPartyCitations: buckets[id].firstPartyCitations,
    thirdPartyCitations: buckets[id].thirdPartyCitations
  }));
}

function groupOf(items, ids, answerTotal) {
  const selected = (items || []).filter(item => ids.includes(item.authority));
  const answers = new Set(selected.map(item => `${item.questionId}:${item.modelId}`)).size;
  return { citations: selected.length, answers, answerPercent: percent(answers, answerTotal) };
}

function authoritySummaryOf(items, answerTotal) {
  const lowItems = (items || []).filter(item => item.authority === 'blog_or_reseller');
  const hosts = new Map();
  for (const item of lowItems) {
    const row = hosts.get(item.host) || { host: item.host, count: 0, answers: new Set() };
    row.count += 1;
    row.answers.add(`${item.questionId}:${item.modelId}`);
    hosts.set(item.host, row);
  }
  const low = groupOf(items, ['blog_or_reseller'], answerTotal);
  low.topHosts = [...hosts.values()]
    .map(row => ({ host: row.host, count: row.count, answers: row.answers.size }))
    .sort((a, b) => b.count - a.count || b.answers - a.answers)
    .slice(0, 8);
  return {
    authoritativeThirdParty: groupOf(items, THIRD_PARTY, answerTotal),
    manufacturerClaims: groupOf(items, ['manufacturer'], answerTotal),
    lowAuthority: low,
    unknown: groupOf(items, ['unknown'], answerTotal)
  };
}

module.exports = {
  AUTHORITY_ORDER,
  THIRD_PARTY,
  classifySourceAuthority,
  stampAuthority,
  authorityRows,
  authoritySummaryOf
};
