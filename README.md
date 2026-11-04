# Degson 海外模型 GEO 基线平台

当前运行状态、2026-10-30 的分析报告 v3 与绿盾环境注意事项见 [PROJECT_STATUS.md](PROJECT_STATUS.md)。

面向宁波高松（Degson）的海外生成式引擎优化（GEO）基线评估 Demo：按题库串行测试所选的 **GPT、Gemini** 模型，统计 Degson 与 TE Connectivity、Phoenix Contact、WAGO、Weidmüller 的品牌提及次数、声量占比与推荐顺位，结果落盘 JSON 并以商务风深色看板呈现。

## 目录结构

- `config/questions.json` — 当前启用的 50 道英文题（2026-10-30 从暂停题库恢复，覆盖 EV / 储能 / e-bike / 端子台 / 圆形）；可在页面维护
- `config/questions-paused-2026-10-30.json` — 暂时停用的 151 道题，保留原文供后续恢复
- `config/questions.single-2026-10-30.bak.json` — 恢复前的单题题库备份
- `config/question-taxonomy.json` — 题目分类缓存（模型分类一次，可人工修改；`source: manual` 不会被覆盖）
- `config/analysis-rubric.md` — 报告角色与 10 条判断标准（v3）
- `config/analysis-knowledge.json` — DEGSON 公开资料事实卡（含来源、日期与验证状态）
- `config/brands.json` — 监控品牌与别名正则（`TE` 用大小写敏感词边界避免误伤）
- `lib/engine.js` — 双模型调用 + 品牌提及解析（服务端与脚本共用）
- `server.js` — 零依赖 Node 服务：API + 托管前端构建产物
- `scripts/run-baseline.js` — 命令行跑一轮完整基线并落盘
- `data/runs/*.json` — 每轮评测结果（含原始回答与命中区间）
- `frontend/` — Vue 3 + Vite + TS + ECharts 看板

## 启动

1. 复制 `.env.example` 为 `.env`，填入两个模型的 Key（与 geo-evaluation-platform 项目同款配置，端口默认 3100）。
2. 构建前端（首次或改动后）：

```bash
cd frontend
npm install   # 国内网络：npm install --registry=https://registry.npmmirror.com
npm run build
```

3. 只在本机看：启动服务并打开 `http://localhost:3100`。同事要通过局域网访问时，用 [docs/本地部署.md](docs/本地部署.md)。

```bash
node server.js
```

前端开发模式：`cd frontend && npm run dev`（Vite 代理 `/api` 到 3100）。

## 评测口径

- **地区选择**：发起前必须选择中国（上海）、美国（纽约）或欧洲（以德国柏林为代表）。同轮每道题、每个模型都传入相同的位置参数；位置是搜索偏好，接口接受参数不保证每条搜索结果都来自该地区。
- **串行调用**：页面可勾选 GPT、Gemini 中的一个或两个；请求数 = 当前启用的 50 题 × 所选模型数，双模型共 100 次新调用。发起前会显示预计次数。逐个执行，整轮耗时取决于联网搜索。命令行脚本仍调用所有已配置模型。
- **中途停止**：评测中可点击“停止并查看本轮结果”。当前请求会尝试取消，后续题目不再调用；保存已完成的回复、原计划调用数和“用户中途主动停止”标记，报告按实际完成量统计。已发出的请求即使取消，也可能产生费用。
- **提及统计**：别名正则命中后按区间合并去重（"TE Connectivity" 不会被 "TE" 重复计数）；提及率和首次提及占比仅以成功且提及任意品牌的回答为分母，失败调用单独显示在模型覆盖率中。
- **推荐顺位**：品牌在单条回答中**首次出现的先后顺序**；Top 1 / Top 3 为进入对应顺位的回答数。
- **结果落盘**：每轮保存为 `data/runs/run-*.json`，看板默认加载最新一轮，可下拉切换历史。
- **历史轮次**：先前沿用旧回复的报告仍可查看；新地区评测只请求当前启用题库，不把未指定地区的旧回复计入新地区报告。

API Key 只在服务端读取，不会发送到浏览器。

## 分析报告（v3）

- 入口：结果区顶部「生成分析报告」。无报告时显示预计调用次数；已生成时按钮变为「查看分析报告」，**查看不调用模型**；报告按 run 落盘，刷新、切换、重开都不重复生成。
- 结构：执行摘要 → 1 分类与提及率（代码计算）→ 2 逐题分析（全量 7 字段 + 每类 2 道重点题）→ 3 优劣势与竞品差距 → 4 3–5 项优先行动 + 30/60/90 天 + 复测 → 5 方法与证据。
- 数据口径：分类、提及率、顺位、竞品统计全部由 `lib/analysis-stats.js` 计算，模型不得改数；分母为成功且提及任意品牌的回答，方法题单独排除。
- 角色与标准：`config/analysis-rubric.md`（海外工业连接器 GEO 顾问 + 10 条判断标准，每条判断标 E1–E4 证据等级）。
- 品牌背景：`config/analysis-knowledge.json` 事实卡，含官网来源、抓取日期与「厂家自述 / 待核实」状态；不把官网自述当独立证书审查。
- 生成流程：分类（缓存到 `config/question-taxonomy.json`，可人工改）→ 每 8 题一批逐题分析 → 最多 2 个弱分类联网核查 → 1 次汇总。每步落盘，可停止、续跑；内容审核拒绝时自动用精简输入重试 1 次。
- 联网：使用项目 GPT Key 的 Responses `web_search`，每类最多 2 次搜索；没有工具调用或来源时标「未核实」，不阻断报告；未联网会写进限制。
- 存储与防重复：每轮一份 `data/analysis-reports/<run-id>.json`（不存整轮原始回答）；`complete` 后 POST 直接返回缓存；服务端文件锁去重；并发点击只跑一个任务。
- 继续 / 重生成：部分完成（缺题、汇总兜底、联网失败）可在报告内「继续生成」，复用已完成部分；`regenerate=1` 需页面二次确认，旧报告备份到 `data/analysis-report-backups/`。
- 导出：页面整页查看（左侧目录、按分类折叠、题目可搜索），「导出 Word」下载 `*-GEO-analysis.docx`。
- 接口：`GET /api/runs/<id>/analysis` 读取 / 预览；`POST` 开始 / 继续（`?regenerate=1`、`?web=0`）；`POST /analysis/stop` 停止；`GET /analysis/export.docx` 下载。
- 旧版（v2）报告不再读取，首次访问会提示重新生成；原文件保留并自动备份。
