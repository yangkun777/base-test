# P0：基线测试代码层改造清单

> 交接对象：Codex  
> 项目：`D:\degson-geo-baseline`  
> 范围：只做基线分析的代码/数据口径。  
> **不改题目文本、不改提示词、不改模型、不重跑评测。**

---

## 0. 这次只做 4 件事

1. 增加 `answerMode`：推荐题/认证题/工程题/对比题/采购替代题分开统计
2. 增加 `module` / `priority` / `productFit`：不再用跨品类总分当 KPI
3. 增加 `sourceBrands` + 竞品来源地图：来源到底支持哪个品牌
4. 填 `config/source-targets.json`：让“目标页命中”真正可用

**不做 `channel` / Web Panel 导入。**  
基线测试全部走 API，当前不存在渠道混算；`channel` 等以后要把网页回答导入时再做。

---

## 1. 当前代码状态

先读这些文件，避免重复实现：

- `lib/citation-sources.js`
  - 已有 URL 规范化、去重、`uniqueUrlCount`
  - 已有 `count` / `answers` / `answerPercent` / `uniqueHosts`
  - 已有 `coverage`、`hostStats`、`targetLanding`
  - 已有 `test` / `redirect` 分类
  - `allSourcesForAnswer` 目前只把 DEGSON 的 `matches` 当 ranges
- `lib/source-targets.js`
  - 已有 `loadSourceTargets` / `buildTargetLanding`
  - 读取 `config/source-targets.json`
- `config/source-targets.json`
  - 当前是 `[]`
- `lib/analysis-stats.js`
  - 已把题目分类传给 `summarizeSources`
  - 已传 targets
- `lib/analysis-report.js`
  - `sourceBrief` 已带 `coverage` / `targetLanding` / `hostStats`
- `frontend/src/components/SourceAnalysis.vue`
  - 已有 KPI、回答覆盖、模型矩阵、Top 站点、目标页表、筛选
- `frontend/src/types.ts`
  - 已有 `SourceSummary` / `SourceKindRow` / `SourceHost` 等类型

---

## 2. P0-1：`answerMode`

### 目标

同一道题，模型可能给：

- 品牌名单（推荐）
- 认证/标准解释
- 工程选型方法
- 品牌对比
- 采购替代

来源链完全不同。必须分开统计。

### 新增文件

`lib/answer-mode.js`

```js
function classifyAnswerMode(questionText, answer, mentions) {
  // 返回 recommendation_list | certification | engineering_howto |
  // comparison | procurement_alternative | brand_query | none | other
}
```

### 分类规则

按顺序判断：

1. `mentions.length === 0` 或回答为 `NONE` → `none`
2. `How should / How do / How can / What should ... compare / How to choose / evaluation criteria` → `engineering_howto`
3. `recommend / top / best / shortlist / which suppliers / which brands / which manufacturers` → `recommendation_list`
4. `alternative / replace / substitute / second source` → `procurement_alternative`
5. `compare / comparison / vs / versus / difference` → `comparison`
6. `UL / TÜV / TUV / CE / RoHS / IEC / EN / certification / certified` → `certification`
7. 题目里出现具体品牌名 → `brand_query`
8. 其他 → `other`

注意顺序：  
`How should engineers compare...` 应该是 `engineering_howto`，不是 `comparison`。

### 接入

- `lib/engine.js` 的 `enrichRun`：
  - 对每个 `status === 'ok'` 的结果计算 `answerMode`
  - 写入 `result.answerMode`
  - 写入 `result.answerModeSource = 'rule'`
- 允许人工覆盖：
  - 如果 `result.answerModeOverride` 存在，用 override
  - `answerModeSource = 'manual'`
- 不需要改 `/api/ask` 的实时返回，`enrichRun` 会补。

### 统计

`lib/analysis-stats.js` 增加：

```ts
byAnswerMode: {
  [mode]: {
    questionCount,
    answerCount,
    brandAnswerCount,
    degsonMentions,
    degsonRate,
    sourceAnswers,
    targetHits
  }
}
```

并且：

- `degsonRate` 仍按品牌回答
- `sourceAnswers` 按有来源回答
- `targetHits` 来自 `sourceStats.targetLanding`

### UI

`SourceAnalysis.vue` 增加：

- `answerMode` 筛选
- “按回答模式”统计表：

| 模式 | 题数 | 回答 | 提到 DEGSON | 有来源 | 目标页命中 |
|---|---:|---:|---:|---:|---:|

不要和 `intent` 混在一起；`intent` 是问题意图，`answerMode` 是回答形态。

### 测试

`test/source-analysis-contract.test.js` 增加：

- `How should engineers compare...` → `engineering_howto`
- `Which suppliers are recommended...` → `recommendation_list`
- `Which ... UL 4128 ...` → `certification`
- `alternatives to...` → `procurement_alternative`
- `NONE` → `none`

---

## 3. P0-2：`module` / `priority` / `productFit`

### 目标

不再用 50 题跨品类总分判断优化效果。

### 配置方式

不要改 `config/questions.json` 的 id/text。  
新增 `config/question-metadata.json`，按 id 覆盖：

```json
{
  "q22": {
    "module": "EV",
    "questionType": "certification",
    "priority": 1,
    "productFit": "consumer"
  },
  "q52": {
    "module": "EV",
    "questionType": "certification",
    "priority": 1,
    "productFit": "oem_connector"
  },
  "q4": {
    "module": "storage",
    "questionType": "certification",
    "priority": 1,
    "productFit": "oem_connector"
  }
}
```

字段：

```ts
module: 'EV' | 'storage' | 'terminal' | 'ebike' | 'circular' | 'railway' | 'other'
questionType: 'recommendation' | 'certification' | 'comparison' | 'engineering' | 'procurement'
priority: 1 | 2 | 3
productFit: 'oem_connector' | 'consumer' | 'generic'
```

### 加载

新增 `lib/question-meta.js`：

```js
loadQuestionMetadata()
mergeQuestionMetadata(questions)
```

- `getQuestions()` 返回的题目合并 metadata
- 没有 metadata 的题目给默认值：
  - `module` 从 `ruleClassify(question).category` 映射
  - `questionType` 从 `ruleClassify(question).intent` 映射
  - `priority`：EV/storage/terminal = 1，ebike = 2，其他 = 3
  - `productFit` 默认 `generic`

### 统计

`analysis-stats.js` 增加：

```ts
byModule: {
  [module]: {
    questionCount,
    brandAnswerCount,
    degsonMentions,
    degsonRate,
    sourceAnswers,
    competitorAnswers,
    directoryAnswers,
    targetHits
  }
}
```

并给报告一个加权分：

```ts
moduleScore = weightedAverage(
  { EV: 0.35, storage: 0.25, terminal: 0.25, ebike: 0.15 },
  moduleRates
)
```

注意：

- 加权分只用于内部优先级，不是市场占有率
- 圆形/铁路/其他不进入加权分
- 仍然保留各 module 原始分母

### UI

- `App.vue` 的题库/结果可以显示 module 标签
- `SourceAnalysis.vue` 增加 module tabs
- 报告首屏按 module 出表，不突出总分

### 测试

- metadata 合并不会改 question id/text
- `byModule` 各 module 分母正确
- 加权分只使用已配置权重的 module

---

## 4. P0-3：`sourceBrands` + 竞品来源地图

### 目标

现在每个 source 只有 `degsonRelated`。  
需要知道：

- 这个页面支持 DEGSON，还是 Higo/Julet/Phoenix？
- 竞品缺席时，模型引的是哪个竞品的哪一页？

### 修改 `allSourcesForAnswer`

当前：

```js
const ranges = (matches || []).filter(match => match.brandId === 'degson');
```

改成：

```js
const ranges = matches || [];
```

然后对每个 link / citation：

- 找同一行/同一 segment 内命中的品牌
- 生成：

```ts
brands: Array<{
  brandId: string;
  brandName: string;
  relation: 'mentions' | 'supports';
}>
```

规则：

- 文本链接：按同一行匹配品牌 ranges
- citation：按 `segment` / start-end 匹配品牌
- retrieval：没有正文位置，`brands: []`
- `degsonRelated` 改为：

```js
source.brands.some(b => b.brandId === 'degson')
```

- 保留旧字段 `degsonSources` 的过滤逻辑

### 数据结构

`SourceItem` 增加：

```ts
brands: SourceBrand[];
```

`SourceSummary` 增加：

```ts
sourceBrands: Array<{
  brandId, brandName,
  citations, answers, questions,
  hosts: string[],
  models: string[]
}>;

competitorSourceMap: Array<{
  brandId, brandName,
  host, kindLabel,
  citations, answers, questions,
  models: string[]
}>;
```

### 聚合

在 `summarizeSources` 里：

- 遍历 `allItems`
- 对每个 `source.brands`：
  - `citations++`
  - `answers` 按 `questionId:modelId` 去重
  - `questions` 按 questionId 去重
  - `hosts` 去重
  - `models` 去重
- `competitorSourceMap` 只保留非 DEGSON 品牌

### UI

`SourceAnalysis.vue` 增加：

- “品牌来源”表：

| 品牌 | Host | 类型 | 引用数 | 回答数 | 问题数 | 模型 |
|---|---|---|---:|---:|---:|---|

- 筛选：
  - 只看 DEGSON
  - 只看竞品
  - 按 module/answerMode 过滤

### 测试

- 一行里有 Higo + Julet + DEGSON，source.brands 三个都有
- 只有 Higo 的页面不会标成 DEGSON 相关
- `competitorSourceMap` 能统计 Higo/Julet/Phoenix
- `degsonRelated` 仍只对 DEGSON 为 true

---

## 5. P0-4：填 `config/source-targets.json`

### 现状

`config/source-targets.json` 是：

```json
[]
```

`targetLanding` 代码已经能用，只是没有配置。

### 需要补的字段

`lib/source-targets.js` 目前只返回 `id/label/questions/citations/answers/models/hitUrls/missingQuestions`。  
增加透传：

```ts
type TargetType =
  | 'official_product'
  | 'official_content'
  | 'directory'
  | 'distributor'
  | 'media'
  | 'cert_db';

interface TargetConfig {
  id: string;
  label: string;
  module: string;
  priority: 1 | 2 | 3;
  type: TargetType;
  questions?: string[];
  urls?: string[];
  hosts?: string[];
}
```

`buildTargetLanding` 返回时带上：

```ts
module, priority, type
```

### 初始配置

用现有真实 URL，不要写不存在的页面：

```json
[
  {
    "id": "ev-type2-content",
    "label": "EV Type 2 内容页",
    "module": "EV",
    "priority": 1,
    "type": "official_content",
    "questions": ["q22", "q52", "q96", "q97", "q118", "q168"],
    "urls": ["https://www.degson.com/content/details_472_5319421.html"]
  },
  {
    "id": "storage-typelist",
    "label": "储能 typelist20",
    "module": "storage",
    "priority": 1,
    "type": "official_product",
    "questions": ["q7", "q41", "q42", "q49", "q51"],
    "urls": ["https://www.degson.com/product/typelist20_4438063.html"]
  },
  {
    "id": "storage-article",
    "label": "储能 UL/TÜV 文章",
    "module": "storage",
    "priority": 1,
    "type": "official_content",
    "questions": ["q4", "q41", "q51"],
    "urls": ["https://www.degson.com/content/details_472_5319452.html"]
  },
  {
    "id": "terminal-viox",
    "label": "端子台 viox 榜单",
    "module": "terminal",
    "priority": 1,
    "type": "directory",
    "questions": ["q69", "q102", "q115"],
    "hosts": ["viox.com"]
  },
  {
    "id": "terminal-directindustry",
    "label": "端子台 directindustry",
    "module": "terminal",
    "priority": 1,
    "type": "directory",
    "questions": ["q163"],
    "hosts": ["directindustry.com"]
  },
  {
    "id": "ebike-content",
    "label": "电自连接器内容页",
    "module": "ebike",
    "priority": 2,
    "type": "official_content",
    "questions": ["q60", "q144"],
    "urls": [
      "https://www.degson.com/content/details_472_5319509.html",
      "https://www.degson.com/content/details_472_5319430.html"
    ]
  }
]
```

### UI/报告

- `SourceAnalysis.vue` 已目标页表，确认显示：
  - label
  - module
  - type
  - 命中回答
  - 命中引用
  - 模型
  - 未命中问题
- `analysis-report.js` 的 `sourceBrief` 已带 `targetLanding`
- `export-report-docx.js` 已有目标页表
- 需要补：
  - 按 module 汇总目标页命中
  - 未配置时显示“未配置目标页”，不要报错

### 测试

- 配置一个已存在的 URL，能命中
- `viox.com` 能命中 4 个回答 / 6 条引用
- `directindustry.com` 能命中 1 个回答 / 7 条引用
- 空配置不报错
- host 边界正确：`viox.com` 不匹配 `notviox.com`

---

## 6. 数据契约

```ts
interface QuestionMeta {
  module: string;
  questionType: string;
  priority: 1 | 2 | 3;
  productFit: 'oem_connector' | 'consumer' | 'generic';
}

interface ResultItem {
  answerMode?: AnswerMode;
  answerModeSource?: 'rule' | 'manual';
  answerModeOverride?: AnswerMode;
}

interface SourceBrand {
  brandId: string;
  brandName: string;
  relation: 'mentions' | 'supports';
}

interface SourceSummary {
  // 已有字段保留
  byAnswerMode: Record<string, {
    questionCount: number;
    answerCount: number;
    brandAnswerCount: number;
    degsonMentions: number;
    degsonRate: number;
    sourceAnswers: number;
    targetHits: number;
  }>;
  byModule: Record<string, {
    questionCount: number;
    brandAnswerCount: number;
    degsonMentions: number;
    degsonRate: number;
    sourceAnswers: number;
    competitorAnswers: number;
    directoryAnswers: number;
    targetHits: number;
  }>;
  moduleScore: number;
  sourceBrands: Array<{
    brandId: string;
    brandName: string;
    citations: number;
    answers: number;
    questions: number;
    hosts: string[];
    models: string[];
  }>;
  competitorSourceMap: Array<{
    brandId: string;
    brandName: string;
    host: string;
    kindLabel: string;
    citations: number;
    answers: number;
    questions: number;
    models: string[];
  }>;
  targetLanding: Array<{
    id: string;
    label: string;
    module: string;
    priority: number;
    type: string;
    questions: string[];
    citations: number;
    answers: number;
    models: string[];
    hitUrls: string[];
    missingQuestions: string[];
  }>;
}
```

---

## 7. 报告与 UI

### UI

`SourceAnalysis.vue` 增加：

1. `answerMode` 筛选
2. `module` tabs
3. 品牌来源表
4. 竞品来源地图
5. 目标页表增加 `module/type`
6. 模型矩阵保留

### 报告

`analysis-report.js`：

- `sourceBrief` 增加 `byAnswerMode`、`byModule`、`moduleScore`、`sourceBrands`、`competitorSourceMap`
- `SUMMARY_INSTRUCTIONS` 明确：
  - 先看 module
  - 再看 answerMode
  - 不要用跨品类总分
  - `sourceBrands` 是来源支持关系，不是 citation 数

### Word

`export-report-docx.js`：

- 目标页表加 `module/type`
- 增加 `byModule` 表
- 增加 `answerMode` 表
- 增加 `sourceBrands` Top 10
- 增加 `competitorSourceMap` Top 10

---

## 8. 测试清单

### 单元测试

- `classifyAnswerMode` 5 种模式
- `sourceBrands` 多品牌同一行/segment
- `degsonRelated` 不被竞品页误判
- `competitorSourceMap` 聚合
- `targetLanding` URL/host 边界
- `byModule` 分母
- `moduleScore` 只使用配置权重
- metadata 合并不改 id/text

### 回归

```bash
node --test
cd frontend
npm run type-check
npm run build
```

### 手工验证

用 `run-20261102092441042-2f90ba`：

- `sourceSummary.byModule` 有 EV/储能/端子台/电自
- `sourceSummary.byAnswerMode` 有 recommendation/certification/engineering
- `sourceSummary.sourceBrands` 有 DEGSON/Higo/Julet/Phoenix
- `targetLanding` 不再为空
- `viox.com` 命中 4 个回答
- `directindustry.com` 命中 1 个回答
- `degson.com` 只对应 GPT 的官网来源

---

## 9. 验收标准

- [ ] 每个结果有 `answerMode`
- [ ] 每道题有 `module/priority/productFit`
- [ ] 报告首屏按 module 展示，不再用跨品类总分
- [ ] 每个 source 有 `brands`
- [ ] `competitorSourceMap` 能看竞品来源
- [ ] `source-targets.json` 非空
- [ ] 目标页表显示 module/type/命中/未命中
- [ ] `byAnswerMode` 可用
- [ ] 测试全绿、type-check/build 通过
- [ ] 不重跑模型也能在现有 run 上看到新维度

---

## 10. 不要做的事

- 不要加 `channel` / Web Panel（这一轮不做）
- 不要改题目 id/text
- 不要改提示词
- 不要重跑 50 题
- 不要把 `sourceBrands` 的关系当成独立验证
- 不要用 source count 代替 answer coverage
- 不要在没有 target 配置时伪造命中

---

## 11. 交付顺序

1. `answerMode` + 测试
2. `question-metadata.json` + `byModule`
3. `sourceBrands` + `competitorSourceMap`
4. `source-targets.json` + target type/module
5. UI/报告/Word
6. 跑测试、type-check、build
7. 用现有 run 验证，不重跑评测
