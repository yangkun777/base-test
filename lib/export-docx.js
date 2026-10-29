const { zipStore } = require('./zip-store');

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

function cell(text, header = false) {
  const fill = header ? '<w:tcPr><w:shd w:val="clear" w:fill="E6E9EE"/></w:tcPr>' : '<w:tcPr></w:tcPr>';
  const runPr = header ? '<w:rPr><w:b/></w:rPr>' : '';
  return `<w:tc>${fill}<w:p><w:r>${runPr}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p></w:tc>`;
}

function table(headers, rows) {
  const grid = headers.map(() => '<w:gridCol w:w="1800"/>').join('');
  const head = `<w:tr>${headers.map(h => cell(h, true)).join('')}</w:tr>`;
  const body = rows.map(row => `<w:tr>${row.map(value => cell(value)).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>
    <w:top w:val="single" w:sz="4" w:color="C0C8D4"/>
    <w:left w:val="single" w:sz="4" w:color="C0C8D4"/>
    <w:bottom w:val="single" w:sz="4" w:color="C0C8D4"/>
    <w:right w:val="single" w:sz="4" w:color="C0C8D4"/>
    <w:insideH w:val="single" w:sz="4" w:color="C0C8D4"/>
    <w:insideV w:val="single" w:sz="4" w:color="C0C8D4"/>
  </w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${head}${body}</w:tbl>`;
}

function share(total, grand) {
  if (!grand) return '0.0%';
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
  const rows = [];
  for (const questionId of ids) {
    const text = (run.questions || []).find(item => item.id === questionId)?.text || questionId;
    const cells = {};
    let any = false;
    for (const model of models) {
      const result = (run.results || []).find(item => item.questionId === questionId && item.modelId === model.id);
      const mentions = result?.status === 'ok' ? result.mentions || [] : [];
      const mention = mentions.find(isDegsonMention);
      if (mention) {
        hits[model.id] += 1;
        any = true;
      }
      const before = mention
        ? mentions.filter(item => item.rank < mention.rank).sort((a, b) => a.rank - b.rank).map(item => item.brandName || item.brandId)
        : [];
      cells[model.id] = !result || result.status !== 'ok'
        ? '调用失败'
        : mention
          ? (before.length ? `第 ${mention.rank} 位（${before.join('、')} 之后）` : `第 ${mention.rank} 位`)
          : '未提及';
    }
    if (any) rows.push({ text, cells });
  }
  const rates = models.map(model => ({
    label: model.label,
    hits: hits[model.id] || 0,
    denom: questionCount
  }));
  return { questionCount, models, rates, rows };
}

function documentXml(run) {
  const created = new Date(run.createdAt).toLocaleString('zh-CN', { hour12: false });
  const models = (run.models || []).map(item => `${item.label}（${item.model}）`).join('、') || '未记录';
  const questions = run.questions || [];
  const summary = summarize(run);
  const parts = [
    paragraph('Degson 海外 GEO 基线评测', 'Heading1'),
    paragraph(`评测时间：${created}`),
    paragraph(`记录编号：${run.id}`),
    paragraph(`模型：${models}`),
    paragraph(`问题数：${summary.questionCount}（同一问题、同一模型多次提及只计 1 次）`),
    paragraph('Degson 提及率', 'Heading2'),
    table(
      ['模型', '提及率'],
      summary.rates.map(item => [item.label, `${item.hits} / ${item.denom}（${share(item.hits, item.denom)}）`])
    ),
    paragraph('首次提及顺位（仅列出提到 Degson 的问题）', 'Heading2'),
    summary.rows.length
      ? table(
        ['问题', ...summary.models.map(model => model.label)],
        summary.rows.map(row => [row.text, ...summary.models.map(model => row.cells[model.id])])
      )
      : paragraph('本轮没有模型提到 Degson。')
  ];
  const questionIds = [...new Set((run.results || []).map(item => item.questionId))];
  for (const questionId of questionIds) {
    const question = questions.find(item => item.id === questionId);
    const title = question?.text || questionId;
    parts.push(paragraph(title, 'Heading2'));
    const group = (run.results || []).filter(item => item.questionId === questionId);
    for (const result of group) {
      const model = (run.models || []).find(item => item.id === result.modelId);
      const label = model?.label || result.modelId;
      if (result.status === 'ok') {
        parts.push(paragraph(`${label} 回答`, 'Heading3'));
        parts.push(paragraph(result.answer || ''));
      } else {
        parts.push(paragraph(`${label} 调用失败：${result.error || '未知错误'}`));
      }
    }
  }
  parts.push('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="851" w:right="851" w:bottom="851" w:left="851"/></w:sectPr>');
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
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
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

module.exports = { buildRunDocx };
