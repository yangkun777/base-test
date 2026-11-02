<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRun } from './composables/useRun'
import { aggregate, brandsFromRun, degsonReport, type DegsonModelCell } from './lib/aggregate'
import SovBars from './components/SovBars.vue'
import RankTable from './components/RankTable.vue'
import Inspector from './components/Inspector.vue'
import RunProgress from './components/RunProgress.vue'
import QuestionBank from './components/QuestionBank.vue'
import AnalysisReport from './components/AnalysisReport.vue'
const analysisPanel = ref<InstanceType<typeof AnalysisReport> | null>(null)

const { state, init, selectRun, startRun, stopRun, progressDone } = useRun()

onMounted(init)

const report = computed(() => state.currentRun ? degsonReport(state.currentRun) : null)
const runBrands = computed(() => state.currentRun ? brandsFromRun(state.currentRun) : [])
const agg = computed(() => state.currentRun ? aggregate(state.currentRun, runBrands.value) : null)
const failedResults = computed(() => (state.currentRun?.results || []).filter(result => result.status === 'error'))
const noBrandResults = computed(() => (state.currentRun?.results || []).filter(result => result.status === 'ok' && !result.mentions?.length))
const plannedCount = computed(() => state.currentRun?.plannedCount ?? ((state.currentRun?.questions?.length || 0) * (state.currentRun?.models.length || 0)))
const selectedModelCount = computed(() => state.meta?.models.filter(model => model.configured && state.selectedModelIds.includes(model.id)).length || 0)
const plannedRequests = computed(() => (state.meta?.questions.length || 0) * selectedModelCount.value)

const runDate = computed(() => {
  if (!state.currentRun) return ''
  return new Date(state.currentRun.createdAt).toLocaleString('zh-CN', { hour12: false })
})

const degsonAgg = computed(() => agg.value?.byBrand.degson)
const mentionHits = computed(() => degsonAgg.value?.total || 0)
const firstHits = computed(() => degsonAgg.value?.top1 || 0)

function rateOf(run: NonNullable<typeof state.currentRun>) {
  const summary = degsonReport(run)
  const brands = brandsFromRun(run)
  const stats = aggregate(run, brands)
  const valid = stats.okCount
  const questions = stats.completeQuestionCount
  const mention = valid ? (stats.byBrand.degson?.total || 0) / valid : 0
  const first = valid ? (stats.byBrand.degson?.top1 || 0) / valid : 0
  const models = summary.models.map(model => model.id)
  const agreed = questions
    ? summary.rows.filter(row => models.every(id => row.byModel[id]?.mentioned)).length / questions
    : 0
  return Math.round((mention * 0.6 + first * 0.25 + agreed * 0.15) * 100)
}

const score = computed(() => state.currentRun ? rateOf(state.currentRun) : 0)
const scoreDelta = computed(() => {
  if (!state.currentRun || !agg.value?.okCount || !state.previousRun?.results?.length) return null
  if (state.currentRun.regionId !== state.previousRun.regionId) return null
  return score.value - rateOf(state.previousRun)
})

const covered = computed(() => {
  const run = state.currentRun
  const summary = report.value
  if (!run || !summary) return { ok: 0, total: 0 }
  const questions = run.questions?.map(item => item.id) || [...new Set(run.results.map(item => item.questionId))]
  const models = summary.models.map(model => model.id)
  const attempted = questions.filter(questionId => models.every(modelId =>
    run.results.some(item => item.questionId === questionId && item.modelId === modelId)
  ))
  const ok = attempted.filter(questionId => models.every(modelId =>
    run.results.some(item => item.questionId === questionId && item.modelId === modelId && item.status === 'ok')
  )).length
  return { ok, total: attempted.length }
})

function resultNote(row: { byModel: Record<string, DegsonModelCell> }) {
  const named = report.value?.models.filter(model => row.byModel[model.id]?.mentioned).map(model => model.label) || []
  const first = report.value?.models.some(model => row.byModel[model.id]?.rank === 1)
  return { named, first: !!first }
}

function rankLabel(cell: DegsonModelCell | undefined) {
  if (!cell) return '—'
  if (cell.notRun) return '未测试（已停止）'
  if (cell.error) return '调用失败'
  if (cell.noBrand) return '未提及任何品牌（不计入）'
  if (!cell.mentioned || cell.rank == null) return '未提及'
  if (!cell.before.length) return `第 ${cell.rank} 位`
  return `第 ${cell.rank} 位（${cell.before.join('、')} 之后）`
}

function onSelectRun(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  if (id) selectRun(id)
}

function exportDocx() {
  if (!state.currentRun || state.running) return
  window.location.href = `/api/runs/${state.currentRun.id}/export.docx`
}
</script>

<template>
  <div class="shell">
    <nav class="nav" aria-label="主导航">
      <div class="nav-brand"><span>D</span>Degson</div>
      <div class="nav-links">
        <span class="nav-link active">GEO 基线测试</span>
        <span class="nav-link" title="当前版本未接入">声量对称</span>
        <span class="nav-link" title="当前版本未接入">关键词分析</span>
        <span class="nav-link" title="当前版本未接入">竞品监控</span>
        <span class="nav-link" title="当前版本未接入">报告中心</span>
      </div>
    </nav>

    <div class="page">
    <header class="topbar">
      <div class="header-intro">
      <div class="brand">
        <div class="logo">D</div>
        <div>
          <h1>GEO 基线测试</h1>
          <p class="subtitle">工业连接器品牌提及 / GPT / Gemini 双模型可见性分析</p>
        </div>
      </div>
      <div class="actions history-actions">
        <span v-if="state.runs.length && !state.running" class="control-label">历史记录</span>
        <select v-if="state.runs.length && !state.running" class="run-select history-select" aria-label="查看历史测试记录" :value="state.currentRun?.id" @change="onSelectRun">
          <option v-for="run in state.runs" :key="run.id" :value="run.id">
            {{ new Date(run.createdAt).toLocaleString('zh-CN', { hour12: false }) }} · {{ run.regionLabel || '未指定地区' }}{{ run.stoppedByUser ? ' · 主动停止' : '' }}{{ run.hasReport ? ' · 已有报告' : '' }}
          </option>
        </select>
        <button class="export-btn" :disabled="!state.currentRun || state.running || state.loading" @click="exportDocx">导出 Word</button>
        <button class="export-btn analysis-report-btn" :aria-busy="analysisPanel?.busy || false" :title="analysisPanel?.hasContent ? '查看已生成的报告，不消耗 Key' : '用项目现有 GPT Key 生成分析报告'" :disabled="!state.currentRun || state.running || state.loading || !analysisPanel || analysisPanel.busy || analysisPanel.loading" @click="analysisPanel?.activate()"><span v-if="analysisPanel?.busy" class="analysis-button-spinner" aria-hidden="true"></span>{{ analysisPanel?.label || '生成分析报告' }}</button>
        <button v-if="analysisPanel?.busy" class="export-btn" :disabled="analysisPanel.stopping" title="停止后保留已完成内容；已发出的请求仍可能计费" @click="analysisPanel?.stop()">{{ analysisPanel.stopping ? '正在停止…' : '停止生成' }}</button>
        <p v-if="analysisPanel?.feedback" class="analysis-feedback" :class="{ failed: analysisPanel.failed }" :role="analysisPanel.failed ? 'alert' : 'status'">{{ analysisPanel?.feedback }}</p>
      </div>
      </div>
      <div class="test-settings">
        <label v-if="state.meta" class="region-picker">
          <span>测试地区</span>
          <select v-model="state.selectedRegionId" class="run-select" :disabled="state.running" aria-label="本轮测试地区">
            <option value="" disabled>请选择地区</option>
            <option v-for="region in state.meta.regions" :key="region.id" :value="region.id">{{ region.label }}</option>
          </select>
        </label>
        <div v-if="state.meta" class="model-picker" role="group" aria-label="本轮评测模型">
          <span class="control-label">测试模型</span>
          <label v-for="model in state.meta.models" :key="model.id" class="model-option" :class="{ on: state.selectedModelIds.includes(model.id), unavailable: !model.configured }">
            <input v-model="state.selectedModelIds" type="checkbox" :value="model.id" :disabled="state.running || !model.configured" />
            <span>{{ model.label }}</span>
          </label>
        </div>
        <div class="launch-actions">
        <button
          class="run-btn"
          :disabled="state.running || state.loading || !state.selectedRegionId || !state.meta?.questions.length || !selectedModelCount"
          @click="startRun"
        >{{ state.running ? '评测中…' : '发起新一轮评测' }}</button>
        <button v-if="state.running" class="stop-btn" :disabled="state.stopRequested || progressDone === state.progress.length" @click="stopRun">
          {{ state.stopRequested ? '正在停止…' : '停止并查看本轮结果' }}
        </button>
        </div>
      </div>
      <p v-if="state.meta && !state.loading" class="run-estimate">
        <span>本轮设置：{{ state.meta.questions.length }} 题 · {{ selectedModelCount }} 个模型 · 预计 {{ plannedRequests }} 次调用</span><span v-if="state.currentRun">当前结果：{{ state.currentRun.regionLabel || '未指定地区' }} · {{ state.currentRun.results.length }} 条回答</span>
      </p>
    </header>

    <main class="content">
      <div v-if="state.loading" class="placeholder">正在加载…</div>
      <div v-else-if="state.loadError" class="placeholder error">{{ state.loadError }}</div>

      <template v-else>
        <QuestionBank />
        <RunProgress v-if="state.running" />

        <template v-if="!state.running && state.currentRun && report && agg">
          <AnalysisReport ref="analysisPanel" :run="state.currentRun" />
          <div v-if="state.currentRun.stoppedByUser" class="stopped-banner" role="status">
            用户中途主动停止：本轮实际完成 {{ state.currentRun.results.length }} / 原计划 {{ state.currentRun.plannedCount || state.currentRun.results.length }} 条调用。以下统计仅依据实际完成的结果；失败作答不计入提及率分母。
          </div>
          <section class="card">
            <div class="card-title">调用覆盖与统计说明</div>
            <p>计划 {{ plannedCount }} 次；成功 {{ state.currentRun.results.filter(r => r.status === 'ok').length }} 次；失败 {{ failedResults.length }} 次；未运行 {{ Math.max(0, plannedCount - state.currentRun.results.length) }} 次。排除不涉及品牌的问题后，{{ agg.okCount }} 条成功回答计入品牌提及率。</p>
            <p>顺位为已识别品牌在全文中的首次出现顺序，背景文字也可能计入，并不代表推荐排名。</p>
            <p v-if="state.currentRun.analysis?.reanalyzed">当前展示按解析规则 v{{ state.currentRun.analysis.parserVersion }} 重新解析；原始记录未修改。</p>
            <details v-if="failedResults.length">
              <summary>查看全部失败调用（{{ failedResults.length }}）</summary>
              <ul><li v-for="(result, index) in failedResults" :key="index">{{ state.currentRun.questions?.find(q => q.id === result.questionId)?.text || result.questionId }} · {{ state.currentRun.models.find(m => m.id === result.modelId)?.label || result.modelId }}：{{ result.error || '未知错误' }}</li></ul>
            </details>
          </section>
          <section v-if="noBrandResults.length" class="card" aria-label="未提及任何品牌的回答">
            <div class="card-title">以下回答不计入品牌提及率</div>
            <p class="card-sub">这些成功回答中未识别到任何品牌，因此不计入品牌提及率分母。按每个模型的回答分别判断；提到竞品但未提到 DEGSON 的回答仍计入。原始回答保留在下方。</p>
            <ul>
              <li v-for="result in noBrandResults" :key="`${result.questionId}-${result.modelId}`">{{ state.currentRun.questions?.find(q => q.id === result.questionId)?.text || result.questionId }} <span class="quiet">（{{ state.currentRun.models.find(m => m.id === result.modelId)?.label || result.modelId }} · 未提及任何品牌）</span></li>
            </ul>
          </section>
          <p v-if="agg.okCount === 0" class="card" role="status">本轮没有可计入品牌统计的成功回答，品牌提及率和得分不适用；以下原始回答仍可查看。</p>
          <section class="metrics" aria-label="本轮概览">
            <article class="metric">
              <div class="metric-icon green">%</div>
              <div>
                <div class="metric-label">Degson 提及率（失败作答不计入总题数）</div>
                <div class="metric-value">{{ mentionHits }}<span> / {{ agg.okCount }}</span> <em>{{ agg.okCount ? (mentionHits / agg.okCount * 100).toFixed(1) + '%' : '—' }}</em></div>
                <p>仅统计成功且提及任意品牌的回答；同一回答多次只计 1</p>
                <p>本轮 {{ noBrandResults.length }} 条成功回答未提及任何品牌，不计入分母。</p>
              </div>
              <ul>
                <li v-for="item in report.rates" :key="item.id"><span>{{ item.label }}</span><b>{{ item.hits }} / {{ item.denom }}（{{ item.denom ? item.pct.toFixed(1) + '%' : '—' }}）</b></li>
              </ul>
            </article>
            <article class="metric">
              <div class="metric-icon violet">1</div>
              <div>
                <div class="metric-label">首次提及次数</div>
                <div class="metric-value">{{ firstHits }}<span> / {{ agg.okCount }}</span> <em>{{ agg.okCount ? (firstHits / agg.okCount * 100).toFixed(1) + '%' : '—' }}</em></div>
                <p>Degson 排在第 1 位的回答次数</p>
              </div>
              <ul>
                <li v-for="model in report.models" :key="model.id">
                  <span>{{ model.label }}</span>
                  <b>{{ report.rows.filter(row => row.byModel[model.id]?.rank === 1).length }} / {{ agg.okByModel[model.id] || 0 }}</b>
                </li>
              </ul>
            </article>
            <article class="metric">
              <div class="metric-icon gold">★</div>
              <div>
                <div class="metric-label">品牌综合得分</div>
                <div class="metric-value">{{ agg.okCount ? score : '—' }}<span> / 100</span> <em v-if="scoreDelta != null" :class="scoreDelta >= 0 ? 'up' : 'down'">{{ scoreDelta >= 0 ? '+' : '' }}{{ scoreDelta }}</em></div>
                <p>提及率、第 1 位占比、双模型同时提及</p>
              </div>
            </article>
            <article class="metric">
              <div class="metric-icon orange">◎</div>
              <div>
                <div class="metric-label">模型覆盖率</div>
                <div class="metric-value">{{ covered.ok }}<span> / {{ covered.total }}</span> <em>{{ covered.total ? (covered.ok / covered.total * 100).toFixed(0) : 0 }}%</em></div>
                <p>每个模型都成功作答的问题占比</p>
              </div>
            </article>
          </section>

          <section class="card">
            <div class="section-head">
              <div>
                <div class="card-title">Degson 首次提及概览</div>
                <div class="card-sub">只展示与 Degson 相关的题目。各模型先列无响应或调研失败，之后依次排位。</div>
              </div>
            </div>
            <table v-if="report.rows.length" class="focus-table">
              <thead>
                <tr>
                  <th class="narrow">#</th>
                  <th>问题</th>
                  <th v-for="model in report.models" :key="model.id">{{ model.label }}</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in report.rows" :key="row.questionId">
                  <td class="narrow">{{ index + 1 }}</td>
                  <td>{{ row.text }}</td>
                  <td v-for="model in report.models" :key="`${row.questionId}-${model.id}`" :class="{ fail: row.byModel[model.id]?.error }">{{ rankLabel(row.byModel[model.id]) }}</td>
                  <td>
                    <span v-for="name in resultNote(row).named" :key="name" class="pill">{{ name }} 提及</span>
                    <span class="quiet">{{ resultNote(row).first ? '出现在第 1 位' : '未在首次出现' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="empty-rank">本轮没有模型提到 Degson，因此没有顺位可记。</p>
          </section>

          <div class="split">
            <section class="card">
              <div class="section-head">
                <div>
                  <div class="card-title">各品牌提及率</div>
                  <div class="card-sub">仅统计成功回答中的品牌提及，调用失败不计入分母。</div>
                </div>
                <strong class="section-stat">{{ mentionHits }} / {{ agg.okCount }} 提及，{{ agg.okCount ? (mentionHits / agg.okCount * 100).toFixed(1) + '%' : '—' }}</strong>
              </div>
              <SovBars :brands="runBrands" :agg="agg" />
            </section>
            <section class="card">
              <div class="section-head">
                <div>
                  <div class="card-title">各品牌首次提及及排名</div>
                  <div class="card-sub">按提及总次数排序，只显示前 12 位；GPT / Gemini 分别计算。</div>
                </div>
              </div>
              <RankTable :brands="runBrands" :agg="agg" />
            </section>
          </div>

          <section class="card">
            <div class="card-title">模型原始回答</div>
            <div class="card-sub">以下为每个问题在 GPT 与 Gemini 模型中的原始回答结果概览，按提及顺序展示品牌（可展开查看完整内容）。</div>
            <Inspector :run="state.currentRun" :questions="state.meta?.questions || []" :brands="runBrands" />
          </section>
        </template>

        <div v-else-if="!state.running" class="empty card">
          <h2>尚无评测数据</h2>
          <p>在上方选择测试地区和模型后，点击「发起新一轮评测」。系统会按所选地区重新测试全部问题，再统计回答中的品牌曝光。</p>
        </div>
      </template>
    </main>

    <footer class="footer">
      仅供内部基线评估 · Key 仅服务端读取 · 结果落盘 data/runs/ · {{ runDate }}
    </footer>
    </div>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; background: var(--page); }
.nav {
  height: 52px;
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 0 22px;
  background: var(--nav);
  color: var(--nav-ink);
}
.nav-brand { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #fff; }
.nav-brand span {
  width: 22px; height: 22px; border-radius: 6px; background: var(--accent);
  display: inline-flex; align-items: center; justify-content: center; font-size: 12px;
}
.nav-links { display: flex; gap: 18px; font-size: 13px; }
.nav-link { color: #9aa6ba; }
.nav-link.active { color: #fff; font-weight: 650; }
.page {
  max-width: 1240px;
  margin: 0 auto;
  padding: 18px clamp(16px, 2vw, 24px) 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.topbar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 10px 0 4px;
}
.header-intro{display:flex;justify-content:space-between;align-items:center;gap:24px;flex-wrap:wrap}
.control-label{font-size:12px;color:var(--muted);white-space:nowrap}
.history-actions{min-width:0;flex:0 1 auto}
.history-select{width:328px;min-width:0;max-width:100%}
.test-settings{display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--border)}
.launch-actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width:260px;
  flex:1 0 260px;
}

.logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  flex-shrink:0;
}

h1 { font-size: 20px; letter-spacing: 0; white-space:nowrap; line-height:1.4; }

.subtitle {
  margin: 1px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.model-picker { display: flex; align-items: center; gap: 8px; }
.region-picker { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); font-size: 13px; white-space: nowrap; }
.model-option { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px; border: 1px solid var(--border-strong); border-radius: 8px; background: #fff; color: var(--ink-2); font-size: 13px; cursor: pointer; }
.model-option.on { border-color: #bfd0fb; background: var(--accent-soft); color: var(--accent); font-weight: 650; }
.model-option.unavailable { opacity: 0.5; cursor: default; }
.model-option input { margin: 0; accent-color: var(--accent); }
.run-estimate { display:flex;justify-content:space-between;gap:8px 24px;flex-wrap:wrap;margin:0;color:var(--muted);font-size:12px;line-height:1.6; }
.actions { display: flex; align-items: center; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }

.run-select, .export-btn, .run-btn { height: 34px; border-radius: 8px; font-size: 13px; }
.run-select {
  background: #fff;
  color: var(--ink-2);
  border: 1px solid var(--border-strong);
  padding: 0 10px;
  font-family: inherit;
}

.export-btn {
  background: #fff;
  color: var(--ink);
  border: 1px solid var(--border-strong);
  padding: 0 12px;
  font-weight: 650;
}

.export-btn:hover:not(:disabled) { border-color: var(--accent); }
.export-btn:disabled { opacity: 0.45; cursor: default; }
.analysis-feedback{flex-basis:100%;margin:6px 0;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#475569;font-size:13px;line-height:1.65;overflow-wrap:anywhere;text-align:left}.analysis-feedback.failed{background:#fff1f2;border-color:#fecdd3;color:#b91c1c}
.export-btn.analysis-report-btn{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:650;box-shadow:0 3px 10px #2563eb26}
.export-btn.analysis-report-btn:hover:not(:disabled){opacity:.9}
.export-btn.analysis-report-btn:focus-visible{outline:3px solid #bfd0fb;outline-offset:3px}
.export-btn.analysis-report-btn:disabled{background:#e2e8f0;border-color:#cbd5e1;color:#64748b;box-shadow:none;opacity:1}
.analysis-button-spinner{display:inline-block;width:12px;height:12px;margin-right:7px;vertical-align:middle;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:analysis-button-spin 1s linear infinite}@keyframes analysis-button-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.analysis-button-spinner{animation:none}}

.run-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 0 14px;
  font-weight: 650;
}

.run-btn:hover:not(:disabled) { opacity: 0.88; }
.run-btn:disabled { opacity: 0.5; cursor: default; }
.stop-btn { height: 34px; padding: 0 12px; border: 1px solid var(--bad); border-radius: 8px; background: #fff; color: var(--bad); font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
.stop-btn:disabled { opacity: 0.5; cursor: default; }
.stopped-banner { padding: 12px 16px; border: 1px solid #f3c9c9; border-radius: 10px; background: #fff5f5; color: #8a2e2e; font-size: 13px; line-height: 1.5; }

.content { display: flex; flex-direction: column; gap: 14px; }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.metric {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 8px 10px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 14px;
}
.metric-icon {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px;
}
.metric-icon.green { background: #e8f7ee; color: #1a8a46; }
.metric-icon.violet { background: #f1e9ff; color: #7a4de0; }
.metric-icon.gold { background: #fff6df; color: #c48a00; }
.metric-icon.orange { background: #fff1e8; color: #e07a2f; }
.metric-label { color: var(--ink-2); font-size: 13px; font-weight: 650; }
.metric-value { margin-top: 2px; font-size: 26px; line-height: 1.15; font-weight: 720; font-variant-numeric: tabular-nums; }
.metric-value span { font-size: 14px; color: var(--muted); font-weight: 550; }
.metric-value em { margin-left: 6px; font-style: normal; color: var(--accent); font-size: 14px; font-weight: 700; }
.metric-value em.up { color: var(--good); }
.metric-value em.down { color: var(--bad); }
.metric p, .metric ul { grid-column: 1 / -1; margin: 0; }
.metric p { color: var(--muted); font-size: 12px; line-height: 1.45; }
.metric ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.metric li { display: flex; justify-content: space-between; color: var(--ink-2); font-size: 12px; }
.metric b { font-variant-numeric: tabular-nums; color: var(--ink); }
.section-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.section-stat { color: var(--accent); font-size: 13px; white-space: nowrap; }
.split { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 14px; }
.pill { display: inline-flex; margin-right: 6px; padding: 2px 8px; border-radius: 999px; background: #e8f7ee; color: var(--good); font-size: 12px; font-weight: 650; }
.quiet { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
.fail { color: var(--bad); font-weight: 650; }
.narrow { width: 36px; color: var(--muted); }

.overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: clamp(16px, 3vw, 32px);
  padding: clamp(16px, 2.4vw, 22px);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
}

.overview-main { display: flex; flex-direction: column; align-items: flex-start; }
.overview-label { color: var(--accent); font-size: 12px; font-weight: 600; }
.overview-count { font-size: clamp(36px, 4.5vw, 52px); line-height: 1.1; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 6px; }
.overview-count span { font-size: 0.42em; color: var(--ink-2); font-weight: 500; }
.overview-main h2 { margin-top: 2px; font-size: 16px; line-height: 1.35; }
.overview-main p { margin: 8px 0 0; color: var(--ink-2); font-size: 13px; }
.overview-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; align-content: center; }
.overview-fact { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.overview-fact:last-child { grid-column: 1 / -1; padding-top: 10px; border-top: 1px solid var(--border); }
.overview-fact span { color: var(--ink-2); font-size: 12px; }
.overview-fact strong { color: var(--ink); font-size: 18px; line-height: 1.3; overflow-wrap: anywhere; }
.overview-fact strong.comparison { font-size: 15px; }
.overview-fact small { color: var(--muted); font-size: 12px; }
.rates-only { grid-template-columns: minmax(0, 0.7fr) minmax(0, 1fr); }
.rates-only .overview-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rates-only .overview-fact:last-child { grid-column: auto; padding-top: 0; border-top: 0; }
.focus-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.focus-table th, .focus-table td {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.focus-table th { color: var(--muted); font-weight: 550; font-size: 12px; }
.focus-table td { color: var(--ink-2); font-size: 13px; line-height: 1.45; }
.focus-table td:nth-child(n+3) { min-width: 120px; }
.empty-rank { margin: 8px 0 0; color: var(--muted); font-size: 13px; }

.charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.placeholder {
  text-align: center;
  color: var(--muted);
  padding: var(--space-8);
}

.placeholder.error { color: var(--bad); }

.empty {
  text-align: center;
  padding: 40px var(--space-6);
}

.empty h2 { font-size: 16px; margin-bottom: var(--space-2); }

.empty p {
  max-width: 560px;
  margin: 0 auto;
  color: var(--muted);
  font-size: 13px;
}

.footer {
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 1100px) {
  .metrics, .split { grid-template-columns: 1fr; }
  .nav-links { display: none; }
}
@media(max-width:720px){.header-intro{gap:16px}.brand{min-width:0;flex-basis:100%}.history-actions{width:100%;justify-content:flex-start;flex-wrap:nowrap}.history-select{flex:1;width:auto}.test-settings{gap:14px 20px}.launch-actions{margin-left:0;flex-basis:100%}.run-estimate{flex-direction:column;gap:4px}.subtitle{line-height:1.6}}
</style>
