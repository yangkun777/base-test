const { zipStore } = require('./zip-store');
const { isBrandAnswer } = require('./question-intent');

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraph(text, style) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  const lines = String(text ?? '').split(/\r?\n/);
  return lines.map((line, index) => {
    const content = line.length ? `<w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r>` : '<w:r><w:t></w:t></w:r>';
    return `<w:p>${index === 0 ? styleXml : ''}${content}</w:p>`;
  }).join('');
}

function cell(text, header = false, shade = false) {
  const fill = header ? 'DFE8F6' : shade ? 'F4F7FC' : 'FFFFFF';
  const runPr = header ? '<w:rPr><w:b/><w:color w:val="243042"/></w:rPr>' : '';
  return `<w:tc><w:tcPr><w:shd w:val="clear" w:fill="${fill}"/><w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:r>${runPr}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p></w:tc>`;
}

function table(headers, rows, weights) {
  const widths = weights || headers.map(() => 1);
  const total = widths.reduce((sum, weight) => sum + weight, 0);
  const grid = widths.map(weight => `<w:gridCol w:w="${Math.round(weight / total * 10000)}"/>`).join('');
  const head = `<w:tr><w:trPr><w:tblHeader w:val="true"/></w:trPr>${headers.map(h => cell(h, true)).join('')}</w:tr>`;
  const body = rows.map((row, index) => `<w:tr>${row.map(value => cell(value, false, index % 2 === 1)).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>
    <w:top w:val="single" w:sz="4" w:color="C0C8D4"/>
    <w:left w:val="single" w:sz="4" w:color="C0C8D4"/>
    <w:bottom w:val="single" w:sz="4" w:color="C0C8D4"/>
    <w:right w:val="single" w:sz="4" w:color="C0C8D4"/>
    <w:insideH w:val="single" w:sz="4" w:color="C0C8D4"/>
    <w:insideV w:val="single" w:sz="4" w:color="C0C8D4"/>
  </w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${head}${body}</w:tbl><w:p/>`;
}

function share(total, grand) {
  if (!grand) return '—';
  return `${((total / grand) * 100).toFixed(1)}%`;
}

function isDegsonMention(mention) {
  return mention.brandId === 'degson' || /degson|高松/i.test(mention.brandName || '');
}

function summarize(run) {
  const questionIds = (run.questions || []).map(item => item.id);
  const ids = questionIds.length ? questionIds : [...new Set((run.results || []).map(item => item.questionId))];
  const questionCount = ids.length;
  const models = run.models?.length
    ? run.models
    : [...new Set((run.results || []).map(item => item.modelId))].map(id => ({ id, label: id }));
  const hits = Object.fromEntries(models.map(model => [model.id, 0]));
  const valid = Object.fromEntries(models.map(model => [model.id, 0]));
  const rows = [];
  for (const questionId of ids) {
    const text = (run.questions || []).find(item => item.id === questionId)?.text || questionId;
    const cells = {};
    let any = false;
    for (const model of models) {
      const result = (run.results || []).find(item => item.questionId === questionId && item.modelId === model.id);
      if (isBrandAnswer(result)) valid[model.id] += 1;
      const mentions = result?.status === 'ok' ? result.mentions || [] : [];
      const mention = mentions.find(isDegsonMention);
      if (mention) {
        hits[model.id] += 1;
        any = true;
      }
      const before = mention
        ? mentions.filter(item => item.rank < mention.rank).sort((a, b) => a.rank - b.rank).map(item => item.brandName || item.brandId)
        : [];
      cells[model.id] = !result
        ? '未测试（已停止）'
        : result.status !== 'ok'
          ? '调用失败'
        : mention
          ? (before.length ? `第 ${mention.rank} 位（${before.join('、')} 之后）` : `第 ${mention.rank} 位`)
          : isBrandAnswer(result) ? '未提及' : '未提及任何品牌（不计入）';
    }
    if (any) rows.push({ text, cells });
  }
  const rates = models.map(model => ({
    label: model.label,
    hits: hits[model.id] || 0,
    denom: valid[model.id]
  }));
  return { questionCount, models, rates, rows };
}

function dashboardStats(run, summary) {
  const results = run.results || [];
  const ok = results.filter(isBrandAnswer);
  const validByModel = Object.fromEntries(summary.models.map(model => [model.id, ok.filter(result => result.modelId === model.id).length]));
  const brands = run.brands?.length ? run.brands : [...new Map(ok.flatMap(result => (result.mentions || []).map(mention => [mention.brandId, { id: mention.brandId, name: mention.brandName || mention.brandId }]))).values()];
  const brandRows = brands.map(brand => {
    const matching = ok.map(result => ({ result, mention: (result.mentions || []).find(item => item.brandId === brand.id) })).filter(item => item.mention);
    const byModel = Object.fromEntries(summary.models.map(model => [model.id, matching.filter(item => item.result.modelId === model.id).length]));
    return { ...brand, total: matching.length, byModel, top1: matching.filter(item => item.mention.rank === 1).length, top3: matching.filter(item => item.mention.rank <= 3).length };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const degson = brandRows.find(brand => brand.id === 'degson' || /degson|高松/i.test(brand.name));
  const questionIds = (run.questions?.length ? run.questions.map(q => q.id) : [...new Set(results.map(result => result.questionId))]);
  const attempted = questionIds.filter(id => summary.models.every(model => results.some(result => result.questionId === id && result.modelId === model.id)));
  const covered = attempted.filter(id => summary.models.every(model => results.some(result => result.questionId === id && result.modelId === model.id && result.status === 'ok'))).length;
  const bothMentioned = questionIds.filter(id => summary.models.every(model => ok.some(result => result.questionId === id && result.modelId === model.id && (result.mentions || []).some(isDegsonMention)))).length;
  const comparable = questionIds.filter(id => summary.models.every(model => ok.some(result => result.questionId === id && result.modelId === model.id))).length;
  const mention = ok.length ? (degson?.total || 0) / ok.length : 0;
  const first = ok.length ? (degson?.top1 || 0) / ok.length : 0;
  const score = Math.round((mention * 0.6 + first * 0.25 + (comparable ? bothMentioned / comparable : 0) * 0.15) * 100);
  return { ok: ok.length, validByModel, brandRows, degson, attempted: attempted.length, covered, score };
}

function documentXml(run) {
  const created = new Date(run.createdAt).toLocaleString('zh-CN', { hour12: false });
  const models = (run.models || []).map(item => item.label).join('、') || '未记录';
  const questions = run.questions || [];
  const summary = summarize(run);
  const stats = dashboardStats(run, summary);
  const sourceSummary = run.sourceSummary || run.degsonSourceSummary;
  const parts = [
    paragraph('Degson 海外 GEO 基线评测', 'Title'),
    paragraph(`评测时间：${created}`),
    paragraph(`记录编号：${run.id}`),
    paragraph(`本轮测试地区：${run.regionLabel || '历史轮次未记录地区'}`),
    ...(run.stoppedByUser ? [paragraph(`用户中途主动停止：实际完成 ${run.results.length} / 原计划 ${run.plannedCount || run.results.length} 条调用；以下统计以实际完成的结果为准。`)] : []),
    paragraph(`模型：${models}`),
    paragraph(`问题数：${summary.questionCount}（同一问题、同一模型多次提及只计 1 次）`),
    paragraph(`本轮 ${(run.results || []).filter(r => r.status === 'ok' && !isBrandAnswer(r)).length} 条成功回答未提及任何品牌，不计入品牌提及率分母。按每个模型的回答分别判断，提到竞品但未提到DEGSON仍计入；原始回答保留。`),
    paragraph(`调用覆盖：计划 ${run.plannedCount ?? (summary.questionCount * summary.models.length)} 次；成功 ${(run.results || []).filter(r => r.status === 'ok').length} 次；失败 ${(run.results || []).filter(result => result.status === 'error').length} 次；未运行 ${Math.max(0, (run.plannedCount ?? (summary.questionCount * summary.models.length)) - (run.results || []).length)} 次。提及率以成功且提及任意品牌的回答数为分母。`),
    paragraph('顺位为已识别品牌在全文中的首次出现顺序；背景文字也可能计入，并不代表推荐排名。'),
    ...(run.analysis?.reanalyzed ? [paragraph(`当前展示按解析规则 v${run.analysis.parserVersion} 重新解析；原始记录未修改。`)] : []),
    paragraph('失败调用清单', 'Heading1'),
    ...((run.results || []).filter(result => result.status === 'error').map(result => paragraph(`${questions.find(q => q.id === result.questionId)?.text || result.questionId} · ${summary.models.find(m => m.id === result.modelId)?.label || result.modelId}：${result.error || '未知错误'}`))),
    paragraph('本轮概览', 'Heading1'),
    table(['指标', '结果', '统计说明'], [
      ['Degson 提及率', `${stats.degson?.total || 0} / ${stats.ok}（${share(stats.degson?.total || 0, stats.ok)}）`, '失败作答不计入总题数'],
      ['首次提及次数', `${stats.degson?.top1 || 0} / ${stats.ok}（${share(stats.degson?.top1 || 0, stats.ok)}）`, 'Degson 排在第 1 位的回答'],
      ['品牌综合得分', stats.ok ? `${stats.score} / 100` : '不适用（无有效回答）', '提及率 60%，第 1 位占比 25%，双模型同时提及 15%'],
      ['模型覆盖率', `${stats.covered} / ${stats.attempted}（${stats.attempted ? Math.round(stats.covered / stats.attempted * 100) : 0}%）`, '每个模型均成功作答的问题']
    ], [2, 2, 5]),
    ...(sourceSummary ? [
      paragraph('引用来源统计', 'Heading1'),
      paragraph(`回答覆盖优先（分母为有来源回答）：竞品 ${sourceSummary.coverage?.competitor.answers ?? 0}/${sourceSummary.withCitations}，目录 ${sourceSummary.coverage?.directory.answers ?? 0}/${sourceSummary.withCitations}，官网 ${sourceSummary.coverage?.official.answers ?? 0}/${sourceSummary.withCitations}；同一回答可覆盖多类来源。`),
      table(['模型来源缺口','有来源回答','官网覆盖','目录覆盖','媒体覆盖','竞品覆盖'], (sourceSummary.models || []).map(m=>[m.modelId, String(m.withCitations), ...['official','directory','media','competitor'].map(k=>`${m.coverage?.[k]?.answers ?? 0}/${m.withCitations}（${m.coverage?.[k]?.percent ?? 0}%）`)]),[2,1,2,2,2,2]),
      table(['目标页','命中回答','引用条数','模型','未命中问题'], (sourceSummary.targetLanding || []).map(t=>[t.label,String(t.answers),String(t.citations),t.models.join(' / '),t.missingQuestions.join('、')]),[3,1,1,2,3]),
      paragraph(`唯一来源 ${sourceSummary.uniqueUrlCount ?? 0} 个 URL / ${sourceSummary.uniqueHostCount ?? 0} 个域名；第三方占比 ${sourceSummary.thirdPartyShare ?? 0}%；测试站 ${sourceSummary.testCount ?? 0} 条；未解析 ${sourceSummary.redirectCount ?? 0} 条。引用条数与回答覆盖数分别统计；回答可覆盖多类来源。`),
      paragraph(`成功回答 ${sourceSummary.answers} 条；有引用 ${sourceSummary.withCitations} 条；共 ${sourceSummary.allCitationCount} 条引用。提到 Degson ${sourceSummary.degson.mentioned} 条，其中有引用 ${sourceSummary.degson.sourced} 条、没有引用标注 ${sourceSummary.degson.unsourced} 条。`),
      table(
        ['来源类型', '回答数', '覆盖率', '引用条数', '唯一域名'],
        (sourceSummary.allCategories || sourceSummary.categories || []).filter(item => item.count > 0).sort((a,b)=>(b.answers || 0)-(a.answers || 0) || b.count-a.count).map(item => [item.label, `${item.answers ?? 0}`, `${item.answerPercent ?? 0}%`, `${item.count}`, `${item.uniqueHosts ?? 0}`]),
        [3, 1, 1, 1, 1]
      ),
      ...(sourceSummary.byAuthority?.length ? [
        paragraph('来源权威性', 'Heading2'),
        paragraph(`权威第三方 ${sourceSummary.authoritySummary?.authoritativeThirdParty.answers ?? 0}/${sourceSummary.withCitations}，厂商自述 ${sourceSummary.authoritySummary?.manufacturerClaims.answers ?? 0} 条回答，低权威 ${sourceSummary.authoritySummary?.lowAuthority.answers ?? 0}/${sourceSummary.withCitations}。认证库、经销商、目录和行业媒体是第三方证据；厂商官网是自述；博客和转售站是低权威来源。`),
        ...((sourceSummary.authoritySummary?.lowAuthority.answerPercent || 0) > 20 ? [paragraph('本轮低权威来源占比较高，不要把“被引用”当成“被验证”。')] : []),
        ...((sourceSummary.authoritySummary?.lowAuthority.topHosts || []).length ? [paragraph(`低权威域名：${sourceSummary.authoritySummary.lowAuthority.topHosts.map(item => `${item.host}（${item.count}条 / ${item.answers}回答）`).join('、')}。`)] : []),
        table(['权威类型', '引用条数', '回答数', '覆盖率', '唯一域名', '第一方', '第三方'], sourceSummary.byAuthority.map(item => [item.label, String(item.citations), String(item.answers), `${item.answerPercent}%`, String(item.uniqueHosts), String(item.firstPartyCitations), String(item.thirdPartyCitations)]), [2, 1, 1, 1, 1, 1, 1])
      ] : []),
      paragraph(`建议：${sourceSummary.advice}`),
      ...((sourceSummary.absent?.topHosts || []).length ? [paragraph(`DEGSON 缺席时主要引用：${sourceSummary.absent.topHosts.slice(0, 8).map(item => `${item.host}（${item.kindLabel}，${item.count}）`).join('、')}。`)] : [])
    ] : []),
    paragraph('Degson 提及率（仅以成功且提及任意品牌的回答为分母，调用失败不计入）', 'Heading2'),
    table(
      ['模型', '提及率'],
      summary.rates.map(item => [item.label, `${item.hits} / ${item.denom}（${share(item.hits, item.denom)}）`])
    ),
    paragraph('首次提及顺位（仅列出提到 Degson 的问题）', 'Heading2'),
    summary.rows.length
      ? table(
        ['问题', ...summary.models.map(model => model.label), '结果'],
        summary.rows.map(row => {
          const named = summary.models.filter(model => /第 \d+ 位/.test(row.cells[model.id]));
          const first = summary.models.some(model => row.cells[model.id].startsWith('第 1 位'));
          return [row.text, ...summary.models.map(model => row.cells[model.id]), `${named.map(model => model.label).join('、')} 提及；${first ? '出现在第 1 位' : '未在首次出现'}`];
        }),
        [5, ...summary.models.map(() => 2), 3]
      )
      : paragraph('本轮没有模型提到 Degson。')
  ];
  parts.push(paragraph('各品牌提及率', 'Heading1'));
  parts.push(paragraph('仅统计成功回答；同一条回答多次提及同一品牌只计 1 次。'));
  parts.push(table(['品牌', '提及条数', '提及率'], stats.brandRows.map(row => [row.name, `${row.total} / ${stats.ok}`, share(row.total, stats.ok)]), [5, 2, 2]));
  parts.push(paragraph('各品牌首次提及及排名', 'Heading1'));
  parts.push(paragraph('按提及总次数排序，只显示前 12 位；各模型分别计算。'));
  parts.push(table(
    ['品牌', ...summary.models.map(model => model.label), '合计', '综合提及率', '第 1 位', '前 3 位'],
    stats.brandRows.slice(0, 12).map(row => [row.name, ...summary.models.map(model => `${row.byModel[model.id]} / ${stats.validByModel[model.id]}`), `${row.total} / ${stats.ok}`, share(row.total, stats.ok), `${row.top1} 次（${share(row.top1, stats.ok)}）`, `${row.top3} 次（${share(row.top3, stats.ok)}）`]),
    [3, ...summary.models.map(() => 2), 2, 2, 2, 2]
  ));
  const excludedQuestions = (run.results || []).filter(r => r.status === 'ok' && !isBrandAnswer(r));
  if (excludedQuestions.length) {
    parts.push(paragraph('不计入品牌提及率的回答', 'Heading1'));
    parts.push(paragraph('以下成功回答未提及任何品牌，按模型分别排除；原始回答保留。'));
    for (const [index, result] of excludedQuestions.entries()) parts.push(paragraph(`${index + 1}. ${(run.questions || []).find(q => q.id === result.questionId)?.text || result.questionId}（${(run.models || []).find(m => m.id === result.modelId)?.label || result.modelId} · 未提及任何品牌）`));
  }
  parts.push(paragraph('模型原始回答', 'Heading1'));
  parts.push(paragraph('每题先列出各模型提及的品牌及顺位，再列出完整回答。'));
  const questionIds = [...new Set((run.results || []).map(item => item.questionId))];
  for (const [index, questionId] of questionIds.entries()) {
    const question = questions.find(item => item.id === questionId);
    const title = question?.text || questionId;
    parts.push(paragraph(`${index + 1}. ${title}`, 'Heading2'));
    const group = (run.results || []).filter(item => item.questionId === questionId);
    for (const result of group) {
      const model = (run.models || []).find(item => item.id === result.modelId);
      const label = model?.label || result.modelId;
      if (result.status === 'ok') {
        parts.push(paragraph(`${label} 回答`, 'Heading3'));
        parts.push(paragraph(result.reusedFromRunId ? `沿用旧回复：${result.reusedFromRunId}` : ((result.mentions || []).length ? (result.mentions || []).map(item => `${item.rank}. ${item.brandName || item.brandId}`).join('  ·  ') : '未抽到品牌')));
        parts.push(paragraph(result.answer || ''));
        const sources = result.sources || result.degsonSources || [];
        if (sources.length) {
          parts.push(paragraph(`引用来源：${sources.slice(0, 10).map(item => `${item.kindLabel}｜${item.title || item.host}｜${item.url}`).join('；')}${sources.length > 10 ? `；等 ${sources.length} 条` : ''}`));
        }
      } else {
        parts.push(paragraph(`${label} 调用失败：${result.error || '未知错误'}`));
      }
    }
  }
  parts.push('<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850"/></w:sectPr>');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join('')}</w:body></w:document>`;
}

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
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="100"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:eastAsia="Microsoft YaHei"/><w:color w:val="243042"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="230"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="130"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="230" w:after="110"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="170" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
</w:styles>`;

function buildRunDocx(run) {
  return zipStore([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: RELS },
    { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/document.xml', data: documentXml(run) }
  ]);
}

module.exports = { buildRunDocx, paragraph, table, xml };
