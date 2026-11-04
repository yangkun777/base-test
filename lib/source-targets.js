const fs = require('node:fs');
const path = require('node:path');
function loadSourceTargets() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../config/source-targets.json'), 'utf8'));
}
function buildTargetLanding(items, targets = []) {
  const { cleanUrl, hostOf } = require('./citation-sources');
  return targets.map(target => {
    const questions = target.questions || [];
    const urls = (target.urls || []).map(cleanUrl);
    const hosts = (target.hosts || []).map(x => x.toLowerCase().replace(/^www\./, ''));
    const hits = items.filter(x => (!questions.length || questions.includes(x.questionId)) && (urls.includes(cleanUrl(x.url)) || hosts.some(h => { const host = hostOf(x.url); return host === h || host.endsWith('.' + h); })));
    return { id: target.id, label: target.label, module: target.module, priority: target.priority, type: target.type, questions, citations: hits.length, answers: new Set(hits.map(x=>`${x.questionId}:${x.modelId}`)).size, models: [...new Set(hits.map(x=>x.modelId))], hitUrls: [...new Set(hits.map(x=>cleanUrl(x.url)))], missingQuestions: questions.filter(q=>!hits.some(x=>x.questionId===q)) };
  }).sort((a,b)=>b.answers-a.answers || b.citations-a.citations);
}
module.exports = { loadSourceTargets, buildTargetLanding };
