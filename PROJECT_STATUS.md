# 项目交接与当前状态（2026-10-19）

> 供后来接手的同事或模型快速了解本项目。本文记录的是 2026-10-19（北京时间）的实测状态；服务进程、绿盾策略和历史评测数量以后可能变化，应重新检查。

## 项目做什么

这是 Degson 海外 GEO 基线评测 Demo。`config/questions.json` 中有 5 个英文工业场景；前端逐题串行请求 GPT、Gemini，服务端按 `config/brands.json` 的别名规则统计 Degson 和 4 个竞品的提及。每轮原始回答与解析结果保存在 `data/runs/run-*.json`，Vue 看板展示摘要、监测品牌内份额、模型对比、首次提及顺位和原始回答。

主要入口：

- `server.js`：Node HTTP 服务、`/api/*` 接口、前端 `dist` 静态托管。
- `lib/engine.js`：模型调用、品牌匹配；与 `scripts/run-baseline.js` 命令行脚本共用。
- `frontend/src/App.vue`：看板页面与摘要指标。
- `frontend/src/composables/useRun.ts`：加载历史轮次、上一轮对比、新一轮串行评测。
- `frontend/src/components/`：图表、排名、原始回答和运行进度。

## 2026-10-19 做过的事

### 恢复本机可运行状态

本机装有天锐绿盾透明加密。当天最初用 PowerShell 读取时，`frontend/package.json`、`frontend/package-lock.json`、3 份历史评测 JSON、旧 `node_modules` 和旧 `dist` 都以 `88 7D 1C` 开头，普通 Node/npm 无法解析。先读了 `D:\dev-tools\README-DLP加密与批量解密.md` 和 `D:\dev-tools\decrypt-existing.ps1`，再按文档实测。

- 脚本探测到当时有 **70 个扩展名放行**；旧文档所说的 8 个已经过时。
- `D:\geo-evaluator`、`D:\geo-evaluation-platform` 各自 DryRun 均为 0 个待处理文件，因此未改动这两个目录。
- 当前项目 `D:\degson-geo-baseline` 的 DryRun 找到 5 个仍为密文的 `.json`。脚本写回时报告内容 SHA-256 一致、失败 0；脚本即时复核仍报 5 个密文，但稍后独立复核显示 5 个都已转为明文，`npm` 和 Node 都能解析。**不要只根据脚本结束瞬间的状态判断失败**，应隔一会儿再用 PowerShell 读文件头并实际解析。
- 旧 `frontend/node_modules` 与 `frontend/dist` 被移至项目内 `.dlp-artifact-backup-20261019/`，随后用 `npm ci` 重装依赖并重新构建。当前备份仍在；清理时自动审批机制返回 `blocked by policy`，未执行递归删除。备份只含旧的生成物，不参与运行。
- 当天 npm 从 npmmirror 和官方源下载时都遇到过 `ECONNRESET`；最终用官方源、单连接下载成功。没有修改依赖版本或锁文件。

### 看板 UI 调整

- `App.vue`：原先提示条加 4 个重复指标卡，改为一块本轮摘要；显示 Degson 覆盖回答、监测品牌内份额、最高份额品牌、与上一轮的 Degson 份额变化。对比前会检查两轮的题目/模型组合和模型名；不一致时不显示数值差。
- `useRun.ts`：加载选中轮次时一并加载上一轮；切换轮次时用请求序号避免较慢的旧请求覆盖新选择。
- 新增 `SovBars.vue`、移除 `SovDonut.vue`：环图改为按份额排序的横向条形图，始终列出 Degson 的 0 值。条长按最高份额缩放，文字显示真实百分比。
- `RankTable.vue`：窄窗口下改为品牌卡片，避免 6 列表格挤压；将“推荐顺位”文案明确为“首次提及顺位”。
- `Inspector.vue`、`ModelMatrix.vue`、`styles/base.css`：提高问题、品牌标签、图表坐标和说明文字的可读性，并给可展开的回答按钮添加展开状态。

## 当前验证结果

- 2026-10-19 运行 `cd frontend; npm run type-check`：通过。
- 运行 `cd frontend; npm run build`：通过，Vite 构建 590 个模块；新 `dist` 的 HTML/CSS/JS 为明文。
- `http://127.0.0.1:3100/` 返回 HTTP 200；页面实际加载新构建包。当天服务进程在 3100 端口监听，但重启电脑或结束进程后需重新启动。
- `/api/meta` 返回 5 个问题、5 个监测品牌；GPT 和 Gemini 均显示已配置。**未发起新一轮付费模型请求。**
- `/api/runs` 可读到 2026-09-04 的 3 轮历史记录；成功数分别为 8/10、10/10、10/10。最新一轮为 `run-2026-09-04-064702`。
- 在当前约 724px 宽的应用侧栏中检查了首屏、份额图、模型对比和排名卡片；历史轮次切换后摘要和图表同步变化，切回最新轮次后无浏览器运行错误。更窄的手机视口尚未做实际截图验证。

## 如何启动与复核

PowerShell 中从项目根目录执行：

```powershell
cd D:\degson-geo-baseline
cd frontend
npm ci
npm run type-check
npm run build
cd ..
node server.js
```

打开 `http://127.0.0.1:3100/`。如果 3100 端口已有该项目的服务，不要再启动第二个进程；前端重新构建后刷新页面即可。`.env` 已存在并配置模型 Key，**不要把 Key 写进文档、日志或前端代码**。需要从零配置时参考 `.env.example`。

若 npm 下载遇到 `ECONNRESET`，当天成功的安装命令是：

```powershell
npm ci --no-audit --no-fund --registry=https://registry.npmjs.org --replace-registry-host=always --maxsockets=1 --fetch-retries=5 --fetch-timeout=60000
```

绿盾相关操作先看 `D:\dev-tools\README-DLP加密与批量解密.md`。放行策略必须重新实测；用 **Node 写测试文件、PowerShell 读文件头**，不能用 PowerShell 写文件来探测放行。只对已放行扩展名的存量密文使用 `decrypt-existing.ps1`，先 `-DryRun`。当日以 `powershell -File ... -Roots D:\a,D:\b` 传两个目录时，逗号整体被当作一个目录名；分别对每个根目录执行才能可靠扫描。不要用该脚本处理 `node_modules` 或 `dist`，这些目录应重新生成。

## 已知口径和后续关注点

- 看板的份额分母只包含配置的 **5 个监测品牌**，不是所有市场品牌的总声量。
- “首次提及顺位”仅按品牌在回答中的第一次出现位置排序，不能直接当作推荐强度；正文可能是对比、否定或引用。
- 目前每个场景每模型只问一次。后续若要做可靠的趋势分析，应增加重复轮次，并在结果中保存题目、别名规则和模型参数快照。
- `server.js` 的模型调用和保存记录接口没有认证或请求限制。当前适合本机内部 Demo；若要提供给其他人访问，应先处理访问控制与费用风险。
- 目前目录**没有 `.git` 仓库**。若要追踪后续修改，需要单独建立版本管理。`StatTile.vue` 现未被页面引用，可在以后整理组件时检查是否保留。
## 2026-10-22：基线测试 token 排查与回答格式

- 2026-10-19 已更新 D:\dev-tools\README-DLP加密与批量解密.md：将 8 个放行扩展名标为旧记录，补入 70 个候选扩展名的当日探测、两个目标目录分别 DryRun 的结果，以及外部 powershell.exe -File 逗号传多个 -Roots 被误当单一路径、即时复核可能与稍后独立检查不一致等实操发现。更新该文档时只用 PowerShell 写入，保留 UTF-8 BOM；原文备份为同目录的 .bak-20261019 文件。
- 2026-10-22 的 run-2026-10-22-054420.json 保存了 23 题 × 2 模型、46 条成功结果，但没有 usage 字段，无法反算准确 token 消耗。run-2026-10-22-073614.json 只有 3 题 × 2 模型，其中两条成功 GPT 结果合计输入 25,528、输出 684 token；失败请求没有 usage，整轮实际消耗可能更高。
- 当前 lib/engine.js 每题都调用模型自带联网搜索。GPT 设置 search_context_size=low、max_tool_calls=1；但中转接口若拒绝参数，代码会回退并移除相应参数。已有运行记录没保存究竟用了哪组参数，因此不能确认最近两次 GPT 搜索是否实际采用 low。Gemini 的 googleSearch 没有同样的一次搜索硬限制。
- 按用户“只需知道模型推荐了哪些品牌”需求，将 SEARCH_GUIDE 改为仅输出推荐品牌：每行一个加粗品牌名，不要说明、产品名、链接或引文。保留模型原本的推荐顺序，本地解析器仍可从列表中识别 Degson 和顺位。没有改动联网搜索方式或输出 token 上限 500；未发起新的付费模型请求来验证实际节省量。
- 输入消耗主要由联网搜索内容决定，缩短最终品牌列表主要减少输出 token。若要显著降低输入，可减少题目/模型请求数；自建搜索并只送短摘要或关闭联网搜索会改变基线评测口径，实施前需明确接受这一变化。费用还取决于实际中转服务的计费规则。
- 验证：node --check lib/engine.js 通过；用“TE Connectivity、WAGO、Phoenix Contact、Degson”四条加粗品牌列表测试 analyzeText，识别 Degson 为第 4 位；PowerShell 确认 engine.js 不是 88 7D 1C 密文头。
## 2026-10-22：可选择评测模型

- 页面新增 GPT / Gemini 复选框。默认勾选所有已配置模型；可只勾选一个，也可同时勾选两个。没有选中模型时“发起新一轮评测”禁用。
- 发起前显示“题数 × 所选模型数 = 预计模型调用次数”。运行时锁定选择，前端只为选中的已配置模型生成任务，保存的 run.models 也只包含本轮选中模型；历史结果仍按其原有模型显示。命令行脚本不受页面选择影响。
- 更新 QuestionBank 提示和 README 中固定的“双模型、5 题”表述。
- 验证：frontend 的 npm run type-check、npm run build 通过；新 dist 的 33 个文件未见 88 7D 1C 密文头；浏览器实测当前 3 题时双模型显示 6 次、单模型显示 3 次、零模型禁用按钮。未点击发起评测，未产生新的付费模型请求。
