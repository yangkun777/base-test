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

  parts.push(paragraph('5. 方法与证据', 'Heading1'));
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
