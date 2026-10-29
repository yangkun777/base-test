# Degson 海外模型 GEO 基线平台

当前运行状态、2026-10-19 的修复与 UI 改动、绿盾环境注意事项见 [PROJECT_STATUS.md](PROJECT_STATUS.md)。

面向宁波高松（Degson）的海外生成式引擎优化（GEO）基线评估 Demo：按题库串行测试所选的 **GPT、Gemini** 模型，统计 Degson 与 TE Connectivity、Phoenix Contact、WAGO、Weidmüller 的品牌提及次数、声量占比与推荐顺位，结果落盘 JSON 并以商务风深色看板呈现。

## 目录结构

- `config/questions.json` — 英文测试题库（当前可在页面维护）
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

3. 启动服务并打开 `http://localhost:3100`：

```bash
node server.js
```

前端开发模式：`cd frontend && npm run dev`（Vite 代理 `/api` 到 3100）。

## 评测口径

- **串行调用**：页面可勾选 GPT、Gemini 中的一个或两个；请求数 = 当前题数 × 所选模型数，发起前会显示预计次数。逐个执行，整轮耗时取决于联网搜索。命令行脚本仍调用所有已配置模型。
- **提及统计**：别名正则命中后按区间合并去重（"TE Connectivity" 不会被 "TE" 重复计数）。
- **推荐顺位**：品牌在单条回答中**首次出现的先后顺序**；Top 1 / Top 3 为进入对应顺位的回答数。
- **结果落盘**：每轮保存为 `data/runs/run-*.json`，看板默认加载最新一轮，可下拉切换历史。

API Key 只在服务端读取，不会发送到浏览器。
