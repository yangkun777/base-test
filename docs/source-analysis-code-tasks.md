# 来源分析：代码层可做的优化清单

> 交接对象：Codex  
> 项目：`D:\degson-geo-baseline`  
> 范围：只做“来源分析”的统计、UI、报告、监控。  
> **不要改题目、提示词、模型、地区，也不要重跑 50 题评测。**

---

## 0. 先看现状

Codex 上一轮已经完成了大部分基础能力：

- `lib/citation-sources.js`
  - URL 规范化、去 UTM、去重
  - `uniqueUrlCount` / `uniqueHostCount`
  - 每个来源类型的 `count` / `answers` / `answerPercent` / `uniqueHosts`
  - `topHosts` 的 `count` / `answers` / `questions`
  - 模型维度的 `models[].categories`
  - `test` / `redirect` 单独分类
  - `absent.brandAnswers` / `absent.noBrandAnswers`
- `frontend/src/components/SourceAnalysis.vue`
  - KPI、来源结构、模型矩阵、Top 站点、品类下钻、逐条筛选、CSV
- `frontend/src/App.vue` / `AnalysisReport.vue`
  - 已接入 `SourceAnalysis`
- `lib/analysis-report.js` / `lib/export-report-docx.js`
  - 已开始带 `uniqueUrlCount`、`answers`、`uniqueHosts`

所以这次不是重做，而是补齐下面 5 个代码层能力。

---

## 1. P0：默认口径改为“回答覆盖”，不是“引用条数”

### 问题

当前 `SourceAnalysis.vue` 默认：

```ts
const metric = ref<'count' | 'answers'>('count')
```

但业务结论应该是：

> 有来源回答里，有多少回答引用了竞品/目录/官网。

不是“竞品有多少条链接”。

### 改动

1. `SourceAnalysis.vue`
   - 默认 `metric = 'answers'`
   - 选项顺序：
     1. `按回答覆盖`（默认）
     2. `按引用条数`
   - 表头同步：
     - `回答数`
     - `覆盖率`
     - `引用条数`
   - 说明文字改成：
     > 覆盖率以“有来源回答数”为分母；同一回答可覆盖多个类型，合计可超过 100%。

2. 在来源卡片顶部加一行“覆盖率摘要”：

```text
有来源回答 82 / 99
竞品覆盖 43 / 82（52.4%）
目录覆盖 7 / 82（8.5%）
官网覆盖 10 / 82（12.2%）
```

不要只显示“竞品 93 条”。

3. 报告/Word 的主口径也改成回答覆盖：
   - 先写 `43/82 个有来源回答引用竞品官网`
   - 再写 `竞品引用 93 条`

### 验收

- 打开来源分析，默认看到的是 `answers / answerPercent`
- 切换“按引用条数”后还能看到旧口径
- 不再出现“竞品 33.6%”被误读成“33.6% 的回答”的情况

---

## 2. P0：后端增加 `coverage` 和模型缺口字段

目前前端可以从 `categories` 推算，但报告/Word/模型矩阵都要重复算。建议在 `summarizeSources` 里直接给出。

### 数据契约

```ts
interface CoverageRow {
  answers: number;        // 涉及回答数
  percent: number;        // answers / withCitations * 100
  citations: number;      // 引用条数
}

interface SourceSummary {
  // 现有字段保留
  coverage: {
    withSources: number;      // = withCitations
    official: CoverageRow;
    thirdParty: CoverageRow;
    competitor: CoverageRow;
    directory: CoverageRow;
    media: CoverageRow;
    distributor: CoverageRow;
  };
  models: Array<{
    // 现有字段保留
    coverage: {
      official: CoverageRow;
      thirdParty: CoverageRow;
      competitor: CoverageRow;
      directory: CoverageRow;
      media: CoverageRow;
      distributor: CoverageRow;
    };
  }>;
}
```

定义：

- `thirdParty` = distributor + certification + media + directory + research + local + marketplace
- `official` 不含 `test`
- `competitor` 单独
- 分母统一用 `withCitations`，不是 `answers`

### 用途

1. UI KPI/覆盖率摘要直接读 `coverage`，不在前端重复过滤。
2. 模型矩阵增加“缺口”提示：
   - `Gemini official.answers === 0` → 标红“官网缺口”
   - `Gemini directory.answers > 0` → 标绿“目录有效”
3. Word 报告增加“模型来源缺口”表。

### 验收

- `sourceSummary.coverage.official.answers === 10`
- `sourceSummary.coverage.competitor.answers === 43`
- `sourceSummary.models.gemini.coverage.official.answers === 0`
- 这些数字与 UI 手动筛选一致

---

## 3. P1：目标页命中（Target Landing）

这是代码层最接近“EV 进页面 / 储能端子台守住”的功能。  
代码不能替你去谈收录，但能告诉你“目标页有没有被模型引用”。

### 3.1 配置文件

新增 `config/source-targets.json`：

```json
[
  {
    "id": "ev-type2",
    "label": "EV Type 2 产品页",
    "questions": ["q22", "q52", "q96", "q97", "q118", "q168"],
    "urls": [
      "https://www.degson.com/product/..."
    ],
    "hosts": ["degson.com"]
  },
  {
    "id": "terminal-viox",
    "label": "端子台 viox 榜单",
    "questions": ["q69", "q102", "q115"],
    "urls": [],
    "hosts": ["viox.com"]
  },
  {
    "id": "terminal-directindustry",
    "label": "端子台 directindustry",
    "questions": ["q163"],
    "urls": [],
    "hosts": ["directindustry.com"]
  }
]
```

规则：

- `urls` 精确匹配 canonical URL
- `hosts` 匹配 host（含子域名）
- `questions` 可选；不填表示全轮
- 目标页可以为空；空配置时 UI 显示“未配置目标页”

### 3.2 计算

新增 `lib/source-targets.js`：

```js
loadSourceTargets()
buildTargetLanding(sourceItems, targets)
```

输出：

```ts
interface TargetLanding {
  id: string;
  label: string;
  questions: string[];
  citations: number;
  answers: number;
  models: string[];
  hitUrls: string[];
  missingQuestions: string[];
}
```

匹配逻辑：

- 先按 canonical URL / host 匹配
- 再按 `questions` 过滤
- `answers` 按 `questionId:modelId` 去重
- `missingQuestions` = 配置的 questions - 命中 questions

### 3.3 接入

- `summarizeSources(results, questions, options)`
  - 增加 `targets` 参数
  - 返回 `targetLanding: TargetLanding[]`
- `enrichRun` / `buildAnalysisStats` 传入 `loadSourceTargets()`
- `SourceAnalysis.vue` 增加“目标页命中”表：

```text
目标页 | 配置问题数 | 命中回答 | 命中引用 | 命中模型 | 未命中问题
```

- 没有命中时显示：

> 本轮未命中；说明模型还没打开该页，或该页还没被检索。

### 3.4 验收

- 配置一个已存在的 DEGSON URL，能在本轮 `allItems` 中命中
- `viox.com` 能命中 4 个回答
- `directindustry.com` 能命中 1 个回答（7 条引用）
- 没有配置目标时，UI 不报错，显示“未配置目标页”

---

## 4. P1：Host 监控表

当前 `Top 站点` 只有 15 个，且没有完整导出。建议补：

### 4.1 后端

`topHostsOf` 已支持 `count/answers/questions`。再加一个 `hostStats`：

```ts
hostStats: Array<{
  host: string;
  kind: string;
  kindLabel: string;
  citations: number;
  answers: number;
  questions: number;
  models: string[];
}>
```

规则：

- 按 `count` 降序
- 最多返回 100 个
- `models` 去重
- `questions` 去重

### 4.2 UI

Top 站点表：

```text
站点 | 类型 | 引用条数 | 回答数 | 问题数 | 模型
```

加筛选：

- 只看目录
- 只看媒体
- 只看竞品
- 只看 DEGSON 相关

加导出 CSV。

### 4.3 用途

可以直接回答：

- `viox.com` 是 4 个回答的稳定来源
- `directindustry.com` 是 1 个回答的 7 条引用
- `degson.com` 是 9 个回答的稳定来源
- `vertexaisearch` 是 9 个回答的未解析来源

### 验收

- `viox.com`：`citations=6, answers=4, questions=3`
- `directindustry.com`：`citations=7, answers=1, questions=1`
- `degson.com`：`citations=10, answers=9, questions=9`
- `vertexaisearch...`：`citations=12, answers=9`

---

## 5. P2：跨轮趋势（可选）

同一批题重测后，比较：

```ts
sourceTrend: Array<{
  runId: string;
  createdAt: string;
  officialAnswers: number;
  thirdPartyAnswers: number;
  competitorAnswers: number;
  directoryAnswers: number;
  degsonAnswers: number;
  uniqueUrls: number;
  testCount: number;
  redirectCount: number;
}>
```

UI 用折线/柱状图展示：

- 竞品覆盖率
- 目录覆盖率
- 官网覆盖率
- DEGSON 来源覆盖率

这一项可以后做；先把 P0/P1 做完。

---

## 6. 报告/Word 同步（必须）

### 6.1 `lib/analysis-report.js`

`sourceBrief` 补：

- `coverage`
- `targetLanding`
- `models[].coverage`
- `models[].categories` / `topHosts`
- `uniqueUrlCount` / `uniqueHostCount`
- `thirdPartyShare` / `officialShare` / `competitorShare`
- `originCounts`

`SUMMARY_INSTRUCTIONS` 明确：

- `count` 是引用条数
- `answers` 是回答覆盖
- 先看回答覆盖，再看条数
- `models` 要分 GPT/Gemini 判断

### 6.2 `lib/export-report-docx.js`

- 来源表：`类型 / 回答数 / 覆盖率 / 引用条数 / 唯一域名`
- 模型表：`模型 / 有来源回答 / 官网覆盖 / 目录覆盖 / 媒体覆盖 / 竞品覆盖`
- 增加“目标页命中”表
- 增加“测试站/未解析”提示

### 6.3 `lib/export-docx.js`

运行结果 Word 的来源表同步：

- 回答数
- 覆盖率
- 引用条数
- 唯一来源数

### 6.4 报告缓存

现有报告是快照：

- UI 运行页会重新 enrich，看到新口径
- 报告/Word 不会自动更新
- 需要重新生成报告才同步；**不需要重跑 50 题评测**

---

## 7. 测试清单

在 `test/citation-sources.test.js` / `test/source-analysis-contract.test.js` 增加：

### 7.1 coverage

```js
assert.equal(summary.coverage.official.answers, 10);
assert.equal(summary.coverage.competitor.answers, 43);
assert.equal(summary.models.find(m => m.modelId === 'gemini').coverage.official.answers, 0);
```

### 7.2 target landing

```js
const landing = buildTargetLanding(items, [{ id:'viox', hosts:['viox.com'], questions:['q69','q102','q115'] }]);
assert.equal(landing[0].answers, 4);
assert.equal(landing[0].citations, 6);
```

### 7.3 host stats

```js
const host = summary.hostStats.find(x => x.host === 'directindustry.com');
assert.equal(host.citations, 7);
assert.equal(host.answers, 1);
assert.equal(host.questions, 1);
```

### 7.4 回归

```bash
node --test
cd frontend
npm run type-check
npm run build
```

---

## 8. 验收标准

- [ ] 来源分析默认按“回答覆盖”，不是“引用条数”
- [ ] 有“竞品覆盖 43/82、目录 7/82、官网 10/82”的摘要
- [ ] `models.find(m => m.modelId === 'gemini').coverage.official.answers === 0` 能在 UI 标出“官网缺口”
- [ ] `viox.com` 显示 6 条 / 4 回答 / 3 问题
- [ ] `directindustry.com` 显示 7 条 / 1 回答 / 1 问题
- [ ] 目标页命中表可配置、可显示“未命中”
- [ ] 报告/Word 与页面口径一致
- [ ] 测试全绿、type-check/build 通过
- [ ] 3100 重启后页面正常

---

## 9. 不要做的事

- 不要改题目、提示词、模型、地区
- 不要为了“提升数字”重跑评测
- 不要把“引用条数”和“回答覆盖”合成一个数
- 不要把 `test` / `redirect` 算进官网/媒体
- 不要在目标页配置里写不存在的 URL；可以先留空
- 不要把域名类型当成权威性；独立性只是启发式

---

## 10. 建议交付顺序

1. `coverage` + 模型缺口字段
2. 默认改为回答覆盖 + UI 覆盖率摘要
3. `hostStats` + Top 站点表
4. `source-targets.json` + 目标页命中
5. 报告/Word 同步
6. 测试/构建/重启验证

如果时间有限，**1 + 2 + 4** 最值得先做：  
先让所有人看“回答覆盖”和“目标页有没有命中”，再看引用条数。
