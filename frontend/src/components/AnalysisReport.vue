<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import SourceAnalysis from './SourceAnalysis.vue'
import type { Run, SourceSummary } from '../types'

interface Rate { hits: number; denominator: number; percent: number | null }
interface Competitor { id: string; name: string; hits: number; percent: number | null; top1: number }
interface ModelRate { id: string; label: string; hits: number; denominator: number; percent: number | null; top1: number; top3: number }
interface Category {
  name: string; questionCount: number; eligibleCount: number; excludedCount: number; chineseCount: number; namedCount: number
  rate: Rate; questionRate: Rate; top1: number; top3: number; missingQuestionIds: string[]
  competitors: Competitor[]; byModel: ModelRate[]
}
interface QuestionRow { index: number; id: string; text: string; category: string; intent: string; excluded: boolean; chinese: boolean; named: boolean; competitorCount: number }
interface AnalysisRow { qid: string; who: string; degson: string; gap: string; action: string; confidence: string; evidenceLevel: string }
interface Insight { title: string; evidence: string; questionIds: string[] }
interface Gap { brand: string; topic: string; evidence: string; questionIds: string[] }
interface Action { priority: number; title: string; questionIds: string[]; changes: string[]; owner: string; deliverable: string; acceptance: string }
interface Narrative {
  headline: string; summaryPoints: string[]; strengths: Insight[]; weaknesses: Insight[]; competitorGaps: Gap[]
  categoryInsights: { category: string; insight: string; confidence: string }[]
  actions: Action[]
  roadmap: { d30: string[]; d60: string[]; d90: string[] }
  retest: string; limits: string; fallback?: boolean
}
interface Source { url: string; title: string }
interface Research { category: string; status: string; text?: string; error?: string; sources?: Source[]; searchCalls?: number }
interface Stats {
  version?: string; denominatorRule?: string
  questionCount: number; plannedCount: number; successCount: number; failedCount: number; notRunCount: number
  excludedQuestionCount: number; brandAnswerCount: number; degsonAnswerCount: number; reusedCount: number
  degsonRate: Rate; categories: Category[]; intents: { name: string; questionCount: number; excludedCount: number; rate: Rate }[]
  brands: { id: string; name: string; self: boolean; total: number; percent: number | null; top1: number; top3: number }[]
  questions: QuestionRow[]
}
interface Quality { level: 'complete' | 'partial'; reasons: string[]; missingQuestionIds: string[]; flags?: { missing: boolean; summary: boolean; research: boolean; taxonomy: boolean } }
interface Report {
  status: 'missing' | 'generating' | 'stopping' | 'stopped' | 'failed' | 'complete'
  runId: string; version?: string; createdAt?: string; completedAt?: string; model?: string; phase?: string
  meta?: { runCreatedAt?: string; regionLabel?: string; models?: string[]; plannedCount?: number; resultCount?: number }
  stats?: Stats; questionAnalysis?: AnalysisRow[]; research?: Research[]; narrative?: Narrative; quality?: Quality
  focusQuestionIds?: string[]; usage?: { calls: number; inputTokens: number; outputTokens: number }
  completedQuestions?: number; totalQuestions?: number; error?: string; stale?: boolean; legacyReport?: boolean
  estimatedCalls?: number; estimatedAnalysisCalls?: number; estimatedResearchCalls?: number
}

const props = defineProps<{ run: Run }>()
const sourceSummary = computed<SourceSummary | null>(() => props.run.sourceSummary || props.run.degsonSourceSummary || null)
const report = ref<Report | null>(null)
const preview = ref<Report | null>(null)
const loading = ref(true)
const pending = ref(false)
const stopping = ref(false)
const error = ref('')
const query = ref('')
const dialog = ref<HTMLDialogElement | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let epoch = 0

const status = computed(() => report.value?.status || (preview.value ? 'missing' : 'loading'))
const generating = computed(() => status.value === 'generating' || status.value === 'stopping' || stopping.value)
const busy = computed(() => pending.value || generating.value)
const complete = computed(() => status.value === 'complete')
const quality = computed(() => report.value?.quality)
const partial = computed(() => complete.value && quality.value?.level === 'partial')
const actionable = computed(() => {
  const flags = quality.value?.flags
  return !!flags && (flags.missing || flags.summary || flags.research)
})
const failed = computed(() => status.value === 'failed' || !!error.value)
const hasContent = computed(() => !!report.value && ['complete', 'failed', 'stopped'].includes(report.value.status) && !!report.value.stats)
const label = computed(() => {
  if (loading.value) return '读取报告…'
  if (stopping.value) return '正在停止…'
  if (generating.value) return `报告生成中…${report.value?.completedQuestions ? `（${report.value.completedQuestions}/${report.value.totalQuestions || '?'} 题）` : ''}`
  if (hasContent.value) return '查看分析报告'
  return preview.value?.estimatedCalls ? `生成分析报告（预计 ${preview.value.estimatedCalls} 次调用）` : '生成分析报告'
})
const feedback = computed(() => {
  if (error.value) return `操作失败：${error.value}`
  if (status.value === 'failed') return `生成失败：${report.value?.error || '接口没有返回具体原因'}。已完成 ${report.value?.completedQuestions || 0} / ${report.value?.stats?.questionCount || 0} 题。`
  if (status.value === 'stopped') return `已停止。已完成 ${report.value?.completedQuestions || 0} / ${report.value?.stats?.questionCount || 0} 题，可继续生成。`
  if (preview.value?.legacyReport) return '该轮次只有旧版（v2）报告，v3 不读取旧报告，需要重新生成。'
  if (partial.value) return `报告已生成，但部分内容未完成：${(quality.value?.reasons || []).join('；')}。继续生成会复用已完成部分。`
  if (report.value?.stale) return '本轮数据或分析标准已变化，建议重新生成报告。'
  return ''
})
const metaLine = computed(() => {
  const value = report.value
  if (!value?.completedAt) return ''
  const when = new Date(value.completedAt).toLocaleString('zh-CN', { hour12: false })
  return `已生成于 ${when} · ${value.stats?.questionCount || 0} 题 · 查看不消耗 Key`
})

const analysisById = computed(() => Object.fromEntries((report.value?.questionAnalysis || []).map(row => [row.qid, row])))
const ranked = computed(() => [...(report.value?.stats?.categories || [])].filter(category => category.rate.denominator > 0).sort((a, b) => (b.rate.percent ?? 0) - (a.rate.percent ?? 0)))
const strongest = computed(() => ranked.value[0])
const weakest = computed(() => [...ranked.value].reverse()[0])
const focusRows = computed(() => {
  const rows: { question: QuestionRow; analysis: AnalysisRow }[] = []
  for (const id of report.value?.focusQuestionIds || []) {
    const question = report.value?.stats?.questions.find(row => row.id === id)
    const analysis = analysisById.value[id]
    if (question && analysis) rows.push({ question, analysis })
  }
  return rows
})
const narrative = computed(() => report.value?.narrative)
const strengths = computed(() => narrative.value?.strengths || [])
const weaknesses = computed(() => narrative.value?.weaknesses || [])
const competitorGaps = computed(() => narrative.value?.competitorGaps || [])
const categoryInsights = computed(() => narrative.value?.categoryInsights || [])
const actions = computed(() => narrative.value?.actions || [])
const roadmap = computed(() => narrative.value?.roadmap)
const categoryQuestions = computed(() => (report.value?.stats?.categories || []).map(category => ({
  category,
  rows: (report.value?.stats?.questions || [])
    .filter(question => question.category === category.name)
    .filter(question => {
      const needle = query.value.trim().toLowerCase()
      if (!needle) return true
      const analysis = analysisById.value[question.id]
      return `${question.id} ${question.text} ${analysis?.who || ''} ${analysis?.gap || ''} ${analysis?.action || ''}`.toLowerCase().includes(needle)
    })
    .map(question => ({ question, analysis: analysisById.value[question.id] }))
})))
const usageLine = computed(() => {
  const usage = report.value?.usage
  if (!usage?.calls) return ''
  return `${usage.calls} 次调用 · 输入 ${usage.inputTokens.toLocaleString()} / 输出 ${usage.outputTokens.toLocaleString()} tokens`
})
const showResume = computed(() => !!report.value && (report.value.status === 'failed' || report.value.status === 'stopped'))

function modelPercent(category: Category, id: string) {
  const model = category.byModel.find(item => item.id === id)
  return model?.denominator ? `${model.percent}%（${model.hits}/${model.denominator}）` : '—'
}

function percent(value?: Rate) {
  return value?.percent == null ? '—' : `${value.percent}%`
}
function rateText(value?: Rate) {
  return !value || value.denominator === 0 ? '—' : `${value.hits}/${value.denominator}（${value.percent}%）`
}
function showReport() {
  if (dialog.value && !dialog.value.open) dialog.value.showModal()
}
function closeReport() {
  dialog.value?.close()
}
function shellClick(event: MouseEvent) {
  if (event.target === dialog.value) closeReport()
}

async function fetchReport(method: 'GET' | 'POST', token: number, suffix = '') {
  const response = await fetch(`/api/runs/${props.run.id}/analysis${suffix}`, { method, cache: 'no-store' })
  const data = await response.json() as Report & { error?: string; legacyReport?: boolean }
  if (!response.ok) throw new Error(data.error || '读取分析报告失败')
  if (token !== epoch) return
  clearTimeout(timer)
  if (data.status === 'missing') {
    preview.value = data
    report.value = null
  } else {
    report.value = data
    preview.value = null
  }
  if (['generating', 'stopping'].includes(data.status)) {
    timer = setTimeout(() => {
      fetchReport('GET', token).catch(caught => { if (token === epoch) { error.value = caught instanceof Error ? caught.message : String(caught) } })
    }, 2500)
  }
}

async function generate(regenerate = false) {
  if (loading.value || busy.value) return
  const token = epoch
  pending.value = true
  error.value = ''
  try {
    await fetchReport('POST', token, regenerate ? '?regenerate=1' : '')
    showReport()
  } catch (caught) {
    if (token === epoch) {
      error.value = caught instanceof Error ? caught.message : String(caught)
      showReport()
    }
  } finally {
    if (token === epoch) pending.value = false
  }
}

async function regenerate() {
  if (busy.value || loading.value) return
  if (!window.confirm('重新生成会重新调用模型并产生费用，已完成的内容不会复用。确定继续？')) return
  await generate(true)
}

async function stop() {
  if (!busy.value || stopping.value) return
  clearTimeout(timer)
  const token = ++epoch
  stopping.value = true
  try {
    const response = await fetch(`/api/runs/${props.run.id}/analysis/stop`, { method: 'POST', cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '停止失败')
    if (token === epoch) report.value = data
  } catch (caught) {
    if (token === epoch) error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    if (token === epoch) stopping.value = false
  }
}

function activate() {
  if (loading.value) return
  if (hasContent.value) showReport()
  else void generate()
}
function downloadWord() {
  if (!report.value || report.value.status !== 'complete') return
  window.location.href = `/api/runs/${props.run.id}/analysis/export.docx`
}

watch(() => props.run.id, async () => {
  closeReport()
  const token = ++epoch
  clearTimeout(timer)
  report.value = null
  preview.value = null
  error.value = ''
  loading.value = true
  pending.value = false
  stopping.value = false
  query.value = ''
  try { await fetchReport('GET', token) } catch (caught) { if (token === epoch) error.value = caught instanceof Error ? caught.message : String(caught) } finally { if (token === epoch) loading.value = false }
}, { immediate: true })

let deepLinkOpened = false
watch([loading, hasContent], ([isLoading, hasContentValue]) => {
  if (deepLinkOpened || isLoading || !hasContentValue) return
  if (new URLSearchParams(window.location.search).get('report') !== '1') return
  deepLinkOpened = true
  showReport()
})

onBeforeUnmount(() => { closeReport(); epoch++; clearTimeout(timer) })

defineExpose({ label, busy, loading, feedback, failed, activate, generate, stop, stopping, hasContent })
</script>

<template>
  <dialog ref="dialog" class="report-dialog" aria-labelledby="report-title" @cancel.prevent="closeReport" @click="shellClick">
    <div class="report-shell">
      <header class="report-top">
        <div class="report-heading">
          <p class="eyebrow">DEGSON GEO ANALYSIS</p>
          <h2 id="report-title">GEO 分析报告</h2>
          <p class="meta">
            <span>{{ report?.meta?.regionLabel || run.regionLabel || '未记录地区' }}</span>
            <span>{{ report?.meta?.runCreatedAt ? new Date(report.meta.runCreatedAt).toLocaleString('zh-CN', { hour12: false }) : new Date(run.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
            <span>{{ report?.stats?.questionCount || 0 }} 题</span>
            <span>{{ report?.stats?.successCount || 0 }}/{{ report?.stats?.plannedCount || 0 }} 次成功</span>
            <span v-if="report?.model">{{ report.model }}</span>
            <span v-if="metaLine">{{ metaLine }}</span>
          </p>
        </div>
        <div class="report-nav">
          <button v-if="actionable && complete" class="ghost" :disabled="busy" @click="generate()">继续补全</button>
          <button v-if="complete" class="ghost" :disabled="busy" @click="downloadWord">导出 Word</button>
          <button class="ghost" @click="closeReport">关闭 ✕</button>
        </div>
      </header>

      <div v-if="loading" class="report-state">正在读取报告…</div>
      <div v-else-if="!report" class="report-state">
        <p>{{ feedback || '本轮还没有生成分析报告。' }}</p>
        <button v-if="!busy" class="primary" @click="generate()">生成分析报告</button>
      </div>

      <div v-else class="report-body">
        <aside class="toc" aria-label="报告目录">
          <p class="toc-title">目录</p>
          <a href="#r-summary">执行摘要</a>
          <a href="#r-stats">1 分类与提及率</a>
          <a href="#r-questions">2 逐题分析</a>
          <a href="#r-focus">　重点题深挖</a>
          <a href="#r-gap">3 优劣势与竞品</a>
          <a href="#r-actions">4 下一步行动</a>
          <a href="#r-method">5 方法与证据</a>
          <p v-if="usageLine" class="usage">{{ usageLine }}</p>
          <p v-if="report?.quality?.level === 'partial'" class="quality-dot">部分完成</p>
          <p v-else class="quality-dot ok">完整</p>
        </aside>

        <main class="report-main">
          <div v-if="generating" class="banner">
            正在生成：{{ report?.phase || '准备' }}。已完成 {{ report?.completedQuestions || 0 }} / {{ report?.stats?.questionCount || 0 }} 题。关闭页面不会中断。
            <button class="link" :disabled="stopping" @click="stop">{{ stopping ? '正在停止…' : '停止生成' }}</button>
          </div>
          <div v-if="showResume" class="banner warn">
            {{ report?.status === 'stopped' ? '已停止生成' : '生成失败' }}：{{ report?.error || '可继续生成。' }}已完成 {{ report?.completedQuestions || 0 }} / {{ report?.stats?.questionCount || 0 }} 题。
            <button class="link" :disabled="busy" @click="generate()">继续生成（复用已完成部分）</button>
          </div>
          <div v-if="report?.quality?.level === 'partial'" class="banner warn">
            本报告为部分完成：{{ report.quality?.reasons?.join('；') }}。
            <button v-if="actionable" class="link" :disabled="busy" @click="generate()">继续生成（复用已完成部分）</button>
          </div>
          <div v-if="report?.stale" class="banner warn">本轮数据或分析标准已变化，当前报告可能过期。
            <button class="link" :disabled="busy" @click="regenerate()">重新生成</button>
          </div>

          <section id="r-summary" class="section">
            <div class="kpis">
              <div class="kpi"><span>模块加权分</span><strong>{{ sourceSummary?.moduleScore == null ? '—' : `${sourceSummary.moduleScore}%` }}</strong><small>仅用于内部优先级</small></div>
              <div class="kpi"><span>最弱分类</span><strong>{{ weakest?.name || '—' }}</strong><small>{{ weakest ? rateText(weakest.rate) : '无有效回答' }}</small></div>
              <div class="kpi"><span>最强分类</span><strong>{{ strongest?.name || '—' }}</strong><small>{{ strongest ? rateText(strongest.rate) : '无有效回答' }}</small></div>
              <div class="kpi"><span>有效品牌回答</span><strong>{{ report?.stats?.brandAnswerCount || 0 }}</strong><small>计划 {{ report?.stats?.plannedCount || 0 }} 次 · 失败 {{ report?.stats?.failedCount || 0 }}</small></div>
              <div class="kpi"><span>引用来源</span><strong>{{ sourceSummary?.withCitations || 0 }} / {{ sourceSummary?.answers || 0 }}</strong><small>有引用 / 成功回答 · 共 {{ sourceSummary?.allCitationCount || 0 }} 条</small></div>
            </div>
            <h3>模块表现</h3>
            <div class="table-wrap"><table class="stats-table"><thead><tr><th>模块</th><th>题数</th><th>品牌回答</th><th>DEGSON 提及</th><th>提及率</th><th>有来源</th><th>目标页命中</th></tr></thead><tbody><tr v-for="(stat,name) in sourceSummary?.byModule || {}" :key="name"><td>{{ name }}</td><td>{{ stat.questionCount }}</td><td>{{ stat.brandAnswerCount }}</td><td>{{ stat.degsonMentions }}</td><td>{{ stat.degsonRate == null ? '—' : `${stat.degsonRate}%` }}</td><td>{{ stat.sourceAnswers }}</td><td>{{ stat.targetHits }}</td></tr></tbody></table></div>
            <h3>执行摘要</h3>
            <p class="headline">{{ narrative?.headline || '汇总内容尚未生成。' }}</p>
            <ul v-if="narrative?.summaryPoints?.length" class="points">
              <li v-for="(point, index) in narrative.summaryPoints" :key="index">{{ point }}</li>
            </ul>
            <p v-if="narrative?.fallback" class="quiet">AI 汇总未完成，本段由系统根据已完成统计和逐题分析生成。</p>
            <p v-if="report?.stats?.reusedCount" class="quiet">本轮有 {{ report.stats.reusedCount }} 条回答沿用旧轮次。</p>
            <SourceAnalysis v-if="sourceSummary" :summary="sourceSummary" />
          </section>

          <section id="r-stats" class="section">
            <h3>1. 问题分类与提及率</h3>
            <p class="quiet">分母为成功且提及任意品牌的回答；失败调用和未提及任何品牌的回答不计入。题目级提及率以至少一个模型成功且提及任意品牌的题为分母。</p>
            <div class="table-wrap">
              <table class="stats-table">
                <thead><tr><th>分类</th><th>题数 / 有效</th><th>提及</th><th>提及率</th><th>GPT</th><th>Gemini</th><th>第 1 / 前 3</th><th>主要竞品</th></tr></thead>
                <tbody>
                  <tr v-for="category in report?.stats?.categories || []" :key="category.name">
                    <td class="strong">{{ category.name }}<span v-if="category.missingQuestionIds.length" class="tag">{{ category.missingQuestionIds.length }} 题缺席</span></td>
                    <td>{{ category.questionCount }} / {{ category.eligibleCount }}</td>
                    <td>{{ category.rate.hits }}</td>
                    <td><div class="rate"><span>{{ percent(category.rate) }}</span><i><b :style="{ width: `${Math.min(100, category.rate.percent || 0)}%` }"></b></i></div></td>
                    <td>{{ modelPercent(category, 'gpt') }}</td>
                    <td>{{ modelPercent(category, 'gemini') }}</td>
                    <td>{{ category.top1 }} / {{ category.top3 }}</td>
                    <td class="small">{{ category.competitors.filter(item => item.hits > 0).slice(0, 2).map(item => `${item.name} ${item.hits}`).join('、') || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="report?.stats?.excludedQuestionCount" class="quiet">已排除 {{ report.stats.excludedQuestionCount }} 道方法题（回答中未提及任何品牌，不用于品牌归因）。</p>
            <div v-if="report?.stats?.intents?.length" class="table-wrap">
              <table class="stats-table compact">
                <thead><tr><th>问题意图</th><th>题数</th><th>排除</th><th>提及率</th></tr></thead>
                <tbody><tr v-for="intent in report.stats.intents" :key="intent.name"><td>{{ intent.name }}</td><td>{{ intent.questionCount }}</td><td>{{ intent.excludedCount }}</td><td>{{ rateText(intent.rate) }}</td></tr></tbody>
              </table>
            </div>
          </section>

          <section id="r-questions" class="section">
            <div class="section-head">
              <div><h3>2. 逐题分析</h3><p class="quiet">每题固定字段：模型实际推荐、DEGSON 表现、归因、动作、置信度。E1=本轮回答，E2=本轮联网，E3=事实卡，E4=推测。</p></div>
              <input v-model="query" class="search" type="search" placeholder="搜索题号、品牌或动作" aria-label="搜索逐题分析" />
            </div>
            <details v-for="(group, index) in categoryQuestions" :key="group.category.name" class="category-block" :open="index === 0">
              <summary>
                <span class="strong">{{ group.category.name }}</span>
                <span class="small">{{ group.category.questionCount }} 题 · 提及率 {{ rateText(group.category.rate) }} · {{ group.category.missingQuestionIds.length }} 题缺席</span>
              </summary>
              <div v-if="group.rows.length" class="table-wrap">
                <table class="question-table">
                  <thead><tr><th>题号 / 问题</th><th>模型实际推荐了谁</th><th>DEGSON / 归因</th><th>下一步动作</th><th>置信度</th></tr></thead>
                  <tbody>
                    <tr v-for="item in group.rows" :key="item.question.id">
                      <td><span class="qid">{{ item.question.id }}</span><span v-if="item.question.excluded" class="tag">方法题</span><p>{{ item.question.text }}</p></td>
                      <td>{{ item.analysis?.who || '未完成分析' }}</td>
                      <td><p>{{ item.analysis?.degson || '—' }}</p><span v-if="item.analysis" class="gap">{{ item.analysis.gap }}</span></td>
                      <td>{{ item.analysis?.action || '—' }}</td>
                      <td><span class="confidence" :class="item.analysis?.confidence">{{ item.analysis?.confidence || '—' }}</span><small>{{ item.analysis?.evidenceLevel || '' }}</small></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="quiet">没有匹配的题目。</p>
            </details>
          </section>

          <section id="r-focus" class="section">
            <h3>重点题深挖</h3>
            <p class="quiet">按分类缺口和竞品出现强度挑选，最多 12 题。</p>
            <div v-if="focusRows.length" class="focus-grid">
              <article v-for="item in focusRows" :key="item.question.id" class="focus-card">
                <p class="qid">{{ item.question.id }} · {{ item.question.category }}</p>
                <h4>{{ item.question.text }}</h4>
                <p><b>模型推荐：</b>{{ item.analysis.who }}</p>
                <p><b>DEGSON：</b>{{ item.analysis.degson }}</p>
                <p><b>归因：</b>{{ item.analysis.gap }} · 置信度 {{ item.analysis.confidence }}（{{ item.analysis.evidenceLevel }}）</p>
                <p><b>下一步：</b>{{ item.analysis.action }}</p>
              </article>
            </div>
            <p v-else class="quiet">本轮没有可用的重点题。</p>
          </section>

          <section id="r-gap" class="section">
            <h3>3. 优势、劣势与竞品差距</h3>
            <div class="two-col">
              <div class="panel good">
                <h4>本轮优势</h4>
                <div v-for="(item, index) in strengths" :key="index" class="insight">
                  <p class="strong">{{ item.title }}</p><p>{{ item.evidence }}</p><p class="quiet">{{ (item.questionIds || []).join('、') }}</p>
                </div>
                <p v-if="!strengths.length" class="quiet">本轮样本未覆盖。</p>
              </div>
              <div class="panel bad">
                <h4>本轮劣势</h4>
                <div v-for="(item, index) in weaknesses" :key="index" class="insight">
                  <p class="strong">{{ item.title }}</p><p>{{ item.evidence }}</p><p class="quiet">{{ (item.questionIds || []).join('、') }}</p>
                </div>
                <p v-if="!weaknesses.length" class="quiet">本轮样本未覆盖。</p>
              </div>
            </div>
            <h4>竞品差距</h4>
            <div class="table-wrap">
              <table class="stats-table compact">
                <thead><tr><th>品牌</th><th>主题</th><th>本轮证据</th><th>题号</th></tr></thead>
                <tbody><tr v-for="(item, index) in competitorGaps" :key="index"><td>{{ item.brand }}</td><td>{{ item.topic }}</td><td>{{ item.evidence }}</td><td class="small">{{ (item.questionIds || []).join('、') || '—' }}</td></tr></tbody>
              </table>
            </div>
            <div v-if="categoryInsights.length" class="table-wrap">
              <table class="stats-table compact">
                <thead><tr><th>分类</th><th>结论</th><th>置信度</th></tr></thead>
                <tbody><tr v-for="item in categoryInsights" :key="item.category"><td>{{ item.category }}</td><td>{{ item.insight }}</td><td>{{ item.confidence }}</td></tr></tbody>
              </table>
            </div>
          </section>

          <section id="r-actions" class="section">
            <h3>4. 下一步行动</h3>
            <article v-for="action in actions" :key="action.priority" class="action">
              <div class="action-head"><span class="priority">{{ action.priority }}</span><h4>{{ action.title }}</h4></div>
              <p v-if="action.questionIds?.length" class="quiet">针对题号：{{ action.questionIds.join('、') }}</p>
              <ul><li v-for="(change, index) in action.changes || []" :key="index">{{ change }}</li></ul>
              <p><b>建议职能：</b>{{ action.owner || '待指派' }}　<b>交付物：</b>{{ action.deliverable || '待定义' }}</p>
              <p><b>验收：</b>{{ action.acceptance || '待定义' }}</p>
            </article>
            <div v-if="roadmap" class="roadmap">
              <div><h4>30 天</h4><ul><li v-for="(item, index) in roadmap.d30" :key="index">{{ item }}</li></ul></div>
              <div><h4>60 天</h4><ul><li v-for="(item, index) in roadmap.d60" :key="index">{{ item }}</li></ul></div>
              <div><h4>90 天</h4><ul><li v-for="(item, index) in roadmap.d90" :key="index">{{ item }}</li></ul></div>
            </div>
            <h4>复测方案</h4>
            <p>{{ narrative?.retest }}</p>
          </section>

          <section id="r-method" class="section">
            <h3>5. 方法与证据</h3>
            <p>{{ narrative?.limits }}</p>
            <p class="quiet">统计口径：{{ report?.stats?.denominatorRule }}；报告版本 {{ report?.version }}。失败调用不计入提及率分母；单轮结果不能证明因果关系。</p>
            <div v-for="item in report?.research || []" :key="item.category" class="research">
              <h4>{{ item.category }} · <span :class="{ ok: item.status === 'complete' }">{{ item.status === 'complete' ? '已联网核查' : item.status === 'unverified' ? '未取得可核验来源' : '未完成' }}</span></h4>
              <p v-if="item.text" class="research-text">{{ item.text }}</p>
              <p v-if="item.error" class="quiet">{{ item.error }}</p>
              <ul v-if="item.sources?.length"><li v-for="source in item.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title || source.url }}</a></li></ul>
            </div>
          </section>
        </main>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.report-dialog{position:fixed;inset:0;width:100vw;max-width:none;height:100vh;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:var(--page);color:var(--ink)}
.report-dialog::backdrop{background:#0f172a80;backdrop-filter:blur(2px)}
.report-shell{height:100%;display:flex;flex-direction:column;min-height:0}
.report-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:18px clamp(16px,3vw,34px);border-bottom:1px solid var(--border);background:#fff}
.report-heading h2{font-size:20px;margin:2px 0 4px}
.eyebrow{margin:0;color:var(--accent);font-size:11px;font-weight:700;letter-spacing:.08em}
.meta{display:flex;flex-wrap:wrap;gap:4px 14px;margin:0;color:var(--muted);font-size:12px}
.report-nav{display:flex;gap:8px;flex-shrink:0}
.ghost,.primary,.link{border:1px solid var(--border-strong);border-radius:8px;background:#fff;color:var(--ink);padding:8px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.ghost:disabled,.primary:disabled{opacity:.5;cursor:default}
.link{padding:0;border:0;background:transparent;color:var(--accent);text-decoration:underline}
.report-state{padding:60px 24px;text-align:center;color:var(--muted)}
.report-state .primary{margin-top:16px}
.report-body{flex:1;display:grid;grid-template-columns:210px minmax(0,1fr);min-height:0}
.toc{overflow:auto;padding:22px 18px;border-right:1px solid var(--border);background:#fff;position:sticky;top:0}
.toc-title{margin:0 0 10px;font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.08em}
.toc a{display:block;padding:7px 8px;border-radius:6px;color:var(--ink-2);font-size:13px;text-decoration:none}
.toc a:hover{background:var(--accent-soft);color:var(--accent)}
.usage{margin:16px 8px 0;color:var(--muted);font-size:10px;line-height:1.6}
.quality-dot{margin:8px;padding:3px 8px;border-radius:999px;background:#fff1e8;color:#b45309;font-size:10px;font-weight:700;display:inline-block}
.quality-dot.ok{background:#e8f7ee;color:#1a8a46}
.report-main{overflow:auto;padding:22px clamp(16px,3vw,32px) 80px;max-width:1120px;width:100%}
.banner{margin:0 0 14px;padding:10px 14px;border:1px solid #bfd0fb;border-radius:8px;background:#eff4ff;color:#1e3a8a;font-size:13px;line-height:1.7}
.banner.warn{border-color:#fcd9a8;background:#fff8ed;color:#92400e}
.section{padding:18px 0;border-bottom:1px solid var(--border);scroll-margin-top:16px}
.section h3{font-size:17px;margin:0 0 8px}
.section h4{font-size:14px;margin:16px 0 6px}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}
.kpi{border:1px solid var(--border);border-radius:10px;padding:12px 14px;background:#fff}
.kpi span{display:block;color:var(--muted);font-size:11px}
.kpi strong{display:block;margin:3px 0 1px;font-size:22px;line-height:1.2}
.kpi small{color:var(--muted);font-size:11px}
.headline{margin:8px 0;padding:12px 14px;border-left:3px solid var(--accent);border-radius:0 8px 8px 0;background:var(--accent-soft);font-size:14px;line-height:1.8}
.points{margin:8px 0;padding-left:20px;color:var(--ink-2);font-size:13px;line-height:1.85}
.quiet{color:var(--muted);font-size:12px;line-height:1.7}
.source-box{margin-top:14px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:#f7f9fc}
.source-box h3{margin:0 0 6px;font-size:14px}
.source-mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px;margin:8px 0}
.source-mini > div{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--ink-2)}
.source-mini b{font-variant-numeric:tabular-nums}
.small{font-size:12px;color:var(--ink-2)}
.strong{font-weight:700}
.table-wrap{overflow:auto;border:1px solid var(--border);border-radius:8px;margin:8px 0}
table{width:100%;border-collapse:collapse;font-size:12px;line-height:1.55}
th,td{padding:8px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--border)}
th{background:var(--surface-3);color:var(--ink-2);font-weight:650;white-space:nowrap}
td{color:var(--ink-2)}
tbody tr:last-child td{border-bottom:0}
.stats-table{min-width:900px}
.stats-table.compact{min-width:620px}
.question-table{min-width:960px}
.question-table td p{margin:0 0 4px}
.question-table td:nth-child(2),.question-table td:nth-child(4){min-width:220px}
.qid{display:inline-block;margin-right:6px;padding:1px 6px;border-radius:4px;background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:700}
.rate{min-width:90px}
.rate span{display:block;font-variant-numeric:tabular-nums;font-weight:650}
.rate i{display:block;height:4px;margin-top:4px;border-radius:999px;background:var(--surface-3);overflow:hidden}
.rate b{display:block;height:100%;background:var(--accent)}
.tag{display:inline-block;margin:2px 0 0 6px;padding:1px 6px;border-radius:999px;background:#fff1e8;color:#b45309;font-size:10px;font-weight:650;white-space:nowrap}
.gap{display:inline-block;margin-top:4px;padding:2px 7px;border-radius:999px;background:#f1e9ff;color:#6d28d9;font-size:10px;font-weight:650}
.confidence{display:inline-block;padding:1px 7px;border-radius:999px;background:var(--surface-3);font-size:11px}
.confidence.高{background:#e8f7ee;color:#1a8a46}
.confidence.中{background:#fff6df;color:#a16207}
.confidence.低{background:#fff1f2;color:#b91c1c}
.search{height:34px;min-width:220px;padding:0 10px;border:1px solid var(--border-strong);border-radius:8px;font:inherit;font-size:13px}
.section-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
.category-block{border:1px solid var(--border);border-radius:10px;margin:8px 0;overflow:hidden;background:#fff}
.category-block summary{cursor:pointer;padding:11px 14px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;background:var(--surface-3);list-style:none}
.category-block summary::-webkit-details-marker{display:none}
.category-block[open] summary{border-bottom:1px solid var(--border)}
.category-block .table-wrap{border:0;border-radius:0;margin:0}
.focus-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.focus-card{border:1px solid var(--border);border-radius:10px;padding:14px;background:#fff;font-size:13px;line-height:1.7}
.focus-card h4{margin:6px 0 8px;font-size:14px;line-height:1.6}
.focus-card p{margin:4px 0}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.panel{border:1px solid var(--border);border-radius:10px;padding:14px;background:#fff}
.panel.good{border-top:3px solid #1a8a46}
.panel.bad{border-top:3px solid #b91c1c}
.panel h4{margin-top:0}
.insight{padding:8px 0;border-bottom:1px dashed var(--border)}
.insight:last-child{border-bottom:0}
.insight p{margin:2px 0;font-size:13px;line-height:1.7}
.action{border:1px solid var(--border);border-radius:10px;padding:14px;margin:10px 0;background:#fff}
.action-head{display:flex;align-items:center;gap:10px}
.action-head h4{margin:0;font-size:15px}
.priority{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-size:12px;font-weight:700;flex-shrink:0}
.action ul{margin:8px 0;padding-left:20px;font-size:13px;line-height:1.8}
.action p{margin:5px 0;font-size:13px;line-height:1.7}
.roadmap{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:10px 0}
.roadmap>div{border:1px solid var(--border);border-radius:10px;padding:12px;background:#fff}
.roadmap h4{margin:0 0 6px}
.roadmap ul{margin:0;padding-left:18px;font-size:12px;line-height:1.75}
.research{margin-top:12px;padding-top:10px;border-top:1px dashed var(--border)}
.research h4{margin:0 0 4px}
.research h4 .ok{color:#1a8a46}
.research-text{white-space:pre-wrap;font-size:12px;line-height:1.75;color:var(--ink-2);max-height:280px;overflow:auto;background:var(--surface-3);padding:10px;border-radius:8px}
.research ul{margin:6px 0;padding-left:18px;font-size:12px;line-height:1.8}
a{color:var(--accent)}
@media (max-width:900px){.report-body{grid-template-columns:1fr}.toc{display:none}.kpis{grid-template-columns:1fr 1fr}.two-col{grid-template-columns:1fr}.roadmap{grid-template-columns:1fr}.report-top{flex-direction:column}.report-nav{width:100%;justify-content:flex-end}}
</style>
