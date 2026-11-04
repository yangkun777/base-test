# 来源分析统计与 UI 优化 Spec

> 交接对象：Codex  
> 项目：`D:\degson-geo-baseline`  
> 范围：只改“来源分析”部分，不动题目、模型、评测提示词和 GEO 结论。

---

## 0. 一句话目标

把来源分析从“能看”改成“准确、可解释、能下钻”：

1. **同一个页面不重复计数**
2. **引用条数不冒充回答数**
3. **分品类不再出现“未分类”**
4. **UI 能按条数/回答数切换，能看模型、品类、目标页**
5. **报告和 Word 与页面口径一致**

---

## 1. 背景与当前数据

当前基线轮次：

- run id：`run-20261102092441042-2f90ba`
- 文件：`data/runs/run-20261102092441042-2f90ba.json`
- 50 题，99 条成功回答，81 条品牌回答
- DEGSON 22/81 = 27.2%
- 来源统计当前约 373 条“来源出现次数”
- Gemini 150 条来源，GPT 223 条
- `wwwtest.degson.com` 1 条，已应归为“测试站”
- Gemini 有 12 条未解析 grounding 跳转

注意：

- **373 是来源出现次数，不是唯一 URL 数。**
- q52 的 `details_472_5319421.html` 同时出现带 `?utm_source=openai` 和不带的版本，当前会被计成两条。
- q7 还有尾部带反引号的 URL。
- 这些都会导致“来源条数”和“官网占比”偏高。

---

## 2. 当前代码状态（重要，避免重复改）

已经做了部分改动，Codex 先看 `git diff` 或直接读文件，不要重复实现：

### 已完成/部分完成

- `lib/citation-sources.js`
  - 新增 `test` 来源类型，`wwwtest.degson.com` 归为“测试站”
  - `cleanUrl` 已开始做规范化：去 UTM、反引号、尾斜杠、hash、`www`
  - `allSourcesForAnswer` 已加 `rawUrl` / `rawUrls`
  - `kindRows` 已支持 `answers`、`answerPercent`、`uniqueHosts`
  - `topHostsOf` 已支持 `answers`（按 `questionId:modelId` 去重）
  - `summarizeSources` 已加：
    - `uniqueUrlCount`
    - `uniqueHostCount`
    - `originCounts`
    - `thirdPartyCount` / `thirdPartyShare`
    - `officialCount` / `officialShare`
    - `competitorCount` / `competitorShare`
    - `socialCount` / `socialShare`
    - `testCount` / `redirectCount`
    - `absent.brandAnswers` / `absent.noBrandAnswers`
  - 每个 kind 的 `answers` / `answerPercent` / `uniqueHosts` 已加
  - `models` 已加 `categories` / `topHosts` / `degson`
  - `kindRows` 已改为只返回 `count > 0`，不再显示 0.0% 的空行
- `lib/engine.js`
  - `enrichRun` 已把 `ruleClassify(question).category` 传给 `summarizeSources`，修复运行页“未分类”问题
- `frontend/src/types.ts`
  - 已加部分字段：`uniqueUrlCount`、`uniqueHostCount`、`thirdPartyShare`、`officialShare`、`competitorShare`、`socialShare`、`testCount`、`redirectCount`、`SourceKindRow.answers` 等
- `test/citation-sources.test.js`
  - 已加 URL 规范化、去重、per-model、test 域名、unique 计数相关断言

### 还没完成

- `frontend/src/App.vue` 来源卡片还是旧版 KPI/柱状图，没有：
  - 唯一来源
  - 第三方占比
  - 条数/回答数切换
  - 测试站/未解析警告
  - 模型来源矩阵
- `frontend/src/components/AnalysisReport.vue` 来源 box 还是旧版
- `lib/analysis-report.js` 的 `sourceBrief` 还没完整带上新字段
- `lib/export-report-docx.js` / `lib/export-docx.js` 的来源表还没有“回答数/唯一来源/第三方占比”
- `test` 全量测试、`type-check`、`build` 还没最终跑完
- 3100 服务需要重启验证

---

## 3. P0：数据准确性

### 3.1 URL 规范化与去重

`cleanUrl` 必须做到：

- 去 `utm_*`、`gclid`、`fbclid`、`mc_*`、`_hsenc`、`_hsmi`、`mkt_tok`
- 去 hash
- 去尾部反引号、引号、`)`、`.`、`,`、`;`
- 统一 `www` / 非 `www`
- 去掉非根路径的尾斜杠
- 保留有意义的 query，例如 `?lang=en`、产品 id
- 返回 canonical URL

每个 source item 保留：

```js
{
  url,          // canonical
  rawUrl,       // 原始 URL
  rawUrls,      // 同一 canonical 下出现过的原始 URL
  host,
  kind,
  kindLabel,
  origins: ['text' | 'citation' | 'retrieval'],
  ...
}
```

验收：

- q52 的带/不带 `utm_source=openai` 只算 1 条
- q7 的尾部反引号 URL 只算 1 条
- 同一回答里同一 canonical URL 只出现 1 次
- `uniqueUrlCount <= allCitationCount`
- `uniqueHostCount <= uniqueUrlCount`
- 不误删 `?lang`、`?id` 这类参数

### 3.2 引用条数 vs 回答数

每个来源类型必须同时有：

```ts
{
  id, label,
  count,          // 引用条数
  percent,        // count / 全部引用条数
  answers,        // 至少引用过该类来源的回答数
  answerPercent,  // answers / 有来源回答数
  uniqueHosts     // 该类来源涉及多少域名
}
```

`answers` 要按 `questionId:modelId` 去重，不能用条数。

`topHosts` 也要同时给：

```ts
{ host, kind, kindLabel, count, answers }
```

验收：

- 一条回答里放 4 个同站链接，`count=4`，`answers=1`
- UI 必须能切换“按引用条数 / 按回答数”
- 不允许用 `count` 直接冒充“回答覆盖率”

### 3.3 分品类来源

`enrichRun` 必须传入题目分类：

```js
const { ruleClassify } = require('./question-taxonomy');
const sourceQuestions = (run.questions || []).map(q => ({
  id: q.id,
  category: q.category || ruleClassify(q).category
}));
const sourceSummary = summarizeSources(results, sourceQuestions);
```

验收：

- 运行页“分品类来源”不再出现“未分类 310/50”
- `byCategory` 至少包含 EV、储能、端子台、电动自行车、圆形、铁路等实际品类
- 每个 `byCategory` 行有 `answers`、`withCitations`、`citationCount`、`categories`、`topHosts`

### 3.4 DEGSON 缺席拆分

`absent` 必须区分：

```js
{
  answers,          // 所有没有提到 DEGSON 的回答
  brandAnswers,     // 有品牌但未提 DEGSON
  noBrandAnswers,   // 完全没提任何品牌
  withCitations,
  ...
}
```

UI 标签：

- “DEGSON 缺席（有品牌回答）”
- “无品牌回答（不计入品牌分母）”

不要把 NONE 回答和“有品牌但没 DEGSON”混在一起。

### 3.5 测试站、未解析引用、空行

- `test` 类型单独显示，不能算官网
- `redirect` 类型单独显示，不能混进媒体/目录
- `kindRows` 只返回 `count > 0` 的行
- UI 顶部显示：
  - `测试站 N 条`
  - `未解析引用 N 条`
- 不要显示 `官网 0.0%`、`分销商 0.0%`、`社媒 0.0%` 这种空柱

### 3.6 占比定义

在 summary 顶层增加：

```js
{
  uniqueUrlCount,
  uniqueHostCount,
  originCounts: { text, citation, retrieval },
  thirdPartyCount,
  thirdPartyShare,
  officialCount,
  officialShare,
  competitorCount,
  competitorShare,
  socialCount,
  socialShare,
  testCount,
  redirectCount
}
```

定义：

- `thirdParty` = distributor + certification + media + directory + research + local + marketplace
- `official` = official
- `competitor` = competitor
- `social` = social
- `redirect` 单独，不进 thirdParty
- `test` 单独，不进 official

---

## 4. P1：UI 优化（只改来源分析部分）

### 4.1 来源卡片顶部 KPI

改成 6 个 KPI，自适应网格：

1. **有来源回答**：`withCitations / answers`
2. **唯一来源**：`uniqueUrlCount`（小字：总引用 `allCitationCount` 条）
3. **第三方占比**：`thirdPartyShare%`
4. **竞品占比**：`competitorShare%`
5. **DEGSON 有引用**：`degson.sourced / degson.mentioned`
6. **异常**：`测试站 X · 未解析 Y`

如果 `testCount` 或 `redirectCount` 为 0，第 6 个显示“无异常”。

### 4.2 条数/回答数切换

在“整体来源结构”上方加分段按钮：

- `按引用条数`（默认）
- `按回答数`

切换后：

- 柱状图数值用 `count/percent` 或 `answers/answerPercent`
- 柱状图标签同步变化
- 图例说明当前口径

不要同时把两套数字塞进同一根柱子。

### 4.3 三组来源结构并排

用同一套颜色和顺序：

1. 整体来源
2. DEGSON 相关来源
3. DEGSON 缺席来源

每组显示：

- 类型
- 条数 / 回答数
- 占比
- 唯一域名数

`top 8` 类型 + “其他”即可；不要列出 0 行。

### 4.4 模型 × 来源类型矩阵

新增一张热力图/矩阵：

| 来源类型 | GPT 条数 | GPT 回答 | Gemini 条数 | Gemini 回答 |
|---|---:|---:|---:|---:|

数据来自 `summary.models[].categories`。

再加两行：

- 官网占比
- 第三方占比

这轮的关键结论应该一眼能看出：

- GPT 官网多
- Gemini 官网很少，目录/媒体多

### 4.5 品类下钻

“分品类来源”不要只用一张平表，改成：

- 品类 tabs：EV / 储能 / 端子台 / 电动自行车 / 圆形 / 铁路
- 选中后显示：
  - 该品类来源结构
  - Top 站点（条数 + 回答数）
  - 该品类逐题来源
  - 目标页命中（如果有）

表格列建议：

`品类 | 回答 | 有来源回答 | 引用条数 | 提到 DEGSON | DEGSON 有引用 | 主要类型 | 主要站点`

### 4.6 Top 站点表

列：

`站点 | 类型 | 引用条数 | 回答数 | 唯一问题数`

其中：

- `引用条数` = 该 host 的 URL 出现次数
- `回答数` = 引用过该 host 的回答数
- `唯一问题数` = 引用过该 host 的 questionId 去重数

不要只显示条数，否则一条回答塞 8 个链接会误导。

### 4.7 逐条来源表

加筛选：

- 模型
- 品类
- 是否提到 DEGSON
- 来源类型
- 是否测试站 / 未解析
- 搜索框（host/title/url）

加：

- 分页（每页 50/100）
- 导出 CSV
- 复制当前筛选结果
- 点击 URL 新窗口打开
- 类型 badge
- `origin` badge：正文链接 / citation / 检索来源
- `rawUrl` 可在 hover 或详情里查看

不要再只显示前 300 条然后写“完整数据在运行记录里”。

### 4.8 警告区

在来源卡片顶部或底部显示：

- `测试站 N 条：wwwtest.degson.com`
- `未解析引用 N 条：Gemini grounding redirect`
- `其他网页 N 条，Top 未分类域名：...`

这些是数据质量提示，不要混进正常来源占比。

### 4.9 空状态

- 没有来源：显示“本轮没有留下可核验来源”，不要显示空图表
- 没有 DEGSON 提及：显示“本轮未提到 DEGSON”，隐藏 DEGSON 来源块
- 没有未解析：不显示警告

---

## 5. 报告与 Word

### 5.1 `lib/analysis-report.js`

`sourceBrief` 补：

- `uniqueUrlCount`
- `uniqueHostCount`
- `thirdPartyShare`
- `officialShare`
- `competitorShare`
- `originCounts`
- `models[].categories` / `models[].topHosts` / `models[].degson`
- `byCategory[].citationCount`

`SUMMARY_INSTRUCTIONS` 里明确：

- `count` 是引用条数
- `answers` 是回答覆盖数
- 两者不能混用
- 分模型判断 GPT/Gemini

### 5.2 `lib/export-report-docx.js`

来源表：

- 来源类型 / 条数 / 占比 / 回答数 / 唯一域名
- 模型表加“主要来源”列（已有，确认字段）
- 增加“唯一来源总数”“第三方占比”“测试站/未解析”提示

### 5.3 `lib/export-docx.js`

运行结果 Word 的来源表同步：

- 条数 / 占比 / 回答数
- 唯一来源
- 测试站/未解析提示

---

## 6. 数据契约（建议）

```ts
interface SourceKindRow {
  id: string;
  label: string;
  count: number;          // 引用条数
  percent: number;
  answers: number;        // 回答数
  answerPercent: number;
  uniqueHosts: number;
}

interface SourceHost {
  host: string;
  kind: string;
  kindLabel: string;
  count: number;
  answers: number;
}

interface SourceSummary {
  answers: number;
  withCitations: number;
  withoutCitations: number;
  brandAnswerCount: number;
  noBrandAnswerCount: number;
  allCitationCount: number;
  uniqueUrlCount: number;
  uniqueHostCount: number;
  originCounts: Record<string, number>;
  thirdPartyCount: number;
  thirdPartyShare: number;
  officialCount: number;
  officialShare: number;
  competitorCount: number;
  competitorShare: number;
  socialCount: number;
  socialShare: number;
  testCount: number;
  redirectCount: number;
  allCategories: SourceKindRow[];
  allTopHosts: SourceHost[];
  models: Array<{
    modelId: string;
    answers: number;
    withCitations: number;
    mentioned: number;
    sourced: number;
    unsourced: number;
    citations: number;
    categories: SourceKindRow[];
    topHosts: SourceHost[];
    degson: {
      mentioned: number;
      sourced: number;
      unsourced: number;
      citationCount: number;
      categories: SourceKindRow[];
      topHosts: SourceHost[];
    };
  }>;
  degson: SourceGroup;
  absent: SourceGroup;
  byCategory: Array<{
    category: string;
    answers: number;
    withCitations: number;
    citationCount: number;
    mentioned: number;
    sourced: number;
    unsourced: number;
    categories: SourceKindRow[];
    topHosts: SourceHost[];
  }>;
  advice: string;
}
```

保持旧字段兼容：

- `allCitationCount` 保留
- `categories` / `items` 保留
- `citationCount` 仍表示 DEGSON 相关引用条数

如果担心 JSON 太大：

- `items` 只在详情接口返回
- `sourceSummary` 只返回聚合
- 增加 `GET /api/runs/:id/sources?model=&category=&kind=&mentioned=&page=` 分页接口（P2）

---

## 7. 测试清单

### 单元测试

- `cleanUrl`：
  - 去 UTM
  - 去尾部反引号
  - 去 hash
  - 保留 `lang`
- 同一 URL 带/不带 UTM → 1 条
- 同一回答同 URL 出现两次 → 1 条
- `kindRows` 只返回 `count > 0`
- `answers` 按 `questionId:modelId` 去重
- `topHosts.answers` 正确
- `uniqueUrlCount` / `uniqueHostCount`
- `thirdPartyShare` / `officialShare` / `competitorShare`
- `absent.brandAnswers` / `absent.noBrandAnswers`
- `wwwtest.degson.com` → `test`
- `models.gpt.categories` / `models.gemini.categories`
- `enrichRun` 的 `sourceSummary.byCategory` 不含“未分类”

### 全量验证

```bash
node --test
cd frontend
npm run type-check
npm run build
```

### 手工验证

用 `run-20261102092441042-2f90ba`：

1. `GET /api/runs/run-...`：
   - `sourceSummary.byCategory` 有 EV/储能/端子台等，不是“未分类”
   - `sourceSummary.testCount === 1`
   - `sourceSummary.redirectCount === 12`
   - `uniqueUrlCount < allCitationCount`
   - q52 的 `utm_source=openai` 不再产生两条
2. UI：
   - 顶部 6 个 KPI
   - 条数/回答数切换
   - 模型矩阵
   - 品类 tabs
   - 逐条来源筛选/分页
3. Word：
   - 来源表有“回答数”
   - 模型表有“主要来源”
   - 测试站/未解析提示存在

---

## 8. 验收标准

- [ ] 同一 canonical URL 不重复计数
- [ ] 每个来源类型同时有 `count` 和 `answers`
- [ ] `topHosts` 同时有 `count` 和 `answers`
- [ ] 运行页分品类来源不再是“未分类”
- [ ] `test` 不再算官网
- [ ] `redirect` 不再混入正常来源
- [ ] 没有 0.0% 空行
- [ ] UI 可以按条数/回答数切换
- [ ] 模型矩阵能看出 GPT/Gemini 来源差异
- [ ] 逐条来源可筛选/分页/导出
- [ ] Word 与页面口径一致
- [ ] `node --test` 全绿
- [ ] `npm run type-check` 通过
- [ ] `npm run build` 通过
- [ ] 重启 3100 后页面正常

---

## 9. 不要做的事

- 不要改题目、提示词、模型、地区
- 不要重跑 50 题评测（本次只改统计/UI）
- 不要为了“好看”把 `count` 和 `answers` 混成一个数
- 不要用域名分类推断“权威性”；独立性只是启发式
- 不要把 `test` / `redirect` 算进官网/媒体占比
- 不要删除旧字段，避免报告/前端其他部分崩
- 不要动 `config/questions.json`

---

## 10. 交付顺序

1. 先修 P0 数据准确性（canonical URL、answers、classify、enrichRun 分类）
2. 再改 UI 来源卡片（KPI、切换、矩阵、下钻）
3. 再改报告/Word
4. 最后跑测试、build、重启 3100 验证

如果时间有限，**P0 + KPI/切换 + 模型矩阵** 是最小可用版本；逐条筛选/CSV/趋势可以放第二批。

---

## 11. 参考文件

- `lib/citation-sources.js`
- `lib/engine.js`（`enrichRun`）
- `lib/analysis-report.js`（`sourceBrief` / `SUMMARY_INSTRUCTIONS`）
- `lib/export-report-docx.js`
- `lib/export-docx.js`
- `frontend/src/App.vue`
- `frontend/src/components/AnalysisReport.vue`
- `frontend/src/components/Inspector.vue`
- `frontend/src/types.ts`
- `test/citation-sources.test.js`
- 当前 run：`data/runs/run-20261102092441042-2f90ba.json`
- 当前报告：`data/analysis-reports/run-20261102092441042-2f90ba.json`

---

## 12. 备注

这轮来源数据有两个历史包袱：

1. 旧的 179 题全量轮次里，Gemini 没有保存 grounding，来源分析实际上是 GPT-only；不要拿它当双模型基线。
2. 当前 50 题轮次已经能拿到 Gemini 150 条来源，但仍有 12 条未解析 redirect；UI 要明确标注，不要伪装成正常来源。
