import { computed, reactive } from 'vue'
import { api } from '../api'
import type { Meta, ResultItem, Run, RunSummary } from '../types'

interface ProgressItem {
  questionId: string
  modelId: string
  label: string
  status: 'pending' | 'running' | 'ok' | 'error'
  error?: string
}

const state = reactive({
  meta: null as Meta | null,
  runs: [] as RunSummary[],
  currentRun: null as Run | null,
  previousRun: null as Run | null,
  loading: true,
  loadError: '',
  running: false,
  selectedModelIds: [] as string[],
  progress: [] as ProgressItem[]
})

async function init() {
  state.loading = true
  state.loadError = ''
  try {
    const [meta, runs] = await Promise.all([api.meta(), api.runs()])
    state.meta = meta
    state.selectedModelIds = meta.models.filter(m => m.configured).map(m => m.id)
    state.runs = runs
    if (runs.length > 0) await selectRun(runs[0].id)
  } catch (error) {
    state.loadError = error instanceof Error ? error.message : String(error)
  } finally {
    state.loading = false
  }
}

let selectionId = 0

async function selectRun(id: string) {
  const requestId = ++selectionId
  const index = state.runs.findIndex(run => run.id === id)
  const previousId = index >= 0 ? state.runs[index + 1]?.id : undefined
  try {
    const [currentRun, previousRun] = await Promise.all([
      api.run(id),
      previousId ? api.run(previousId) : Promise.resolve(null)
    ])
    if (requestId !== selectionId) return
    state.currentRun = currentRun
    state.previousRun = previousRun
    state.loadError = ''
  } catch (error) {
    if (requestId === selectionId) state.loadError = error instanceof Error ? error.message : String(error)
  }
}

// 仅对选中的已配置模型逐题串行执行，逐项更新进度
async function startRun() {
  if (!state.meta || state.running || state.meta.questions.length === 0) return
  const models = state.meta.models.filter(m => m.configured && state.selectedModelIds.includes(m.id))
  if (models.length === 0) return
  state.running = true
  state.progress = state.meta.questions.flatMap(q =>
    models.map(m => ({
      questionId: q.id,
      modelId: m.id,
      label: `${q.text.length > 48 ? `${q.text.slice(0, 47)}…` : q.text} × ${m.label}`,
      status: 'pending' as const
    }))
  )
  const results: ResultItem[] = []
  for (const item of state.progress) {
    item.status = 'running'
    try {
      const result = await api.ask(item.questionId, item.modelId)
      results.push(result)
      item.status = result.status
      if (result.status === 'error') item.error = result.error
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ questionId: item.questionId, modelId: item.modelId, status: 'error', error: message })
      item.status = 'error'
      item.error = message
    }
  }
  try {
    const { id } = await api.saveRun({
      models: models.map(m => ({ id: m.id, label: m.label, model: m.model })),
      questions: state.meta.questions,
      results
    })
    state.runs = await api.runs()
    await selectRun(id)
  } catch (error) {
    state.loadError = error instanceof Error ? error.message : String(error)
  } finally {
    state.running = false
  }
}

const progressDone = computed(() => state.progress.filter(p => p.status === 'ok' || p.status === 'error').length)

async function addQuestion(text: string) {
  if (!state.meta || state.running) return
  const data = await api.addQuestion({ text })
  state.meta.questions = data.questions
  state.meta.maxQuestions = data.maxQuestions
}

async function removeQuestion(id: string) {
  if (!state.meta || state.running) return
  const data = await api.removeQuestion(id)
  state.meta.questions = data.questions
  state.meta.maxQuestions = data.maxQuestions
}

export function useRun() {
  return { state, init, selectRun, startRun, addQuestion, removeQuestion, progressDone }
}
