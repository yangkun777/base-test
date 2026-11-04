const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanUrl, summarizeSources } = require('../lib/citation-sources');
const { classifyAnswerMode } = require('../lib/answer-mode');
const { mergeQuestionMetadata } = require('../lib/question-meta');
const { allSourcesForAnswer } = require('../lib/citation-sources');
test('answer mode order and none', () => {
  const mentions = [{brandId:'degson'}];
  assert.equal(classifyAnswerMode('How should engineers compare suppliers?', 'DEGSON', mentions), 'engineering_howto');
  assert.equal(classifyAnswerMode('Which suppliers are recommended?', 'DEGSON', mentions), 'recommendation_list');
  assert.equal(classifyAnswerMode('Which cables meet UL 4128?', 'DEGSON', mentions), 'certification');
  assert.equal(classifyAnswerMode('Are there alternatives to DEGSON?', 'DEGSON', mentions), 'procurement_alternative');
  assert.equal(classifyAnswerMode('Any brands?', 'NONE', []), 'none');
});
test('metadata preserves question identity', () => {
  const original = {id:'q22',text:'Which Type 2 EV cable?'};
  const [question] = mergeQuestionMetadata([original]);
  assert.equal(question.id,original.id); assert.equal(question.text,original.text);
  assert.equal(question.module,'EV'); assert.equal(question.productFit,'consumer');
});
test('source brands distinguish competitors and DEGSON on a shared line', () => {
  const answer='Higo Julet DEGSON [list](https://example.com/list)\nHigo [page](https://higo.com/page)';
  const matches=['Higo','Julet','DEGSON','Higo'].map((name,index)=>({brandId: name.toLowerCase(),start:answer.indexOf(name,index===3?20:0),end:answer.indexOf(name,index===3?20:0)+name.length}));
  const sources=allSourcesForAnswer(answer,matches);
  assert.deepEqual(sources[0].brands.map(brand=>brand.brandId).sort(),['degson','higo','julet']);
  assert.equal(sources[1].degsonRelated,false);
  const summary=summarizeSources([{status:'ok',questionId:'q1',modelId:'gpt',answer,mentions:matches,matches}], [{id:'q1',module:'ebike'}]);
  assert.ok(summary.competitorSourceMap.some(row=>row.brandId==='higo'));
});
test('module score ignores unweighted modules and keeps denominators', () => {
  const results=[{status:'ok',questionId:'q1',modelId:'gpt',answer:'DEGSON',mentions:[{brandId:'degson'}],matches:[]},{status:'ok',questionId:'q2',modelId:'gpt',answer:'WAGO',mentions:[{brandId:'wago'}],matches:[]}];
  const summary=summarizeSources(results,[{id:'q1',module:'EV'},{id:'q2',module:'circular'}]);
  assert.equal(summary.byModule.EV.questionCount,1);
  assert.equal(summary.byModule.circular.questionCount,1);
  assert.equal(summary.moduleScore,100);
});
test('coverage unions third-party answers instead of summing category coverage', () => {
  const s = summarizeSources([{questionId:'q',modelId:'gpt',status:'ok',answer:'https://directindustry.com/a https://directindustry.com/b https://linkedin.com/test',mentions:[],matches:[]}]);
  assert.equal(s.coverage.directory.answers,1);
  assert.equal(s.coverage.thirdParty.answers,1);
  assert.equal(s.coverage.thirdParty.citations,2);
  assert.equal(s.coverage.thirdParty.percent,100);
  assert.equal(s.models[0].coverage.official.answers,0);
});
test('target landing canonical matches and host boundaries', () => {
  const { buildTargetLanding } = require('../lib/source-targets');
  const items=[{questionId:'q1',modelId:'gpt',url:'https://www.viox.com/a?utm_source=x'},{questionId:'q1',modelId:'gemini',url:'https://sub.viox.com/b'},{questionId:'q2',modelId:'gpt',url:'https://notviox.com/a'}];
  const [hit] = buildTargetLanding(items,[{id:'v',hosts:['viox.com'],questions:['q1','q2']}]);
  assert.equal(hit.answers,2);assert.equal(hit.citations,2);assert.deepEqual(hit.missingQuestions,['q2']);
  assert.equal(buildTargetLanding(items,[{id:'exact',urls:['https://viox.com/a']}])[0].citations,1);
  assert.deepEqual(buildTargetLanding(items,[]),[]);
});
test('canonical URLs preserve meaningful query and remove mixed punctuation', () => {
  assert.equal(cleanUrl(' https://www.degson.com/page/?id=2&lang=en&utm_source=x#section`), '), 'https://degson.com/page?id=2&lang=en');
});
test('host counts distinguish answers, URLs and unique questions', () => {
  const summary = summarizeSources(['gpt','gemini'].map(modelId => ({ questionId:'q1',modelId,status:'ok',answer:'https://wago.com/a https://wago.com/b',mentions:[],matches:[] })), [{id:'q1',category:'端子台'}]);
  const host = summary.allTopHosts.find(x=>x.host==='wago.com');
  assert.equal(host.count,4);
  assert.equal(host.answers,2);
  assert.equal(host.questions,1);
  assert.equal(summary.uniqueUrlCount,2);
});
