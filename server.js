// Degson 海外模型 GEO 基线平台 — 零依赖 Node 服务
// 职责：托管前端构建产物、封装双模型调用（Key 只在服务端）、品牌提及解析、评测结果落盘。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, MAX_QUESTIONS, loadEnvFile, getQuestions, addQuestion, removeQuestion, modelConfigs, askModel, analyzeText, brandsFromResults, enrichRun } = require('./lib/engine');
const { buildRunDocx } = require('./lib/export-docx');

loadEnvFile(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 3100);
const RUNS_DIR = path.join(ROOT, 'data', 'runs');
const DIST_DIR = path.join(ROOT, 'frontend', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function sendFile(res, file) {
  const contentType = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > 2000000) reject(new Error('请求内容过长。'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function listRuns() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs.readdirSync(RUNS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const run = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8'));
        const ok = run.results.filter(r => r.status === 'ok').length;
        return { id: run.id, createdAt: run.createdAt, okCount: ok, total: run.results.length };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function runFilePath(id) {
  if (!/^run-[\w-]+$/.test(id)) return null;
  return path.join(RUNS_DIR, `${id}.json`);
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/meta') {
    const cfgs = modelConfigs();
    return sendJson(res, 200, {
      questions: getQuestions(),
      maxQuestions: MAX_QUESTIONS,
      brands: [],
      models: Object.values(cfgs).map(c => ({ id: c.id, label: c.label, model: c.model, configured: !!c.apiKey }))
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/questions') {
    const body = JSON.parse(await readBody(req) || '{}');
    try {
      const question = addQuestion(body);
      return sendJson(res, 200, { question, questions: getQuestions(), maxQuestions: MAX_QUESTIONS });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || String(error) });
    }
  }

  const questionMatch = url.pathname.match(/^\/api\/questions\/([\w-]+)$/);
  if (req.method === 'DELETE' && questionMatch) {
    try {
      const questions = removeQuestion(questionMatch[1]);
      return sendJson(res, 200, { questions, maxQuestions: MAX_QUESTIONS });
    } catch (error) {
      return sendJson(res, 400, { error: error.message || String(error) });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/ask') {
    const body = JSON.parse(await readBody(req) || '{}');
    const question = getQuestions().find(q => q.id === body.questionId);
    if (!question) return sendJson(res, 400, { error: `未知问题：${body.questionId}` });
    try {
      const { answer, modelName, latencyMs, usage } = await askModel(body.modelId, question.text);
      const { mentions, matches } = analyzeText(answer);
      return sendJson(res, 200, {
        questionId: question.id, modelId: body.modelId, status: 'ok',
        answer, modelName, latencyMs, mentions, matches, usage
      });
    } catch (error) {
      return sendJson(res, 200, {
        questionId: question.id, modelId: body.modelId, status: 'error',
        error: error.message || String(error)
      });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/runs') {
    const body = JSON.parse(await readBody(req) || '{}');
    if (!Array.isArray(body.results) || body.results.length === 0) {
      return sendJson(res, 400, { error: '评测结果为空，未保存。' });
    }
    const id = `run-${new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, 17)}`;
    const results = body.results;
    const run = {
      id,
      createdAt: new Date().toISOString(),
      models: body.models || [],
      questions: body.questions || getQuestions(),
      brands: body.brands || brandsFromResults(results),
      results
    };
    fs.mkdirSync(RUNS_DIR, { recursive: true });
    fs.writeFileSync(runFilePath(id), JSON.stringify(run, null, 2), 'utf8');
    return sendJson(res, 200, { id });
  }

  if (req.method === 'GET' && url.pathname === '/api/runs') {
    return sendJson(res, 200, listRuns());
  }

  const exportMatch = url.pathname.match(/^\/api\/runs\/([\w-]+)\/export\.docx$/);
  if (req.method === 'GET' && exportMatch) {
    const file = runFilePath(exportMatch[1]);
    if (!file || !fs.existsSync(file)) return sendJson(res, 404, { error: '未找到该评测记录。' });
    const run = enrichRun(JSON.parse(fs.readFileSync(file, 'utf8')));
    const docx = buildRunDocx(run);
    const filename = `${run.id}.docx`;
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': docx.length
    });
    return res.end(docx);
  }

  const runMatch = url.pathname.match(/^\/api\/runs\/([\w-]+)$/);
  if (req.method === 'GET' && runMatch) {
    const file = runFilePath(runMatch[1]);
    if (!file || !fs.existsSync(file)) return sendJson(res, 404, { error: '未找到该评测记录。' });
    return sendJson(res, 200, enrichRun(JSON.parse(fs.readFileSync(file, 'utf8'))));
  }

  sendJson(res, 404, { error: '接口不存在。' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    // 静态托管前端构建产物，未命中回退 index.html
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!rel) rel = 'index.html';
    const abs = path.normalize(path.join(DIST_DIR, rel));
    if ((abs === DIST_DIR || abs.startsWith(DIST_DIR + path.sep)) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return sendFile(res, abs);
    }
    const index = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(index)) return sendFile(res, index);
    sendJson(res, 404, { error: '前端尚未构建，请先在 frontend 目录执行 npm run build。' });
  } catch (error) {
    sendJson(res, 500, { error: error.message || String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`Degson GEO 基线平台已启动：http://localhost:${PORT}`);
});
