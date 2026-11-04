// 回答引用来源：解析正文链接、模型引用标注与检索来源，分类汇总并给出下一步建议。

const SOURCE_KINDS = [
  ['official', '官网'],
  ['test', '测试站'],
  ['distributor', '分销商'],
  ['certification', '认证 / 标准'],
  ['media', '行业媒体'],
  ['directory', '第三方目录'],
  ['research', '市场研究'],
  ['local', '本地零售'],
  ['marketplace', 'B2B / 电商'],
  ['competitor', '竞品官网'],
  ['social', '社媒'],
  ['search', '搜索引擎'],
  ['redirect', '未解析引用'],
  ['other', '其他网页']
];
const BRAND_NAMES = new Map(require('../config/brands.json').map(brand => [brand.id, brand.name]));
const { classifySourceAuthority, stampAuthority, authorityRows, authoritySummaryOf } = require('./source-authority');

const EXTRA_HOSTS = [
  ['directory', [
    'viox.com', 'directindustry.com', 'thomasnet.com', 'goldsupplier.com', 'globalspec.com', 'europages.com',
    'kompass.com', 'industrynet.com', 'cableman-ev.com'
  ]],
  ['competitor', [
    'slocable.com.cn', 'woer-ev.com', 'midacable.com', 'midaevse.com', 'dongyuevcharger.com', 'yaxingwire.com',
    'zencar.net', 'zencar-evse.net', 'besen-group.com', 'besen.com', 'workersbee.com', 'feyree.com', 'aupins.com',
    'chinax.com', 'teisonev.com', 'duosida.com', 'khons.com', 'higo.com', 'higo-connectors.com', 'julet.com',
    'chogori.com', 'cnlinko.com', 'weipu-group.com', 'wain.com', 'amass.com', 'yongguielectric.com', 'jonhon.cn',
    'osram.de', 'nexharnconnectivity.com', 'utl-electric.com', 'beisit.com', 'beisitelectric.com', 'pvlinktech.com',
    'connixtech.com', 'cdgkz.com', 'cdgkz-relay.com', 'aositerminals.com', 'difvan.com', 'fuconcontact.com',
    'evsemanufacturer.com', 'omgevcable.com', 'hongjialicharge.com', 'jiatel.com', 'agxconnector.com',
    'renhotecev.com', 'higoconnector.com', 'evusbcable.com', 'sorivocable.com', 'coroflex-cable.com', 'wottz.com',
    'philatron.com', 'winstronics.com', 'midapower.com', 'sunkean.com', 'voldt.eu', 'fpiconn.com', 'yinfeel.com',
    'bettelect.com', 'cnszdst.com', 'wernerwirth.com', 'amphenol-industrial.com', 'amphenol-industrial.de'
  ]],
  ['local', ['evmotions.eu', 'evmotions.cz', 'evpartner.cz', 'nabijelektromobil.cz', 'alza.cz', '2direct.de', 'friscoebikes.com', 'fitmyebike.com', 'ebikes.ca', 'riderow.com', 'evplug.eu']],
  ['distributor', ['nectogroup.com', 'activecomponents.com', 'aptico.ca', 'media.distrelec.com', 'digikey.de', 'digikey.sg', 'digikey.ca', 'ac-solutions.be']],
  ['media', ['cargabase.com', 'connectorsupplier.com', 'ebikegaragehq.com', 'energysage.com', 'adac.de', 'cieonline.co.uk', 'ironaxis-supply.com', 'connoder.com']],
  ['marketplace', ['ecrobot.com', 'ebiketrade.org']],
  ['research', ['indexbox.io', 'pmarketresearch.com', 'dataintelo.com']]
];

const HOST_RULES = [
  ['official', /(^|\.)degson\.(com|com\.cn|cn)$/],
  ['redirect', /(^|\.)vertexaisearch\.cloud\.google\.com$/],
  ['social', /(^|\.)(linkedin\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|facebook\.com|instagram\.com|reddit\.com|tiktok\.com)$/],
  ['search', /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|baidu\.com)$/],
  ['certification', /(^|\.)(ul\.com|ulprospector\.com|productiq\.ulprospector\.com|tuv\.com|tuvsud\.com|tuvrheinland\.com|certipedia\.com|vde\.com|iec\.ch|cenenelec\.eu|sgs\.com|intertek\.com|dekra\.com|bureauveritas\.com|nemko\.com|csa-group\.org)$/],
  ['distributor', /(^|\.)(tme\.eu|tme\.com|dacpol\.eu|top-electronics\.com|ibselectronics\.(com|cn|hk)|lusomatrix\.(pt|com)|oemelectronics\.(co\.uk|com)|evegmbh\.de|conrad\.(de|com)|rs-online\.com|rscomponents\.com|farnell\.com|newark\.com|mouser\.com|digikey\.com|distrelec\.com|rexel\.com|sonepar\.com|rutronik\.com|arrow\.com|avnet\.com|futureelectronics\.com|element14\.com|misumi\.com|grainger\.com|automationdirect\.com|radwell\.com|galco\.com)$/],
  ['marketplace', /(^|\.)(alibaba\.com|aliexpress\.com|made-in-china\.com|globalsources\.com|amazon\.[a-z.]+|ebay\.[a-z.]+|dhgate\.com|1688\.com|temu\.com|walmart\.com)$/],
  ['research', /(^|\.)(gminsights\.com|futuremarketinsights\.com|stratviewresearch\.com|marketsandmarkets\.com|grandviewresearch\.com|fortunebusinessinsights\.com|novaeuris\.com|mordorintelligence\.com|researchandmarkets\.com|technavio\.com|imarcgroup\.com|precedenceresearch\.com)$/],
  ['media', /(^|\.)(connectorsupplier\.com|chargedevs\.com|electrive\.com|ess-news\.com|energy-storage\.news|pv-magazine\.[a-z.]+|pvma\.org|bike-europe\.com|cyclingindustry\.news|sazbike\.cz|ebike\.news|railwaygazette\.com|globalrailwayreview\.com|railjournal\.com|designworldonline\.com|controleng\.com|automation\.com|machinedesign\.com|industryweek\.com|assemblymag\.com|electronicdesign\.com|powermag\.com|utilitydive\.com|renewableenergyworld\.com|solarbuildermag\.com)$/],
  ['competitor', /(^|\.)(phoenixcontact\.com|lapp\.com|lappgroup\.com|mennekes\.(org|com)|harting\.com|te\.com|amphenol\.com|staubli\.com|rosenberger\.com|weidmuller\.com|wago\.com|molex\.com|dinkle\.com|supu\.com|anytek\.com\.tw|tielee\.com|gkoncy\.com|wonke\.com|chint\.com|abb\.com|siemens\.com|schneider-electric\.com|eaton\.com|altechcorp\.com|connectwell\.com|wieland-electric\.com|leoni\.com|coroplast\.com|hubersuhner\.com|ittcannon\.com|aptiv\.com|volex\.com|bizlinktech\.com)$/],
  ['local', /(^|\.)(evmotions\.cz|evpartner\.cz|nabijelektromobil\.cz|alza\.cz)$/]
];

function cleanUrl(raw) {
  const value = String(raw || '')
    .replace(/&amp;/g, '&')
    .trim()
    .replace(/[`'"”’),.;]+$/g, '');
  try {
    const parsed = new URL(value);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|gclid$|fbclid$|mc_|_hsenc$|_hsmi$|mkt_tok$)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/g, '');
    return parsed.toString();
  } catch {
    return value;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function classifyHost(host) {
  const value = String(host || '').replace(/^www\./i, '').toLowerCase();
  if (!value) return { id: 'other', label: '其他网页' };
  if (/^(wwwtest|test|staging|dev|preview)\./i.test(value) && /(^|\.)degson\./.test(value)) {
    return { id: 'test', label: '测试站' };
  }
  for (const [id, domains] of EXTRA_HOSTS) {
    if (domains.some(domain => value === domain || value.endsWith(`.${domain}`))) {
      return { id, label: SOURCE_KINDS.find(([kind]) => kind === id)?.[1] || id };
    }
  }
  for (const [id, pattern] of HOST_RULES) {
    if (pattern.test(value)) return { id, label: SOURCE_KINDS.find(([kind]) => kind === id)?.[1] || id };
  }
  if (value.endsWith('.cz')) return { id: 'local', label: '本地零售' };
  return { id: 'other', label: '其他网页' };
}

function isDegsonMention(mention) {
  return mention?.brandId === 'degson' || /degson|高松/i.test(mention?.brandName || '');
}

function textLinks(answer) {
  const text = String(answer || '');
  const found = [];
  const markdown = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
  for (const match of text.matchAll(markdown)) {
    found.push({ title: match[1], url: match[2], start: match.index, end: match.index + match[0].length });
  }
  const bare = /https?:\/\/[^\s)>\]]+/gi;
  for (const match of text.matchAll(bare)) {
    const start = match.index;
    if (found.some(item => start >= item.start && start < item.end)) continue;
    found.push({ title: '', url: match[0], start, end: start + match[0].length });
  }
  return found;
}

function lineBounds(text, index) {
  const start = text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  const next = text.indexOf('\n', index);
  return [start, next === -1 ? text.length : next];
}

function paragraphBounds(text, index) {
  const beforeBreak = text.lastIndexOf('\n\n', Math.max(0, index - 1));
  const afterBreak = text.indexOf('\n\n', index);
  return [beforeBreak === -1 ? 0 : beforeBreak + 2, afterBreak === -1 ? text.length : afterBreak];
}

function citationRelated(citation, ranges) {
  if (/degson|高松/i.test(`${citation?.url || ''} ${citation?.title || ''}`)) return true;
  const segment = String(citation?.segment || '');
  if (segment && segment.length <= 1200 && /degson|高松/i.test(segment)) return true;
  const start = Number.isFinite(citation?.start) ? citation.start : null;
  const end = Number.isFinite(citation?.end) ? citation.end : null;
  if (start == null || end == null) return false;
  return ranges.some(range => end > range.start && start < range.end);
}

function linkRelated(link, text, ranges) {
  if (/degson|高松/i.test(`${link.url || ''} ${link.title || ''}`)) return true;
  return ranges.some(range => {
    const [lineStart, lineEnd] = lineBounds(text, range.start);
    return link.start >= lineStart && link.start <= lineEnd + 1;
  });
}

function allSourcesForAnswer(answer, matches = [], citations = [], retrievalSources = []) {
  const text = String(answer || '');
  const links = textLinks(text);
  const ranges = matches || [];
  function brandsFor(item, origin) {
    if (origin === 'retrieval') return [];
    const segment = origin === 'citation' ? String(item.segment || '') : '';
    const inContext = ranges.filter(range => {
      if (origin === 'text') {
        const [start, end] = lineBounds(text, item.start);
        return range.start >= start && range.start < end;
      }
      if (segment) return segment.includes(text.slice(range.start, range.end)) && range.end > range.start;
      return Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > range.start && item.start < range.end;
    });
    const byId = new Map(inContext.map(range => [range.brandId, { brandId: range.brandId, brandName: BRAND_NAMES.get(range.brandId) || range.brandId, relation: 'mentions' }]));
    const context = `${segment} ${item.title || ''} ${item.url || ''}`;
    for (const brand of require('../config/brands.json')) {
      if ((brand.aliases || []).some(alias => new RegExp(alias.pattern, alias.flags || '').test(context))) {
        byId.set(brand.id, { brandId: brand.id, brandName: brand.name, relation: 'supports' });
      }
    }
    return [...byId.values()];
  }
  const seen = new Map();
  function push(item, origin) {
    const rawUrl = String(item.url || '').trim();
    const url = cleanUrl(rawUrl);
    if (!url || !/^https?:\/\//i.test(url)) return;
    const host = hostOf(url);
    const kind = classifyHost(host);
    const brands = brandsFor(item, origin);
    const existing = seen.get(url);
    if (existing) {
      existing.brands = [...new Map([...existing.brands, ...brands].map(brand => [brand.brandId, brand])).values()];
      existing.degsonRelated = existing.brands.some(brand => brand.brandId === 'degson');
      if (!existing.title && item.title) existing.title = item.title;
      if (!existing.origins.includes(origin)) existing.origins.push(origin);
      if (rawUrl && !existing.rawUrls.includes(rawUrl)) existing.rawUrls.push(rawUrl);
      return;
    }
    const authority = classifySourceAuthority({ host, kind: kind.id });
    seen.set(url, {
      url,
      rawUrl,
      rawUrls: rawUrl ? [rawUrl] : [],
      title: item.title || host || url,
      host,
      kind: kind.id,
      kindLabel: kind.label,
      ...authority,
      origin,
      origins: [origin],
      start: Number.isFinite(item.start) ? item.start : null,
      end: Number.isFinite(item.end) ? item.end : null,
      segment: item.segment || '',
      brands,
      degsonRelated: brands.some(brand => brand.brandId === 'degson')
    });
  }
  for (const link of links) push(link, 'text');
  for (const citation of citations) push(citation, 'citation');
  for (const source of retrievalSources) push(source, 'retrieval');
  return [...seen.values()];
}

function sourcesForAnswer(answer, matches, citations, retrievalSources, options = {}) {
  const ranges = (matches || []).filter(match => match.brandId === 'degson');
  if (!ranges.length) return [];
  const sources = allSourcesForAnswer(answer, matches, citations, retrievalSources);
  const related = sources.filter(source => source.degsonRelated || ranges.some(range => {
    if (source.start == null || source.end == null) return false;
    return source.end > range.start && source.start < range.end;
  }));
  if (options.onlyDegson === false) return sources;
  return related;
}

function percent(part, total) {
  return total ? Number((part / total * 100).toFixed(1)) : 0;
}

function kindRows(counts, total, answerSets = {}, answerTotal = 0, hostSets = {}) {
  return SOURCE_KINDS.map(([id, label]) => ({
    id,
    label,
    count: counts[id] || 0,
    percent: percent(counts[id] || 0, total),
    answers: answerSets[id]?.size || 0,
    answerPercent: percent(answerSets[id]?.size || 0, answerTotal || total),
    uniqueHosts: hostSets[id]?.size || 0
  })).filter(item => item.count > 0).sort((a, b) => b.count - a.count || b.answers - a.answers || a.id.localeCompare(b.id));
}

function topHostsOf(items, limit = 12) {
  const map = new Map();
  for (const item of items) {
    const key = item.host;
    const row = map.get(key) || { host: key, kind: item.kind, kindLabel: item.kindLabel, count: 0, answersSet: new Set(), questionsSet: new Set() };
    row.count += 1;
    row.answersSet.add(`${item.questionId}:${item.modelId}`);
    row.questionsSet.add(item.questionId);
    map.set(key, row);
  }
  return [...map.values()]
    .map(({ answersSet, questionsSet, ...row }) => ({ ...row, answers: answersSet.size, questions: questionsSet.size }))
    .sort((a, b) => b.count - a.count || b.answers - a.answers)
    .slice(0, limit);
}

function buildAdvice(summary) {
  const { answers, citationCount, degson, absent } = summary;
  if (!answers) return '本轮没有成功回答，暂时没有来源可统计。';
  if (!citationCount) return '本轮没有可核验的引用来源。模型只给了品牌名单，没有留下链接；建议先补齐 citation/retrievalSources 采集，再判断来源结构。';
  const official = degson.byKind.official || 0;
  const officialPct = percent(official, degson.citationCount || 0);
  const social = (degson.byKind.social || 0) + (absent.byKind.social || 0);
  const unresolved = (degson.byKind.redirect || 0) + (absent.byKind.redirect || 0);
  const directory = (degson.byKind.directory || 0) + (absent.byKind.directory || 0);
  const lines = [];
  if (unresolved) lines.push(`${unresolved} 条引用仍是 Google grounding 跳转地址，未解析到真实站点；这些条目不用于判断来源结构。`);
  if (directory) lines.push(`第三方目录/榜单贡献 ${directory} 条引用：这是可复用的第三方入口，优先在这些页面补齐型号、认证和应用案例。`);
  if (degson.mentioned) {
    lines.push(`提到 DEGSON 的 ${degson.mentioned} 条回答中，${degson.sourced} 条有引用、${degson.unsourced} 条没有引用标注。`);
    if (degson.citationCount) lines.push(`DEGSON 相关引用 ${degson.citationCount} 条，官网占 ${officialPct}%。`);
    if (officialPct >= 60) lines.push('官网依赖偏高：模型能看到自家页面，但独立第三方来源不足；下一步优先把型号页做成分销商、认证库和行业媒体可引用的稳定地址。');
    else if (officialPct < 30) lines.push('官网占比偏低：模型更多引用外部页面；需要把官网型号页、认证页和 RFQ 入口补成可被这些外部页面引用的落点。');
  } else {
    lines.push('本轮没有回答提到 DEGSON，暂时没有 DEGSON 相关引用；先看 DEGSON 缺席时模型引用了谁。');
  }
  if (!social) lines.push('LinkedIn / YouTube 在本轮引用中为 0：社媒目前没有进入模型的引用来源，先当作放大器，不要当作第三方证据。');
  const absentTop = topHostsOf(absent.items || [], 5);
  if (absentTop.length) lines.push(`DEGSON 缺席时，模型主要引用：${absentTop.map(item => `${item.host}（${item.kindLabel}，${item.count}）`).join('、')}。`);
  const competitorCount = absent.byKind.competitor || 0;
  if (competitorCount) lines.push(`缺席回答里有 ${competitorCount} 条引用竞品官网：说明模型是在竞品页面或对比内容里找答案，优先争取进入同类对比页和分销商目录。`);
  if (degson.unsourced && degson.unsourced / Math.max(1, degson.mentioned) >= 0.5) lines.push('一半以上提到 DEGSON 的回答没有引用标注，当前来源统计偏少；不要据此判断某个站点“完全没用”。');
  return lines.join('');
}

function summarizeSources(results, questions = [], options = {}) {
  const categoryOf = new Map((questions || []).map(question => [question.id, question.category || question.topic || '未分类']));
  const moduleOf = new Map((questions || []).map(question => [question.id, question.module || 'other']));
  const okResults = (results || []).filter(result => result.status === 'ok');
  const allItems = [];
  const degsonItems = [];
  const absentItems = [];
  const overallCounts = {};
  const degsonCounts = {};
  const absentCounts = {};
  const overallAnswerSets = {};
  const overallHostSets = {};
  const degsonAnswerSets = {};
  const degsonHostSets = {};
  const absentAnswerSets = {};
  const absentHostSets = {};
  const categoryMap = new Map();
  const modelMap = new Map();
  let withCitations = 0;
  let brandAnswerCount = 0;
  let degsonMentioned = 0;
  let degsonSourced = 0;
  let absentWithCitations = 0;

  for (const result of okResults) {
    const sources = (Array.isArray(result.sources) ? result.sources : allSourcesForAnswer(result.answer, result.matches, result.citations, result.retrievalSources)).map(stampAuthority);
    const mentioned = (result.mentions || []).some(isDegsonMention);
    const related = sources.filter(source => source.degsonRelated);
    const category = categoryOf.get(result.questionId) || '未分类';
    const modelId = result.modelId || 'unknown';
    const answerKey = `${result.questionId}:${modelId}`;
    if (sources.length) withCitations += 1;
    if ((result.mentions || []).length) brandAnswerCount += 1;
    const modelStat = modelMap.get(modelId) || { modelId, answers: 0, withCitations: 0, mentioned: 0, sourced: 0, unsourced: 0, citations: 0, counts: {}, degsonCounts: {}, answerSets: {}, hostSets: {}, degsonAnswerSets: {}, degsonHostSets: {}, items: [], degsonItems: [] };
    modelStat.answers += 1;
    if (sources.length) modelStat.withCitations += 1;
    modelStat.citations += sources.length;
    modelMap.set(modelId, modelStat);

    const categoryStat = categoryMap.get(category) || { category, answers: 0, withCitations: 0, mentioned: 0, sourced: 0, unsourced: 0, counts: {}, answerSets: {}, hostSets: {}, items: [] };
    categoryStat.answers += 1;
    if (sources.length) categoryStat.withCitations += 1;
    categoryMap.set(category, categoryStat);

    for (const source of sources) {
      overallCounts[source.kind] = (overallCounts[source.kind] || 0) + 1;
      (overallAnswerSets[source.kind] ||= new Set()).add(answerKey);
      (overallHostSets[source.kind] ||= new Set()).add(source.host);
      allItems.push({ questionId: result.questionId, modelId, mentioned, category, module: moduleOf.get(result.questionId), answerMode: result.answerMode || 'other', ...source });
      modelStat.counts[source.kind] = (modelStat.counts[source.kind] || 0) + 1;
      (modelStat.answerSets[source.kind] ||= new Set()).add(answerKey);
      (modelStat.hostSets[source.kind] ||= new Set()).add(source.host);
      modelStat.items.push({ ...source, questionId: result.questionId, modelId, mentioned, category });
      categoryStat.counts[source.kind] = (categoryStat.counts[source.kind] || 0) + 1;
      (categoryStat.answerSets[source.kind] ||= new Set()).add(answerKey);
      (categoryStat.hostSets[source.kind] ||= new Set()).add(source.host);
      categoryStat.items.push({ ...source, questionId: result.questionId, modelId, mentioned, category });
    }

    if (mentioned) {
      degsonMentioned += 1;
      modelStat.mentioned += 1;
      categoryStat.mentioned += 1;
      if (related.length) {
        degsonSourced += 1;
        modelStat.sourced += 1;
        categoryStat.sourced += 1;
      } else {
        modelStat.unsourced += 1;
        categoryStat.unsourced += 1;
      }
      for (const source of related) {
        degsonCounts[source.kind] = (degsonCounts[source.kind] || 0) + 1;
        (degsonAnswerSets[source.kind] ||= new Set()).add(answerKey);
        (degsonHostSets[source.kind] ||= new Set()).add(source.host);
        modelStat.degsonCounts[source.kind] = (modelStat.degsonCounts[source.kind] || 0) + 1;
        (modelStat.degsonAnswerSets[source.kind] ||= new Set()).add(answerKey);
        (modelStat.degsonHostSets[source.kind] ||= new Set()).add(source.host);
        const item = { questionId: result.questionId, modelId, category, ...source };
        degsonItems.push(item);
        modelStat.degsonItems.push(item);
      }
    } else {
      if (sources.length) absentWithCitations += 1;
      for (const source of sources) {
        absentCounts[source.kind] = (absentCounts[source.kind] || 0) + 1;
        (absentAnswerSets[source.kind] ||= new Set()).add(answerKey);
        (absentHostSets[source.kind] ||= new Set()).add(source.host);
        absentItems.push({ questionId: result.questionId, modelId, category, ...source });
      }
    }
  }

  const citationCount = allItems.length;
  const degsonCitationCount = degsonItems.length;
  const uniqueUrlCount = new Set(allItems.map(item => item.url)).size;
  const uniqueHostCount = new Set(allItems.map(item => item.host)).size;
  const originCounts = {};
  for (const item of allItems) {
    for (const origin of item.origins || [item.origin]) originCounts[origin] = (originCounts[origin] || 0) + 1;
  }
  const countOf = id => overallCounts[id] || 0;
  const thirdPartyCount = ['distributor', 'certification', 'media', 'directory', 'research', 'local', 'marketplace']
    .reduce((sum, id) => sum + countOf(id), 0);
  const officialCount = countOf('official');
  const competitorCount = countOf('competitor');
  const socialCount = countOf('social');
  const testCount = countOf('test');
  const redirectCount = countOf('redirect');
  const share = value => percent(value, citationCount);
  const categories = kindRows(overallCounts, citationCount, overallAnswerSets, withCitations, overallHostSets);
  const degson = {
    mentioned: degsonMentioned,
    sourced: degsonSourced,
    unsourced: degsonMentioned - degsonSourced,
    citationCount: degsonCitationCount,
    uniqueUrlCount: new Set(degsonItems.map(item => item.url)).size,
    uniqueHostCount: new Set(degsonItems.map(item => item.host)).size,
    byKind: degsonCounts,
    categories: kindRows(degsonCounts, degsonCitationCount, degsonAnswerSets, degsonSourced, degsonHostSets),
    byAuthority: authorityRows(degsonItems, degsonSourced),
    items: degsonItems,
    topHosts: topHostsOf(degsonItems)
  };
  const absent = {
    answers: okResults.length - degsonMentioned,
    brandAnswers: brandAnswerCount - degsonMentioned,
    noBrandAnswers: okResults.length - brandAnswerCount,
    withCitations: absentWithCitations,
    citationCount: absentItems.length,
    uniqueUrlCount: new Set(absentItems.map(item => item.url)).size,
    uniqueHostCount: new Set(absentItems.map(item => item.host)).size,
    byKind: absentCounts,
    categories: kindRows(absentCounts, absentItems.length, absentAnswerSets, absentWithCitations, absentHostSets),
    byAuthority: authorityRows(absentItems, absentWithCitations),
    items: absentItems,
    topHosts: topHostsOf(absentItems)
  };
  const models = [...modelMap.values()].map(({ items, degsonItems, answerSets, hostSets, degsonAnswerSets, degsonHostSets, ...stat }) => ({
    ...stat,
    byKind: stat.counts,
    categories: kindRows(stat.counts, items.length, answerSets, stat.withCitations, hostSets),
    byAuthority: authorityRows(items, stat.withCitations),
    topHosts: topHostsOf(items),
    degson: {
      mentioned: stat.mentioned,
      sourced: stat.sourced,
      unsourced: stat.unsourced,
      citationCount: degsonItems.length,
      byKind: stat.degsonCounts,
      categories: kindRows(stat.degsonCounts, degsonItems.length, degsonAnswerSets, stat.sourced, degsonHostSets),
      topHosts: topHostsOf(degsonItems)
    }
  })).sort((a, b) => {
    const order = ['gpt', 'gemini'];
    return (order.indexOf(a.modelId) === -1 ? 99 : order.indexOf(a.modelId)) - (order.indexOf(b.modelId) === -1 ? 99 : order.indexOf(b.modelId));
  });
  const byCategory = [...categoryMap.values()].map(({ answerSets, hostSets, ...item }) => ({
    ...item,
    citationCount: item.items.length,
    categories: kindRows(item.counts, item.items.length, answerSets, item.withCitations, hostSets),
    byAuthority: authorityRows(item.items, item.withCitations),
    topHosts: topHostsOf(item.items, 6)
  })).filter(item => item.answers > 0).sort((a, b) => b.answers - a.answers);
  const summary = {
    answers: okResults.length,
    withCitations,
    withoutCitations: okResults.length - withCitations,
    brandAnswerCount,
    noBrandAnswerCount: okResults.length - brandAnswerCount,
    allCitationCount: citationCount,
    uniqueUrlCount,
    uniqueHostCount,
    originCounts,
    thirdPartyCount,
    thirdPartyShare: share(thirdPartyCount),
    officialCount,
    officialShare: share(officialCount),
    competitorCount,
    competitorShare: share(competitorCount),
    socialCount,
    socialShare: share(socialCount),
    testCount,
    redirectCount,
    byAuthority: authorityRows(allItems, withCitations),
    authoritySummary: authoritySummaryOf(allItems, withCitations),
    allCategories: categories,
    allTopHosts: topHostsOf(allItems, 15),
    models,
    degson,
    absent,
    byCategory,
    mentioned: degsonMentioned,
    sourced: degsonSourced,
    unsourced: degsonMentioned - degsonSourced,
    citationCount: degsonCitationCount,
    categories: degson.categories,
    topHosts: degson.topHosts,
    items: degsonItems,
    allItems,
    degsonItems,
    absentItems
  };
  function coverage(items, denominator) {
    const groups = { official:['official'], thirdParty:['distributor','certification','media','directory','research','local','marketplace'], competitor:['competitor'], directory:['directory'], media:['media'], distributor:['distributor'] };
    return Object.fromEntries(Object.entries(groups).map(([key,kinds]) => {
      const selected = items.filter(x=>kinds.includes(x.kind));
      const answers = new Set(selected.map(x=>`${x.questionId}:${x.modelId}`)).size;
      return [key, { answers, percent:percent(answers,denominator), citations:selected.length }];
    }));
  }
  summary.coverage = { withSources:withCitations, ...coverage(allItems,withCitations) };
  for (const model of summary.models) model.coverage = coverage(allItems.filter(x=>x.modelId===model.modelId),model.withCitations);
  summary.hostStats = topHostsOf(allItems,100).map(row=>({ ...row, citations:row.count, models:[...new Set(allItems.filter(x=>x.host===row.host).map(x=>x.modelId))] }));
  summary.targetLanding = require('./source-targets').buildTargetLanding(allItems,options.targets || []);
  Object.assign(summary, require('./source-dimensions').summarizeDimensions(okResults, questions, allItems, summary.targetLanding));
  summary.advice = buildAdvice(summary);
  return summary;
}

function summarizeDegsonSources(results, questions = []) {
  return summarizeSources(results, questions);
}

function attachSources(result) {
  if (!result || result.status !== 'ok') return { sources: [], degsonSources: [] };
  const previous = new Map((result.sources || []).filter(source => source?.url).map(source => [source.url, source]));
  const sources = allSourcesForAnswer(result.answer, result.matches, result.citations, result.retrievalSources).map(source => {
    const saved = previous.get(source.url) || {};
    return stampAuthority({
      ...source,
      authorityOverride: saved.authorityOverride,
      ownershipOverride: saved.ownershipOverride
    });
  });
  return { sources, degsonSources: sources.filter(source => source.degsonRelated) };
}

function attachDegsonSources(result) {
  return attachSources(result).degsonSources;
}

module.exports = {
  SOURCE_KINDS,
  classifyHost,
  hostOf,
  cleanUrl,
  allSourcesForAnswer,
  sourcesForAnswer,
  summarizeSources,
  summarizeDegsonSources,
  attachSources,
  attachDegsonSources,
  classifySourceAuthority
};
