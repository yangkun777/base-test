// 共享引擎：环境变量加载、双模型调用、品牌提及解析。
// server.js 与 scripts/run-baseline.js 共用，保证线上与脚本口径一致。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const QUESTIONS_FILE = path.join(ROOT, 'config', 'questions.json');
const MAX_BRANDS = 20;
let QUESTIONS = loadQuestions();

function loadQuestions() {
  return JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
}

function getQuestions() {
  QUESTIONS = loadQuestions();
  return require('./question-meta').mergeQuestionMetadata(QUESTIONS);
}

function nextQuestionId(list) {
  let n = list.reduce((max, q) => Math.max(max, Number(/^q(\d+)$/.exec(q.id)?.[1]) || 0), 23) + 1;
  const used = new Set(list.map(q => q.id));
  while (used.has(`q${n}`)) n += 1;
  return `q${n}`;
}

function addQuestion({ text }) {
  const list = getQuestions();
  const cleanText = String(text || '').trim();
  if (!cleanText) throw new Error('请填写问题。');
  if (cleanText.length < 8) throw new Error('问题过短。');
  if (cleanText.length > 2000) throw new Error('问题请控制在 2000 字以内。');
  if (list.some(q => q.text === cleanText)) throw new Error('题库中已有相同问题。');
  const question = { id: nextQuestionId(list), text: cleanText };
  list.push(question);
  fs.writeFileSync(QUESTIONS_FILE, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
  QUESTIONS = list;
  return question;
}

function removeQuestion(id) {
  const list = getQuestions();
  const next = list.filter(q => q.id !== id);
  if (next.length === list.length) throw new Error(`未找到问题：${id}`);
  fs.writeFileSync(QUESTIONS_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  QUESTIONS = next;
  return next;
}

function clearQuestions() {
  fs.writeFileSync(QUESTIONS_FILE, '[]\n', 'utf8');
  QUESTIONS = [];
  return QUESTIONS;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equals = trimmed.indexOf('=');
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function modelConfigs() {
  return {
    gpt: {
      id: 'gpt',
      label: 'GPT',
      apiKey: process.env.OPENAI_API_KEY || '',
      base: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      model: process.env.OPENAI_MODEL || 'gpt-5.6-sol'
    },
    gemini: {
      id: 'gemini',
      label: 'Gemini',
      apiKey: process.env.GEMINI_API_KEY || '',
      base: (process.env.GEMINI_API_BASE || 'https://cf.api.fan/v1beta').replace(/\/+$/, ''),
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash'
    }
  };
}

const TIMEOUT_MS = 180000;
const SEARCH_CONTEXT_SIZE = 'low';
const MAX_OUTPUT_TOKENS = 500;
const SEARCH_GUIDE = [
  'Search once using the user question. Do not add extra queries.',
  'Prefer independent lists over a manufacturer homepage.',
  'Reply with only the manufacturer brands you would recommend, in your recommendation order.',
  'Use one line per brand: - **Brand Name** (https://source). Put the page that named that brand on the same line. No essays.',
  'Do not invent brands. If no brand can be recommended, reply NONE.'
].join(' ');

const REGIONS = {
  unspecified: {
    id: 'unspecified',
    label: '未指定（中转默认）',
    detail: '不传位置，搜索按 Packy / 官方默认'
  },
  cz: {
    id: 'cz',
    label: '捷克 CZ',
    detail: 'GPT 按 Prague；Gemini 按布拉格坐标 + cs',
    gpt: { type: 'approximate', country: 'CZ', city: 'Prague', region: 'Prague', timezone: 'Europe/Prague' },
    gemini: { latLng: { latitude: 50.0755, longitude: 14.4378 }, languageCode: 'cs' }
  },
  de: {
    id: 'de',
    label: '德国 DE',
    detail: 'GPT 按 Berlin；Gemini 按柏林坐标 + de',
    gpt: { type: 'approximate', country: 'DE', city: 'Berlin', region: 'Berlin', timezone: 'Europe/Berlin' },
    gemini: { latLng: { latitude: 52.52, longitude: 13.405 }, languageCode: 'de' }
  },
  us: {
    id: 'us',
    label: '美国（纽约）',
    detail: 'GPT 按 New York；Gemini 按纽约坐标 + en',
    gpt: { type: 'approximate', country: 'US', city: 'New York', region: 'New York', timezone: 'America/New_York' },
    gemini: { latLng: { latitude: 40.7128, longitude: -74.006 }, languageCode: 'en' }
  },
  cn: {
    id: 'cn',
    label: '中国（上海）',
    detail: 'GPT 按 Shanghai；Gemini 按上海坐标 + en',
    gpt: { type: 'approximate', country: 'CN', city: 'Shanghai', region: 'Shanghai', timezone: 'Asia/Shanghai' },
    gemini: { latLng: { latitude: 31.2304, longitude: 121.4737 }, languageCode: 'en' }
  },
  eu: {
    id: 'eu',
    label: '欧洲（德国柏林）',
    detail: '以德国柏林作为欧洲位置代表；GPT 按 Berlin；Gemini 按柏林坐标 + en',
    gpt: { type: 'approximate', country: 'DE', city: 'Berlin', region: 'Berlin', timezone: 'Europe/Berlin' },
    gemini: { latLng: { latitude: 52.52, longitude: 13.405 }, languageCode: 'en' }
  }
};

function resolveRegion(id) {
  return REGIONS[id] || REGIONS.unspecified;
}

function gptSearchBody(cfg, prompt, extraTool = {}, extras = {}) {
  return {
    model: cfg.model,
    instructions: SEARCH_GUIDE,
    input: prompt,
    tools: [{ type: 'web_search', ...extraTool }],
    tool_choice: { type: 'web_search' },
    ...extras
  };
}

function gptSearchQueries(data) {
  const queries = [];
  for (const item of data?.output || []) {
    if (item?.type !== 'web_search_call') continue;
    const found = item.action?.queries || (item.action?.query ? [item.action.query] : []);
    for (const query of found) if (query) queries.push(query);
  }
  return queries;
}

function regionRejected(message) {
  const text = String(message || '');
  if (/invalid_prompt|flagged|usage policy|content[_ ](?:policy|filter|rejected)/i.test(text)) return false;
  return /user_location|country|city|region|timezone|approximate/i.test(text)
    && /invalid|not supported|unsupported|unknown|unrecognized|must be|expected/i.test(text);
}

function gptRetrievalSources(data) {
  const found = [];
  for (const item of data?.output || []) {
    if (item?.type !== 'web_search_call') continue;
    for (const source of item.action?.sources || []) {
      if (source?.url) found.push({ url: source.url, title: source.title || '' });
    }
  }
  return found;
}

async function postJson(url, headers, body, signal) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        signal,
        headers,
        body: JSON.stringify(body)
      });
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {
        if (response.status >= 500 && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
          continue;
        }
        throw new Error(`接口返回了无法解析的内容（HTTP ${response.status}）。`);
      }
      if (response.status >= 500 && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }
      return { response, data };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('接口请求失败。');
}

function gptCitations(data) {
  const found = [];
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      for (const note of part?.annotations || []) {
        if (note?.type === 'url_citation' && note.url) {
          found.push({ url: note.url, title: note.title || '', start: note.start_index, end: note.end_index });
        }
      }
    }
  }
  return found;
}

function geminiCitations(candidate) {
  const meta = candidate?.groundingMetadata || {};
  const chunks = meta.groundingChunks || [];
  const found = [];
  for (const support of meta.groundingSupports || []) {
    const start = Number.isFinite(support.segment?.startIndex) ? support.segment.startIndex : 0;
    const end = support.segment?.endIndex;
    const segment = support.segment?.text || '';
    for (const index of support.groundingChunkIndices || []) {
      const web = chunks[index]?.web;
      if (web?.uri) found.push({ url: web.uri, title: web.title || '', start, end, segment });
    }
  }
  if (!found.length) {
    for (const chunk of chunks) {
      if (chunk?.web?.uri) found.push({ url: chunk.web.uri, title: chunk.web.title || '' });
    }
  }
  return found;
}

function isRedirectCitation(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'vertexaisearch.cloud.google.com'
      || parsed.pathname.includes('grounding-api-redirect')
      || (host.endsWith('google.com') && parsed.pathname === '/url');
  } catch {
    return false;
  }
}

async function resolveCitationUrl(url) {
  let current = url;
  for (let hop = 0; hop < 3; hop += 1) {
    if (!isRedirectCitation(current)) return current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const location = response.headers.get('location');
      if (!location) return current;
      current = new URL(location, current).href;
    } catch {
      return current;
    } finally {
      clearTimeout(timer);
    }
  }
  return current;
}

async function resolveCitations(citations) {
  const unique = [...new Set((citations || []).map(item => item.url).filter(Boolean))];
  const cache = new Map();
  await Promise.all(unique.map(async url => cache.set(url, await resolveCitationUrl(url))));
  return (citations || []).map(item => ({ ...item, url: cache.get(item.url) || item.url }));
}

function gptOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const chunks = [];
  for (const item of data?.output || []) {
    if (item?.type && item.type !== 'message') continue;
    for (const part of item?.content || []) {
      if (typeof part?.text === 'string' && part.text) chunks.push(part.text);
    }
  }
  return chunks.join('\n').trim();
}

function compactUsage(raw, searchQueries) {
  if (!raw || typeof raw !== 'object') {
    return { searchQueries: searchQueries || [] };
  }
  const input = raw.input_tokens ?? raw.promptTokenCount ?? raw.prompt_tokens;
  const output = raw.output_tokens ?? raw.candidatesTokenCount ?? raw.completion_tokens;
  const total = raw.total_tokens ?? raw.totalTokenCount;
  const reasoning = raw.output_tokens_details?.reasoning_tokens ?? raw.thoughtsTokenCount;
  const cached = raw.input_tokens_details?.cached_tokens;
  const usage = {};
  if (Number.isFinite(input)) usage.inputTokens = input;
  if (Number.isFinite(output)) usage.outputTokens = output;
  if (Number.isFinite(total)) usage.totalTokens = total;
  if (Number.isFinite(reasoning)) usage.reasoningTokens = reasoning;
  if (Number.isFinite(cached)) usage.cachedTokens = cached;
  usage.searchQueries = searchQueries || [];
  return usage;
}

function createCallController(signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  return {
    controller,
    cleanup() { clearTimeout(timeout); signal?.removeEventListener('abort', onAbort); }
  };
}

async function askGpt(cfg, prompt, region, signal) {
  const { controller, cleanup } = createCallController(signal);
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` };
  const extras = {
    max_output_tokens: MAX_OUTPUT_TOKENS,
    max_tool_calls: 1
  };
  const withLocation = region?.gpt
    ? { search_context_size: SEARCH_CONTEXT_SIZE, user_location: region.gpt }
    : { search_context_size: SEARCH_CONTEXT_SIZE };
  const noLocation = { search_context_size: SEARCH_CONTEXT_SIZE };
  try {
    let applied = !!region?.gpt;
    let tool = withLocation;
    let extra = extras;
    let { response, data } = await postJson(`${cfg.base}/responses`, headers, gptSearchBody(cfg, prompt, tool, extra), controller.signal);
    const err = () => data?.error?.message || '';
    // 中转站的内容审核可能误伤正常的 B2B 采购问题；只重试一次，不改变地区参数。
    if (!response.ok && /invalid_prompt|flagged|usage policy/i.test(err())) {
      ({ response, data } = await postJson(`${cfg.base}/responses`, headers, gptSearchBody(cfg, prompt, tool, extra), controller.signal));
    }
    if (!response.ok && region?.gpt && regionRejected(err())) {
      const minimal = region.gpt.country
        ? { search_context_size: SEARCH_CONTEXT_SIZE, user_location: { type: 'approximate', country: region.gpt.country } }
        : null;
      if (minimal) {
        ({ response, data } = await postJson(`${cfg.base}/responses`, headers, gptSearchBody(cfg, prompt, minimal, extra), controller.signal));
      }
      if (!response.ok && regionRejected(err())) {
        applied = false;
        tool = noLocation;
        ({ response, data } = await postJson(`${cfg.base}/responses`, headers, gptSearchBody(cfg, prompt, tool, extra), controller.signal));
      }
    }
    if (!response.ok && /max_tool_calls/i.test(err())) {
      extra = { max_output_tokens: MAX_OUTPUT_TOKENS };
      ({ response, data } = await postJson(`${cfg.base}/responses`, headers, gptSearchBody(cfg, prompt, tool, extra), controller.signal));
    }
    if (!response.ok && /search_context_size|unknown parameter|unrecognized/i.test(err())) {
      applied = false;
      tool = {};
      extra = { max_output_tokens: MAX_OUTPUT_TOKENS };
      ({ response, data } = await postJson(`${cfg.base}/responses`, headers, gptSearchBody(cfg, prompt, tool, extra), controller.signal));
    }
    if (!response.ok && /max_output_tokens|unknown parameter|unrecognized/i.test(err())) {
      applied = false;
      ({ response, data } = await postJson(`${cfg.base}/responses`, headers, gptSearchBody(cfg, prompt), controller.signal));
    }
    if (!response.ok) throw new Error(data?.error?.message || `GPT 请求失败（HTTP ${response.status}）。`);
    const answer = gptOutputText(data);
    if (!answer) throw new Error('GPT 没有返回有效内容。');
    const searchQueries = gptSearchQueries(data);
    return {
      answer,
      modelName: data?.model || cfg.model,
      regionApplied: applied,
      searchQueries,
      citations: await resolveCitations(gptCitations(data)),
      retrievalSources: await resolveCitations(gptRetrievalSources(data)),
      usage: compactUsage(data?.usage, searchQueries)
    };
  } catch (error) {
    if (error.name === 'AbortError' && signal?.aborted) throw error;
    if (error.name === 'AbortError') throw new Error(`GPT 请求超过 ${TIMEOUT_MS / 1000} 秒，已超时。`);
    throw error;
  } finally {
    cleanup();
  }
}

async function askGemini(cfg, prompt, region, signal) {
  const { controller, cleanup } = createCallController(signal);
  const url = `${cfg.base}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` };
  const baseBody = {
    systemInstruction: { parts: [{ text: SEARCH_GUIDE }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };
  const locatedBody = region?.gemini
    ? { ...baseBody, toolConfig: { retrievalConfig: region.gemini } }
    : baseBody;
  try {
    let applied = !!region?.gemini;
    let { response, data } = await postJson(url, headers, locatedBody, controller.signal);
    const err = () => data?.error?.message || '';
    if (!response.ok && region?.gemini && regionRejected(err())) {
      applied = false;
      ({ response, data } = await postJson(url, headers, baseBody, controller.signal));
    }
    if (!response.ok && /thinkingConfig|thinkingBudget|unknown parameter|unrecognized/i.test(err())) {
      const noThink = {
        ...baseBody,
        generationConfig: { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS }
      };
      ({ response, data } = await postJson(url, headers, applied && region?.gemini
        ? { ...noThink, toolConfig: { retrievalConfig: region.gemini } }
        : noThink, controller.signal));
    }
    if (!response.ok) throw new Error(data?.error?.message || `Gemini 请求失败（HTTP ${response.status}）。`);
    const cand = data?.candidates?.[0] || {};
    const answer = cand.content?.parts?.map(part => part.text || '').join('');
    if (!answer) throw new Error('Gemini 没有返回有效内容。');
    const searchQueries = cand.groundingMetadata?.webSearchQueries || [];
    const citations = await resolveCitations(geminiCitations(cand));
    return {
      answer,
      modelName: data?.modelVersion || data?.model || cfg.model,
      regionApplied: applied,
      searchQueries,
      citations,
      retrievalSources: citations.map(({ url, title }) => ({ url, title })),
      usage: compactUsage(data?.usageMetadata, searchQueries)
    };
  } catch (error) {
    if (error.name === 'AbortError' && signal?.aborted) throw error;
    if (error.name === 'AbortError') throw new Error(`Gemini 请求超过 ${TIMEOUT_MS / 1000} 秒，已超时。`);
    throw error;
  } finally {
    cleanup();
  }
}

async function askModel(modelId, prompt, regionId, signal) {
  const cfg = modelConfigs()[modelId];
  if (!cfg) throw new Error(`未知模型：${modelId}`);
  if (!cfg.apiKey) throw new Error(`尚未配置 ${modelId === 'gpt' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'}，请检查 .env。`);
  const region = resolveRegion(regionId);
  const started = Date.now();
  const result = modelId === 'gpt' ? await askGpt(cfg, prompt, region, signal) : await askGemini(cfg, prompt, region, signal);
  return { ...result, latencyMs: Date.now() - started, regionId: region.id, regionLabel: region.label };
}

const FILLER = /^(strong|proven|good|clear|look|common|very|more|often|widely|highly|practical|bottom|line|battery|energy|solar|industrial|harsh|outdoor|utility|grid|field|power|signal|data|control|cabinet|inverter|storage|current|voltage|system|systems|brands|brand|application|applications|especially|particularly|frequently|respected|regarded|important|relevant|critical|mission|renewable|trusted|leading|recommended|connectors|connector|terminal|blocks|shortlist|comparison|table|specific|series|suitable|however|overview|certifications|headquarters|cost|volume|mode|material|conditional|coverage|flexibility|listed|approved|language|based|transfer|type|nre|customization|manufacturers|components|logistics|time|minor|moderate|deep|shelf|waterproof|leaders|scorecard|quality)$/i;
const STOP_WORD = /^(the|and|for|with|from|this|that|these|those|your|our|top|best|if|or|a|an|of|in|on|to|by|at|as|is|are|be|not|no|yes)$/i;
const TECH = /^(ul|iec|en|iso|din|ip|dc|ac|hvdc|bess|pcs|mc4|radsok|gb|gbt|ce|cb|chademo|ccs|ccs1|ccs2|nacs|j1772)$/i;
const CERT_MARK = /^(ce|rohs|reach|weee|ccc|cqc|ukca|ul|ul94|ul94v0|v0|v1|v2|iec|iso|en|din|ip\d+|ipxxb|ip2x|tuv|tuev|vde|kema|csa|atex|iecex|cb|fcc|pse|kc|lvd|cti|hvil|ul1059|ul1973|ul4128|ul9540|ul2263|ul2251|tuvmark|ullisted|cetuv|dinrail|chademo)$/i;
const CERT_BODY = /^(tuvrheinland|tuvsud|tuvnord|underwriterslaboratories|intertek|sgs)$/i;
const PLACE = /^(europe|european|asia|china|chinese|czech|czechia|america|northamerica|southamerica|germany|german|usa|prague|berlin|taiwanbased|chineselanguage)$/i;
const STANDARDISH = /^(ul|iec|en|iso|gb\/?t?|din|vde|tuv|tuev|sae|jcs|astm)[\s./-]?\d/i;
const PRODUCT_CODE = /^(ropo|ropd|rodc|hvr\d*|ebc\d*|charx|clipline|omnimate|topjobs?|energybus|s\d+[a-z]?|(multi|micro|mega)conx)$/i;
const PARENT_SERIES = /^(Rosenberger|Phoenix Contact|WAGO|Weidmüller|Weidmuller|Higo|Julet|TE Connectivity|DEGSON|Degson|Chogori|Green Cell|EcoVolter)\b/i;
const SECTION_HEADING = /\b(customization|lead time|logistics|scorecard|advantage|breakdown|working days?|off-the-shelf|odm manufacturers|oem manufacturers|key standards|evaluation metric|certification coverage)\b/i;

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

function splitBrandParts(raw) {
  return String(raw || '')
    .split(/\s*(?:\/|,|;|\band\b|\(now part of)\s*/i)
    .map(part => part.replace(/[()]/g, '').replace(/[*_`#]/g, '').trim())
    .filter(Boolean);
}

const INDUSTRY_SUFFIX = /^(terminal|terminals|connectors?|components?|electronics|technology|industries|group|products)$/i;

function looksLikeBrand(raw, options = {}) {
  const s = String(raw || '').replace(/\s+/g, ' ').replace(/[-–—:]+$/g, '').trim();
  if (s.length < 2 || s.length > 42) return false;
  if (/https?:|www\.|[@#]|®|["“”]/i.test(s)) return false;
  if (/degson|高松/i.test(s)) return true;
  const compact = normalizeKey(s);
  if (CERT_MARK.test(compact) || CERT_BODY.test(compact) || PLACE.test(compact) || TECH.test(compact) || PRODUCT_CODE.test(compact)) return false;
  if (STANDARDISH.test(s) || /ul\s*94|v-?0|flame|rohs|reach|certif|\bdoc\b|resistance|flammability|interlock|serviceability|mechanism|recognized|upfront|approved|listed|\bmark\b|\bppp\d+/i.test(s)) return false;
  if (/^t[uü]v\b/i.test(s) && !/rheinland|süd|sud|nord/i.test(s)) return false;
  if (/^ev[-\s]?cables?$/i.test(s)) return false;
  if (/^han[\s-]?[a-z]\d*$/i.test(s)) return false;
  if (SECTION_HEADING.test(s)) return false;
  const words = s.split(' ');
  if (words.length > 4) return false;
  if (/giant|matrix|specialist|ecosystem|selection|distributed|flagship|overview/i.test(s)) return false;
  if (words.length === 3 && !/(contact|connectivity|electric|automation|electronics|industrial|technology|group|products)/i.test(s)) return false;
  const fillerWords = words.filter(word => STOP_WORD.test(word) || FILLER.test(word));
  if (fillerWords.length) {
    const suffixOk = options.allowIndustrySuffix
      && words.length >= 2
      && INDUSTRY_SUFFIX.test(words[words.length - 1])
      && !FILLER.test(words[0])
      && !STOP_WORD.test(words[0]);
    if (!suffixOk) return false;
  }
  if (/^(top-tier|one|well|known|long|broad|best|ip-rated|hv|pv|aio|bm|ceag|cec|atex|iecex|heavy|high|pitch|ultra|availability|rapid|width|density|explosion|push-in|spring-cage|tension-clamp|tension spring|class b)$/i.test(s)) return false;
  if (/^(LAPP|miio)$/.test(s)) return true;
  if (/^[A-Z]{2,8}$/.test(s) && !/^(TE|ABB|WAGO|EATON)$/.test(s) && !options.allowAllCaps) return false;
  if (options.allowAllCaps && /^[A-Z]{2,8}$/.test(s)) return true;
  if (/^[A-Z]{2}$/.test(s) && s !== 'TE') return false;
  if (/contact|connectivity|weidm|müller|mueller|muller|electronics|amphenol|molex|harting|staubli|wago|phoenix|entrelec/i.test(s)) return true;
  if (/^[\u4e00-\u9fff]{2,12}$/.test(s)) return true;
  if (words.length >= 2 && words.every(word => /^[A-ZÄÖÜ]/.test(word) || /^(and|of|&)$/i.test(word))) return true;
  if (words.length === 1 && /^[A-Z][A-Za-zÄÖÜäöü-]{3,}$/.test(s) && !/(ing|tion|ment|ness|ance|able|ible|ated)$/.test(s)) return true;
  return false;
}

function brandDisplayName(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').replace(/®/g, '').replace(/["“”]/g, '').trim();
  s = s.replace(/\s+waterproof$/i, '');
  const parent = s.match(PARENT_SERIES);
  if (parent && /\b(RoPO|RoPD|RoDC|HVR\d*|CHARX|OMNIMATE|CLIPLINE|EBC|S\d+[A-Z]?|Coral|GC Snap|Large|Pro Series)\b/i.test(s)) return parent[1];
  s = s.replace(/\s+GC Snap$/i, '');
  s = s.replace(/\s+(II|III|IV|PRO(?:\s+II)?)$/i, '');
  return s;
}

function pushHit(hits, name, start, end, options = {}) {
  const clean = brandDisplayName(String(name || '').replace(/\s+/g, ' ').replace(/[-–—:]+$/g, '').trim());
  if (!looksLikeBrand(clean, options) || start < 0 || end <= start) return;
  hits.push({ name: clean, start, end });
}

function collectHits(text) {
  const hits = [];
  for (const match of text.matchAll(/degson|高松/gi)) {
    pushHit(hits, match[0] === '高松' ? 'Degson' : match[0], match.index, match.index + match[0].length);
  }
  for (const match of text.matchAll(/\*\*([^*]{2,50})\*\*/g)) {
    const inner = match[1];
    if (/™/.test(inner) || SECTION_HEADING.test(inner)) continue;
    const candidate = inner.replace(/\s*\([^)]*\)\s*$/, '').replace(/[:：]\s*$/, '').trim();
    if (/[:：]/.test(candidate) || /^key considerations$/i.test(candidate)) continue;
    let cursor = match.index + 2;
    for (const part of splitBrandParts(candidate)) {
      const at = text.indexOf(part, cursor);
      if (at < 0) continue;
      pushHit(hits, part, at, at + part.length, { allowAllCaps: true, allowIndustrySuffix: true });
      cursor = at + part.length;
    }
  }
  for (const match of text.matchAll(/^#{2,4}\s+(?:\d+\.\s+)?([^\n]{2,80})$/gm)) {
    const heading = match[1].replace(/\([^)]*\)/g, '').trim();
    if (/[:：™]/.test(heading) || SECTION_HEADING.test(heading)) continue;
    for (const part of splitBrandParts(heading)) {
      const at = text.indexOf(part, match.index);
      if (at < 0) continue;
      pushHit(hits, part, at, at + part.length);
    }
  }
  for (const match of text.matchAll(/^[\t >]*[-*•]\s+(?:\*\*)?([A-ZÄÖÜ][^\n]{1,42}?)(?:\*\*)?(?=\s*$)/gm)) {
    if (/[:：™]/.test(match[1]) || SECTION_HEADING.test(match[1])) continue;
    for (const part of splitBrandParts(match[1])) {
      const at = text.indexOf(part, match.index);
      if (at < 0) continue;
      pushHit(hits, part, at, at + part.length);
    }
  }
  return hits;
}

function canonicalKey(name) {
  if (/degson|高松/i.test(name)) return 'degson';
  return name.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
}

function sameBrand(a, b) {
  const ka = canonicalKey(a);
  const kb = canonicalKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length >= 3 && kb.startsWith(ka)) return true;
  if (kb.length >= 3 && ka.startsWith(kb)) return true;
  return false;
}

function mergeHits(hits) {
  const sorted = [...hits].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept = [];
  for (const hit of sorted) {
    const overlap = kept.find(item => hit.start < item.end && hit.end > item.start);
    if (overlap) {
      if (hit.end - hit.start > overlap.end - overlap.start) {
        overlap.name = hit.name;
        overlap.start = hit.start;
        overlap.end = hit.end;
      }
      continue;
    }
    kept.push({ ...hit });
  }
  const groups = [];
  for (const hit of kept) {
    const group = groups.find(item => sameBrand(item.name, hit.name));
    if (group) {
      if (hit.name.length > group.name.length) group.name = hit.name;
      group.ranges.push([hit.start, hit.end]);
    } else {
      groups.push({ name: hit.name, ranges: [[hit.start, hit.end]] });
    }
  }
  for (const group of groups) {
    group.ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const merged = [];
    for (const [start, end] of group.ranges) {
      const last = merged[merged.length - 1];
      if (last && start < last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    group.ranges = merged;
    group.firstIndex = merged[0][0];
    group.count = merged.length;
    group.id = canonicalKey(group.name);
  }
  groups.sort((a, b) => a.firstIndex - b.firstIndex);
  return groups;
}

function keepBrandSet(groups) {
  if (groups.length <= MAX_BRANDS) return new Set(groups.map(group => group.id));
  const kept = groups.slice(0, MAX_BRANDS).map(group => group.id);
  const last = groups[groups.length - 1].id;
  if (!kept.includes(last)) kept.push(last);
  const degson = groups.find(group => group.id === 'degson');
  if (degson && !kept.includes('degson')) kept.push('degson');
  return new Set(kept);
}

function analyzeText(text) {
  const source = String(text || '');
  const groups = mergeHits(collectHits(source));
  const kept = keepBrandSet(groups);
  const selected = groups.filter(group => kept.has(group.id));
  const mentions = selected.map((group, index) => ({
    brandId: group.id,
    brandName: group.name,
    count: group.count,
    firstIndex: group.firstIndex,
    rank: index + 1
  }));
  const matches = [];
  for (const group of selected) {
    for (const [start, end] of group.ranges) matches.push({ brandId: group.id, start, end });
  }
  matches.sort((a, b) => a.start - b.start);
  return { mentions, matches };
}

function brandsFromResults(results) {
  const map = new Map();
  const lasts = new Set();
  for (const result of results || []) {
    const mentions = result.mentions || [];
    if (mentions.length) lasts.add(mentions[mentions.length - 1].brandId);
    for (const mention of mentions) {
      const id = mention.brandId;
      if (!id) continue;
      const current = map.get(id);
      const name = mention.brandName || current?.name || id;
      const self = id === 'degson' || /degson|高松/i.test(name);
      const total = (current?.total || 0) + (mention.count || 0);
      if (!current || name.length > current.name.length) map.set(id, { id, name, self, total });
      else {
        current.total = total;
        if (self) current.self = true;
      }
    }
  }
  const all = [...map.values()];
  if (all.length <= MAX_BRANDS) {
    return all.map(({ id, name, self }) => ({ id, name, self })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const keep = new Set(all.sort((a, b) => b.total - a.total).slice(0, MAX_BRANDS).map(item => item.id));
  for (const id of lasts) keep.add(id);
  if (map.has('degson')) keep.add('degson');
  return all.filter(item => keep.has(item.id)).map(({ id, name, self }) => ({ id, name, self }));
}

function enrichRun(run) {
  const { excludesBrandEvaluation } = require('./question-intent');
  const { ruleClassify } = require('./question-taxonomy');
  const { attachSources, summarizeSources } = require('./citation-sources');
  const { classifyAnswerMode, MODES } = require('./answer-mode');
  const questions = require('./question-meta').mergeQuestionMetadata(run.questions || []);
  const questionById = new Map(questions.map(question => [question.id, question]));
  const results = (run.results || []).map(result => {
    if (result.status !== 'ok') return result;
    const analyzed = analyzeText(result.answer);
    const manual = MODES.has(result.answerModeOverride);
    const next = { ...result, mentions: analyzed.mentions, matches: analyzed.matches,
      answerMode: manual ? result.answerModeOverride : classifyAnswerMode(questionById.get(result.questionId)?.text, result.answer, analyzed.mentions),
      answerModeSource: manual ? 'manual' : 'rule' };
    const sources = attachSources(next);
    return { ...next, sources: sources.sources, degsonSources: sources.degsonSources };
  });
  const sourceQuestions = questions.map(question => ({ ...question, category: question.category || ruleClassify(question).category }));
  const sourceSummary = summarizeSources(results, sourceQuestions, { targets: require('./source-targets').loadSourceTargets() });
  return {
    ...run,
    questions: questions.map(q => ({ ...q, excludeFromBrandEvaluation: excludesBrandEvaluation(q, results) })),
    results,
    brands: brandsFromResults(results),
    degsonSourceSummary: sourceSummary,
    sourceSummary,
    analysis: { parserVersion: '2', reanalyzed: true, denominatorRule: 'successful-brand-answers-v1' }
  };
}

module.exports = {
  ROOT, QUESTIONS, MAX_BRANDS, REGIONS,
  loadEnvFile, getQuestions, addQuestion, removeQuestion, clearQuestions,
  modelConfigs, resolveRegion, askModel, analyzeText, brandsFromResults, enrichRun,
  regionRejected, gptRetrievalSources
};
