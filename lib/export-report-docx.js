// 分析报告 Word 导出。复用 export-docx 的段落/表格生成器。
const { zipStore } = require('./zip-store');
const { paragraph, table } = require('./export-docx');

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="100"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:eastAsia="Microsoft YaHei"/><w:color w:val="243042"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="230"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="130"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="230" w:after="110"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="170" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
</w:styles>`;

function text(value) {
  return String(value ?? '').replace(/\r?\n/g, '；');
}

function rate(rateValue) {
  if (!rateValue || rateValue.denominator === 0) return '—';
  return `${rateValue.hits}/${rateValue.denominator}（${rateValue.percent}%）`;
}

function modelRate(category) {
  return (category.byModel || []).map(model => `${model.label} ${model.denominator ? `${model.percent}%（${model.hits}/${model.denominator}）` : '—'}`).join('  ');
}

function categoryRows(stats) {
  return stats.categories.map(category => [
    category.name,
    String(category.questionCount),
    String(category.eligibleCount),
    `${category.rate.hits}`,
    rate(category.rate),
    modelRate(category),
    `${category.top1}`,
    `${category.top3}`,
    category.competitors.filter(item => item.hits > 0).slice(0, 2).map(item => `${item.name} ${item.hits}`).join('、') || '—'
  ]);
}

function questionRows(report, category) {
  const analysis = report.questionAnalysis || {};
  return report.stats.questions.filter(question => question.category === category.name).map(question => {
    const row = analysis[question.id];
    return [
      `${question.id} ${text(question.text)}`,
      row?.who || '未分析',
      row ? `${text(row.degson)}；归因：${row.gap}` : '未分析',
      row ? `${text(row.action)}（置信度 ${row.confidence}，${row.evidenceLevel}）` : '—'
    ];
  });
}

function documentXml(report) {
  const stats = report.stats;
  const narrative = report.narrative || {};
  const meta = report.meta || {};
  const created = new Date(report.completedAt || report.createdAt).toLocaleString('zh-CN', { hour12: false });
  const runTime = meta.runCreatedAt ? new Date(meta.runCreatedAt).toLocaleString('zh-CN', { hour12: false }) : '未记录';
  const parts = [];
  parts.push(paragraph('DEGSON 海外 GEO 分析报告', 'Title'));
  parts.push(paragraph(`轮次：${report.runId}　测试时间：${runTime}　地区：${meta.regionLabel || '未记录'}`));
  parts.push(paragraph(`模型：${(meta.models || []).join('、') || '未记录'}　题数：${stats.questionCount}　有效品牌回答：${stats.brandAnswerCount}　成功率：${stats.successCount}/${stats.plannedCount}`));
  parts.push(paragraph(`报告生成：${created}　生成模型：${report.model || '未记录'}　质量：${report.quality?.level === 'complete' ? '完整' : '部分完成'}`));
  if (report.quality?.reasons?.length) parts.push(paragraph(`完成度提示：${report.quality.reasons.join('；')}。`));
  if (meta.reusedCount) parts.push(paragraph(`本轮有 ${meta.reusedCount} 条回答沿用旧轮次，报告中已按本轮数据统计。`));

  parts.push(paragraph('0. 执行摘要', 'Heading1'));
  parts.push(paragraph(narrative.headline || '（汇总未生成）'));
  for (const point of narrative.summaryPoints || []) parts.push(paragraph(`· ${point}`));

  parts.push(paragraph('1. 问题分类与提及率', 'Heading1'));
  parts.push(paragraph('分母为成功且提及任意品牌的回答；失败调用与未提及任何品牌的回答不计入。题目级提及率以至少一个模型成功且提及任意品牌的题为分母。'));
  parts.push(table(['分类', '题数', '有效题', '提及数', '提及率', '分模型', '第1位', '前3位', '主要竞品'], categoryRows(stats), [3, 1, 1, 1, 2, 4, 1, 1, 3]));
  parts.push(paragraph('按问题意图的提及率', 'Heading2'));
  parts.push(table(['意图', '题数', '排除', '提及率'], stats.intents.map(intent => [intent.name, String(intent.questionCount), String(intent.excludedCount), rate(intent.rate)]), [3, 1, 1, 2]));
  const weak = [...stats.categories].filter(category => category.rate.denominator > 0).sort((a, b) => (a.rate.percent ?? 0) - (b.rate.percent ?? 0))[0];
  if (weak) parts.push(paragraph(`关键读数：本轮最弱分类为${weak.name}（${rate(weak.rate)}），${weak.missingQuestionIds.length} 道题 DEGSON 完全缺席；对照竞品 ${weak.competitors.filter(item => item.hits > 0).slice(0, 3).map(item => `${item.name} ${item.hits} 次`).join('、') || '本轮无监测竞品命中'}。`));

  parts.push(paragraph('2. 逐题分析', 'Heading1'));
  parts.push(paragraph('每题 7 个字段：模型实际推荐、DEGSON 表现、归因标签、动作、置信度与证据等级。E1=本轮回答，E2=本轮联网，E3=事实卡，E4=推测。'));
  for (const category of stats.categories) {
    const rows = questionRows(report, category);
    if (!rows.length) continue;
    parts.push(paragraph(`${category.name}（${category.questionCount} 题，DEGSON 提及率 ${rate(category.rate)}）`, 'Heading2'));
    parts.push(table(['题号与问题', '模型实际推荐了谁', 'DEGSON / 归因', '下一步动作'], rows, [5, 4, 4, 5]));
  }
  const focus = new Set(report.focusQuestionIds || []);
  if (focus.size) {
    parts.push(paragraph('重点题深挖', 'Heading2'));
    for (const question of stats.questions.filter(item => focus.has(item.id))) {
      const row = report.questionAnalysis?.[question.id];
      parts.push(paragraph(`${question.id} ${question.text}`, 'Heading3'));
      if (!row) { parts.push(paragraph('该题未完成分析。')); continue; }
      parts.push(paragraph(`模型推荐：${row.who}`));
      parts.push(paragraph(`DEGSON：${row.degson}　归因：${row.gap}　置信度：${row.confidence}（${row.evidenceLevel}）`));
      parts.push(paragraph(`下一步：${row.action}`));
    }
  }

  parts.push(paragraph('3. 优势、劣势与竞品差距', 'Heading1'));
  const sectionTable = (title, rows, headers) => {
    parts.push(paragraph(title, 'Heading2'));
    if (!rows?.length) { parts.push(paragraph('本轮样本未覆盖。')); return; }
    parts.push(table(headers, rows, headers.map(() => 2)));
  };
  sectionTable('本轮优势', (narrative.strengths || []).map(item => [item.title, item.evidence, (item.questionIds || []).join('、')]), ['结论', '本轮证据', '题号']);
  sectionTable('本轮劣势', (narrative.weaknesses || []).map(item => [item.title, item.evidence, (item.questionIds || []).join('、')]), ['结论', '本轮证据', '题号']);
  sectionTable('竞品差距', (narrative.competitorGaps || []).map(item => [item.brand, item.topic, item.evidence, (item.questionIds || []).join('、')]), ['品牌', '主题', '证据', '题号']);
  if (narrative.categoryInsights?.length) {
    parts.push(paragraph('分类结论', 'Heading2'));
    parts.push(table(['分类', '结论', '置信度'], narrative.categoryInsights.map(item => [item.category, item.insight, item.confidence]), [2, 6, 1]));
  }

  parts.push(paragraph('4. 下一步行动', 'Heading1'));
  for (const action of narrative.actions || []) {
    parts.push(paragraph(`${action.priority}. ${action.title}`, 'Heading2'));
    if (action.questionIds?.length) parts.push(paragraph(`针对题号：${action.questionIds.join('、')}`));
    for (const change of action.changes || []) parts.push(paragraph(`· ${change}`));
    parts.push(paragraph(`建议职能：${action.owner || '待指派'}　交付物：${action.deliverable || '待定义'}`));
    parts.push(paragraph(`验收：${action.acceptance || '待定义'}`));
  }
  if (narrative.roadmap) {
    parts.push(paragraph('30/60/90 天节奏', 'Heading2'));
    parts.push(table(['阶段', '要做的事'], [['30 天', (narrative.roadmap.d30 || []).join('；') || '—'], ['60 天', (narrative.roadmap.d60 || []).join('；') || '—'], ['90 天', (narrative.roadmap.d90 || []).join('；') || '—']], [1, 8]));
  }
  parts.push(paragraph('复测方案', 'Heading2'));
  parts.push(paragraph(narrative.retest || '用同一批问题、同地区、同模型复测，比较提及率、首位与引用来源变化。'));

  const sourceStats = stats.sourceStats || stats.citationSources;
  if (sourceStats) {
    parts.push(paragraph('模块表现', 'Heading2'));
    parts.push(table(['模块','题数','品牌回答','提到 DEGSON','提及率','有来源','目标命中'], Object.entries(sourceStats.byModule || {}).map(([name,s])=>[name,String(s.questionCount),String(s.brandAnswerCount),String(s.degsonMentions),s.degsonRate == null ? '—' : `${s.degsonRate}%`,String(s.sourceAnswers),String(s.targetHits)]),[2,1,1,1,1,1,1]));
    parts.push(paragraph(`模块加权分：${sourceStats.moduleScore ?? '—'}%（仅用于内部优先级，不代表市场占有率）。`));
    parts.push(paragraph('回答模式', 'Heading2'));
    parts.push(table(['模式','题数','回答','提到 DEGSON','有来源','目标命中'], Object.entries(sourceStats.byAnswerMode || {}).map(([name,s])=>[name,String(s.questionCount),String(s.answerCount),String(s.degsonMentions),String(s.sourceAnswers),String(s.targetHits)]),[3,1,1,1,1,1]));
    parts.push(paragraph('品牌来源 Top 10', 'Heading2'));
    parts.push(table(['品牌','站点','引用','回答','问题','模型'], (sourceStats.sourceBrands || []).slice(0,10).map(s=>[s.brandName,s.hosts.join('、'),String(s.citations),String(s.answers),String(s.questions),s.models.join(' / ') || '—']),[2,3,1,1,1,2]));
    parts.push(paragraph('竞品来源地图 Top 10', 'Heading2'));
    parts.push(table(['品牌','站点','类型','引用','回答','问题','模型'], (sourceStats.competitorSourceMap || []).slice(0,10).map(s=>[s.brandName,s.host,s.kindLabel,String(s.citations),String(s.answers),String(s.questions),s.models.join(' / ') || '—']),[2,2,2,1,1,1,2]));
    parts.push(paragraph('5. 引用来源统计', 'Heading1'));
      parts.push(paragraph(`回答覆盖优先（分母为有来源回答）：竞品 ${sourceStats.coverage?.competitor.answers ?? 0}/${sourceStats.withCitations}，目录 ${sourceStats.coverage?.directory.answers ?? 0}/${sourceStats.withCitations}，官网 ${sourceStats.coverage?.official.answers ?? 0}/${sourceStats.withCitations}；同一回答可覆盖多类来源。`));
      parts.push(table(['模型来源缺口','有来源回答','官网覆盖','目录覆盖','媒体覆盖','竞品覆盖'], (sourceStats.models || []).map(m=>[m.modelId, String(m.withCitations), ...['official','directory','media','competitor'].map(k=>`${m.coverage?.[k]?.answers ?? 0}/${m.withCitations}（${m.coverage?.[k]?.percent ?? 0}%）`)]),[2,1,2,2,2,2]));
      if (sourceStats.targetLanding?.length) parts.push(table(['目标页','模块','类型','命中回答','引用条数','模型','未命中问题'], sourceStats.targetLanding.map(t=>[t.label,t.module || '—',t.type || '—',String(t.answers),String(t.citations),t.models.join(' / '),t.missingQuestions.join('、')]),[3,1,2,1,1,2,3]));
      else parts.push(paragraph('未配置目标页'));
      parts.push(paragraph(`唯一来源 ${sourceStats.uniqueUrlCount ?? 0} 个 URL / ${sourceStats.uniqueHostCount ?? 0} 个域名；第三方占比 ${sourceStats.thirdPartyShare ?? 0}%；测试站 ${sourceStats.testCount ?? 0} 条；未解析 ${sourceStats.redirectCount ?? 0} 条。引用条数与回答覆盖数分别统计；回答可覆盖多类来源。`));
    parts.push(paragraph(`成功回答 ${sourceStats.answers} 条；有引用 ${sourceStats.withCitations} 条；共 ${sourceStats.allCitationCount} 条引用。提到 DEGSON ${sourceStats.degson.mentioned} 条，其中有引用 ${sourceStats.degson.sourced} 条、没有引用标注 ${sourceStats.degson.unsourced} 条。`));
    parts.push(table(['来源类型', '回答数', '覆盖率', '引用条数', '唯一域名'], (sourceStats.allCategories || sourceStats.categories || []).filter(item => item.count > 0).sort((a,b)=>(b.answers || 0)-(a.answers || 0) || b.count-a.count).map(item => [item.label, `${item.answers ?? 0}`, `${item.answerPercent ?? 0}%`, `${item.count}`, `${item.uniqueHosts ?? 0}`]), [3, 1, 1, 1, 1]));
    if (sourceStats.byAuthority?.length) {
      parts.push(paragraph('来源权威性', 'Heading2'));
      const auth = sourceStats.authoritySummary;
      if (auth) {
        parts.push(paragraph(`权威第三方 ${auth.authoritativeThirdParty.answers}/${sourceStats.withCitations}（${auth.authoritativeThirdParty.answerPercent}%），厂商自述 ${auth.manufacturerClaims.answers} 条回答，低权威 ${auth.lowAuthority.answers}/${sourceStats.withCitations}（${auth.lowAuthority.answerPercent}%）。厂商官网是自述，不是独立验证。`));
        if (auth.lowAuthority.answerPercent > 20) parts.push(paragraph('本轮低权威来源占比较高，不要把“被引用”当成“被验证”。'));
        if (auth.lowAuthority.topHosts?.length) parts.push(paragraph(`低权威域名：${auth.lowAuthority.topHosts.map(item => `${item.host}（${item.count}条 / ${item.answers}回答）`).join('、')}。`));
      }
      parts.push(table(['权威类型', '引用条数', '回答数', '覆盖率', '唯一域名', '第一方', '第三方'], sourceStats.byAuthority.map(item => [item.label, String(item.citations), String(item.answers), `${item.answerPercent}%`, String(item.uniqueHosts), String(item.firstPartyCitations), String(item.thirdPartyCitations)]), [2, 1, 1, 1, 1, 1, 1]));
      parts.push(table(['权威类型', ...(sourceStats.models || []).flatMap(model => [`${model.modelId} 条数`, `${model.modelId} 回答`])], sourceStats.byAuthority.map(row => [row.label, ...(sourceStats.models || []).flatMap(model => { const hit = (model.byAuthority || []).find(item => item.id === row.id); return [String(hit?.citations || 0), String(hit?.answers || 0)]; })]), [2, ...Array((sourceStats.models || []).length * 2).fill(1)]));
    }
    if (sourceStats.models?.length) {
      parts.push(table(['模型', '回答', '有引用', '提到 DEGSON', 'DEGSON 有引用', '引用条数', '主要来源'], sourceStats.models.map(item => [item.modelId, `${item.answers}`, `${item.withCitations}`, `${item.mentioned}`, `${item.sourced}`, `${item.citations}`, (item.categories || []).filter(category => category.count > 0).sort((a, b) => b.count - a.count).slice(0, 4).map(category => `${category.label} ${category.count}`).join('、') || '—']), [2, 1, 1, 1, 1, 1, 4]));
    }
    if (sourceStats.byCategory?.length) {
      parts.push(paragraph('分品类来源', 'Heading2'));
      parts.push(table(['分类', '回答', '有引用', '提到 DEGSON', 'DEGSON 有引用', '主要来源'], sourceStats.byCategory.map(item => [item.category, `${item.answers}`, `${item.withCitations}`, `${item.mentioned}`, `${item.sourced}`, item.categories.filter(kind => kind.count > 0).slice(0, 3).map(kind => `${kind.label} ${kind.count}`).join('、')]), [3, 1, 1, 1, 1, 4]));
    }
    if (sourceStats.absent?.topHosts?.length) parts.push(paragraph(`DEGSON 缺席时主要引用：${sourceStats.absent.topHosts.slice(0, 8).map(item => `${item.host}（${item.kindLabel}，${item.count}）`).join('、')}。`));
    parts.push(paragraph(`来源建议：${sourceStats.advice}`));
  }

  parts.push(paragraph('6. 方法与证据', 'Heading1'));
  parts.push(paragraph(narrative.limits || '单轮测试不能证明因果关系；未提及不等于未收录。'));
  if (report.research?.length) {
    parts.push(paragraph('联网核查来源', 'Heading2'));
    for (const item of report.research) {
      parts.push(paragraph(`${item.category}：${item.status === 'complete' ? '已核查' : item.status === 'unverified' ? '未取得可核验来源' : '未完成'}`, 'Heading3'));
      if (item.text) parts.push(paragraph(item.text));
      for (const source of item.sources || []) parts.push(paragraph(`${source.title}：${source.url}`));
    }
  }
  parts.push(paragraph(`统计口径：${stats.denominatorRule}；分类版本 ${stats.version}；报告版本 ${report.version}。`));
  parts.push('<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join('')}</w:body></w:document>`;
}

function buildAnalysisDocx(report) {
  const normalized = { ...report, questionAnalysis: Array.isArray(report.questionAnalysis) ? Object.fromEntries(report.questionAnalysis.map(row => [row.qid, row])) : report.questionAnalysis || {} };
  return zipStore([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: RELS },
    { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/document.xml', data: documentXml(normalized) }
  ]);
}

module.exports = { buildAnalysisDocx };
