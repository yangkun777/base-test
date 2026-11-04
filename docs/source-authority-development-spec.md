# 来源权威性（sourceAuthority）开发方案

> 交接对象：其他开发模型 / Codex  
> 项目：`D:\degson-geo-baseline`  
> 范围：只改“来源分析”的数据模型、统计、UI、报告。  
> 不改题目、提示词、模型、评测流程，不重跑模型。

---

## 0. 背景：为什么现在要加 sourceAuthority

最近用网页 GPT、Gemini 3.8 Flash、Gemini 3.1 Pro 跑了同一批问题，发现一个关键问题：

> **“被引用”不等于“被权威来源引用”。**

### 例子 1：弹簧笼端子题

- GPT 网页：WAGO / Phoenix / Weidmüller / ABB / Schneider，来源基本是厂商官网。
- Gemini 3.8 Flash：WAGO / Phoenix / Weidmüller / ENTRELEC / Dinkle，来源是厂商官网 + Galco + Controls Drives & Automation。
- Gemini 3.1 Pro：WAGO / Phoenix / Weidmüller / ABB Entrelec / Dinkle，但来源是：
  - `zbotic.in`（博客/店铺）
  - `rspsupply.com`（经销商）
  - `xbrele.com`（低权威站）
  - `entrelecsales.com`（经销商）
  - `dinkle.com`（厂商新闻页）

三个模型都没提 DEGSON。  
但更重要的是：**3.1 Pro 引用的页面质量明显低于 3.8 Flash。**

### 例子 2：储能题

- GPT 网页：DEGSON 第 1，来源是 DEGSON 官网产品页 + UL Product iQ / TÜV Certipedia。
- Gemini 3.8：DEGSON 第 3，来源是 `degson.com/index.php?a=downloadProPDF&id=5171358`。
- Gemini 3.1 Pro：DEGSON 第 4，来源是 `wittig-electronic.de` 经销商页。

同一个品牌，来源权威性完全不同：

- 认证库/官网产品页
- PDF 下载接口
- 经销商新闻页

如果只统计“有没有引用”，会把它们当成同一类证据。  
这会导致报告误判：

- “3.1 Pro 也引用了 DEGSON，所以没问题”
- 实际上它引的是低权威页面，不能证明产品/认证能力。

### 例子 3：EV 题

- 3.8 Flash / GPT 网页：DEGSON 不在前 5。
- Gemini 3.1 Pro：DEGSON 第 1，来源是 DEGSON 内容页 `details_472_5331812`。

同一个问题，不同模型/不同检索结果不同。  
所以来源分析必须记录：

1. 被谁引用
2. 引用的是什么类型的页面
3. 这个页面是不是权威来源

---

## 1. 目标

在现有 `kind`（官网/分销商/媒体/竞品…）之外，增加一层：

```ts
sourceAuthority
```

用于回答：

- 这条引用是厂商官网、认证机构、经销商、目录、媒体，还是博客/转售站？
- 被引用的是“可核验证据”，还是“低权威内容”？
- DEGSON 被引用时，权威来源占多少？
- 竞品被引用时，权威来源占多少？
- 哪些低权威来源在污染统计？

---

## 2. 非目标

- 不做“权威性评分”单一总分。
- 不自动判断内容真假。
- 不调用模型做分类。
- 不修改现有 `kind` 分类。
- 不改基线题目/提示词/评测流程。
- 不重跑模型；只对已有 source 重新 enrich。

---

## 3. 数据模型

### 3.1 新增枚举

```ts
type SourceAuthority =
  | 'manufacturer'
  | 'certification_body'
  | 'distributor'
  | 'directory'
  | 'trade_media'
  | 'blog_or_reseller'
  | 'unknown';

type SourceOwnership =
  | 'first_party'
  | 'third_party'
  | 'unknown';
```

说明：

- `manufacturer`：厂商官网（包括 DEGSON 和竞品官网）。
- `certification_body`：UL Product iQ、TÜV Certipedia、VDE、IEC 等标准/认证机构。
- `distributor`：DigiKey、Mouser、RS、Galco、Necto、Wittig 等。
- `directory`：viox、directindustry、thomasnet 等目录/榜单。
- `trade_media`：Connector Supplier、Charged EVs、Design World、ebikegaragehq 等媒体。
- `blog_or_reseller`：博客、内容站、小型转售商、低权威站。
- `unknown`：无法判断、测试站、未解析、社交等。

`SourceOwnership` 用来区分：

- `degson.com` → `manufacturer` + `first_party`
- `wago.com` → `manufacturer` + `third_party`
- `productiq.ul.com` → `certification_body` + `third_party`
- `viox.com` → `directory` + `third_party`
- `zbotic.in` → `blog_or_reseller` + `third_party`

**不要把 `manufacturer` 等同于“独立”。**  
DEGSON 官网是厂商自述；WAGO 官网也是厂商自述。  
它们对“自己产品”的权威性高，但不是独立第三方验证。

### 3.2 SourceItem 扩展

```ts
interface SourceItem {
  // 现有字段保留
  kind: string;
  kindLabel: string;
  authority: SourceAuthority;
  authorityLabel: string;
  ownership: SourceOwnership;
  authoritySource?: 'rule' | 'manual';
}
```

### 3.3 SourceSummary 扩展

```ts
interface AuthorityRow {
  id: SourceAuthority;
  label: string;
  citations: number;
  answers: number;
  answerPercent: number;
  uniqueHosts: number;
  firstPartyCitations: number;
  thirdPartyCitations: number;
}

interface SourceSummary {
  byAuthority: AuthorityRow[];

  authoritySummary: {
    authoritativeThirdParty: {
      citations: number;
      answers: number;
      answerPercent: number;
    };
    manufacturerClaims: {
      citations: number;
      answers: number;
    };
    lowAuthority: {
      citations: number;
      answers: number;
      answerPercent: number;
      topHosts: Array<{ host: string; count: number; answers: number }>;
    };
  };

  models: Array<{
    // 现有字段保留
    byAuthority: AuthorityRow[];
  }>;

  degson: {
    // 现有字段保留
    byAuthority: AuthorityRow[];
  };

  absent: {
    // 现有字段保留
    byAuthority: AuthorityRow[];
  };
}
```

---

## 4. 分类规则

### 4.1 先按 `kind` 映射默认值

| kind | 默认 authority |
|---|---|
| `official` | `manufacturer` |
| `certification` | `certification_body` |
| `distributor` | `distributor` |
| `directory` | `directory` |
| `media` | `trade_media` |
| `competitor` | `manufacturer` |
| `marketplace` | `distributor` |
| `local` | `distributor` |
| `research` | `trade_media` |
| `social` | `unknown` |
| `test` | `unknown` |
| `redirect` | `unknown` |
| `other` | `unknown` |

### 4.2 再按域名覆盖

新增 `config/source-authority.json`：

```json
{
  "manufacturer": [
    "degson.com",
    "degson.com.cn",
    "phoenixcontact.com",
    "wago.com",
    "weidmuller.com",
    "te.com",
    "amphenol.com",
    "higo.com",
    "julet.com",
    "dinkle.com",
    "wernerwirth.com"
  ],
  "certification_body": [
    "productiq.ul.com",
    "ul.com",
    "certipedia.com",
    "tuv.com",
    "vde.com",
    "iec.ch"
  ],
  "distributor": [
    "nectogroup.com",
    "wittig-electronic.de",
    "digikey.com",
    "mouser.com",
    "rs-online.com",
    "galco.com",
    "rspsupply.com",
    "entrelecsales.com",
    "activecomponents.com",
    "tme.eu",
    "dacpol.eu"
  ],
  "directory": [
    "viox.com",
    "directindustry.com",
    "thomasnet.com",
    "goldsupplier.com"
  ],
  "trade_media": [
    "connectorsupplier.com",
    "chargedevs.com",
    "designworldonline.com",
    "automation.com",
    "ebikegaragehq.com",
    "controlsdrivesautomation.com"
  ],
  "blog_or_reseller": [
    "zbotic.in",
    "xbrele.com"
  ]
}
```

要求：

- 域名匹配支持子域：`host === domain` 或 `host.endsWith('.' + domain)`
- 配置优先于 kind 默认值
- 未命中配置的 `other` 默认 `unknown`
- 不要把“所有 media 都当权威”；媒体也要按域名配置

### 4.3 ownership

```ts
if (host === 'degson.com' || host === 'degson.com.cn') {
  ownership = 'first_party';
} else if (authority === 'unknown') {
  ownership = 'unknown';
} else {
  ownership = 'third_party';
}
```

`wwwtest.degson.com`：

- authority = `unknown`
- ownership = `unknown`
- 不归入官网

### 4.4 人工覆盖

允许在 `source` 上保存：

```ts
authorityOverride?: SourceAuthority;
ownershipOverride?: SourceOwnership;
```

优先使用 override。  
用于：

- 新出现的媒体/博客
- 误分类域名
- 认证库子域

---

## 5. 聚合逻辑

在 `summarizeSources` 中，对每个 source 增加：

```js
const authority = source.authorityOverride || classifySourceAuthority(source);
```

聚合维度：

1. `byAuthority`
   - citations
   - answers（按 `questionId:modelId` 去重）
   - answerPercent（answers / withCitations）
   - uniqueHosts
   - firstPartyCitations
   - thirdPartyCitations

2. `models[].byAuthority`
   - GPT / Gemini 各自的权威结构

3. `degson.byAuthority`
   - DEGSON 相关来源的权威结构

4. `absent.byAuthority`
   - DEGSON 缺席时的权威结构

5. `authoritySummary`
   - `authoritativeThirdParty` = certification_body + distributor + directory + trade_media
   - `manufacturerClaims` = manufacturer
   - `lowAuthority` = blog_or_reseller
   - `unknown`

注意：

- `authoritativeThirdParty` 不包含 `manufacturer`，因为厂商官网是自述，不是独立验证。
- `manufacturer` 单独统计，用于看“模型是否只依赖厂商自述”。
- `blog_or_reseller` 单独统计，用于警告低权威来源。

---

## 6. UI 改动

### 6.1 来源卡片新增“来源权威性”表

列：

| 权威类型 | 引用条数 | 回答数 | 覆盖率 | 唯一域名 | 第一方 | 第三方 |
|---|---:|---:|---:|---:|---:|---:|

顺序：

1. certification_body
2. distributor
3. directory
4. trade_media
5. manufacturer
6. blog_or_reseller
7. unknown

颜色：

- certification_body / distributor / directory / trade_media：正常
- manufacturer：中性
- blog_or_reseller：警告色
- unknown：灰色

### 6.2 顶部 KPI 增加

- 权威第三方引用：`authoritativeThirdParty.answers / withCitations`
- 低权威引用：`lowAuthority.answers / withCitations`
- 厂商自述引用：`manufacturerClaims.answers`

不要只显示“官网 12.2%”。

### 6.3 筛选

`SourceAnalysis.vue` 增加：

- 按 authority 筛选
- 按 ownership 筛选
- “只看低权威”
- “只看认证库/经销商/目录”

### 6.4 模型矩阵

现有“模型 × 来源类型”旁边增加“模型 × 权威性”：

| 权威类型 | GPT 条数 | GPT 回答 | Gemini 条数 | Gemini 回答 |
|---|---:|---:|---:|---:|

用途：

- GPT 是否更依赖 manufacturer？
- Gemini 是否更依赖 directory/media？
- 3.1 Pro 的低权威来源是否更多？

### 6.5 警告

如果 `lowAuthority.answers / withCitations > 20%`，显示：

> 本轮低权威来源占比较高，不要把“被引用”当成“被验证”。

---

## 7. 报告/Word

### 7.1 `analysis-report.js`

`sourceBrief` 增加：

- `byAuthority`
- `authoritySummary`
- `models[].byAuthority`
- `degson.byAuthority`
- `absent.byAuthority`

`SUMMARY_INSTRUCTIONS` 增加：

> 引用条数不等于权威性。认证库/经销商/目录/行业媒体是第三方证据；厂商官网是自述；博客/转售站是低权威来源。报告必须区分。

### 7.2 `export-report-docx.js`

增加：

- 来源权威性表
- 权威第三方 / 厂商自述 / 低权威 三个汇总
- 低权威 Top 域名
- 模型 × 权威性表

### 7.3 `export-docx.js`

运行结果 Word 加：

- 权威性表
- 低权威警告
- 认证库/经销商/目录/媒体分类

---

## 8. 向后兼容

- 旧 run 没有 `authority` 字段：
  - `enrichRun` 重新计算 source，自动补 `authority`
  - 不修改原始记录
- 旧报告：
  - 不自动更新
  - 需要重新生成报告才会带新字段
- 前端：
  - `byAuthority` 可选，旧数据缺失时不报错
  - 显示“暂无权威性数据”

---

## 9. 测试

### 9.1 分类

```js
assert.equal(classifySourceAuthority({ host:'degson.com', kind:'official' }).authority, 'manufacturer');
assert.equal(classifySourceAuthority({ host:'degson.com', kind:'official' }).ownership, 'first_party');
assert.equal(classifySourceAuthority({ host:'wago.com', kind:'competitor' }).authority, 'manufacturer');
assert.equal(classifySourceAuthority({ host:'productiq.ul.com', kind:'certification' }).authority, 'certification_body');
assert.equal(classifySourceAuthority({ host:'viox.com', kind:'directory' }).authority, 'directory');
assert.equal(classifySourceAuthority({ host:'nectogroup.com', kind:'distributor' }).authority, 'distributor');
assert.equal(classifySourceAuthority({ host:'zbotic.in', kind:'other' }).authority, 'blog_or_reseller');
assert.equal(classifySourceAuthority({ host:'wwwtest.degson.com', kind:'test' }).authority, 'unknown');
```

### 9.2 聚合

- `byAuthority` 的 answers 按 `questionId:modelId` 去重
- `authoritativeThirdParty` 不含 manufacturer
- `lowAuthority` 只含 blog_or_reseller
- `models.gpt.byAuthority` / `models.gemini.byAuthority` 分母正确

### 9.3 回归

```bash
node --test
cd frontend
npm run type-check
npm run build
```

### 9.4 手工验证

用 `run-20261102092441042-2f90ba`：

- `degson.com` → manufacturer + first_party
- `wago.com` → manufacturer + third_party
- `viox.com` → directory
- `nectogroup.com` → distributor
- `productiq.ul.com` → certification_body
- `zbotic.in` → blog_or_reseller
- `byAuthority` 总数与 `allItems` 一致
- `models` 分模型权威结构可显示

---

## 10. 验收标准

- [ ] 每个 source 有 `authority` / `ownership`
- [ ] `byAuthority` 可按模型/品类/DEGSON/缺席拆分
- [ ] UI 有“来源权威性”表和筛选
- [ ] 报告/Word 有权威性表
- [ ] 低权威来源有警告
- [ ] 旧 run 可重新 enrich，不需要重跑模型
- [ ] 测试全绿、type-check/build 通过

---

## 11. 优先级

### P0

1. 新增 `lib/source-authority.js`
2. `config/source-authority.json` 域名配置
3. `citation-sources.js` 注入 `authority/ownership`
4. `summarizeSources` 增加 `byAuthority` 和 `authoritySummary`

### P1

5. `SourceAnalysis.vue` 权威性表/KPI/筛选
6. 报告/Word 同步
7. 模型 × 权威性矩阵

### P2

8. 低权威来源趋势
9. 人工覆盖 UI
10. 权威性 + 目标页联合分析

---

## 12. 不要做的事

- 不要做“单一权威分” 0–100；分层比打分更可靠。
- 不要把所有 manufacturer 都当独立第三方。
- 不要把所有 media 都当权威媒体。
- 不要让模型判断权威性；用域名规则 + 人工覆盖。
- 不要因为“有引用”就认为“有证据”。
- 不要用 3.1 Pro 的低权威引用证明 DEGSON 没问题。

---

## 13. 一句话

> **`kind` 说明页面是什么，`authority` 说明它值不值得信；`ownership` 说明它是谁说的。**  
> 三者分开，报告才不会把 WAGO 官网和 `zbotic.in` 当成同一类证据。
