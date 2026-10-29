import type { Meta, Question, ResultItem, Run, RunSummary } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error || `请求失败（HTTP ${response.status}）`)
  return data as T
}

export const api = {
  meta: () => request<Meta>('/api/meta'),
  addQuestion: (payload: { text: string }) =>
    request<{ question: Question; questions: Question[]; maxQuestions: number }>('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  removeQuestion: (id: string) =>
    request<{ questions: Question[]; maxQuestions: number }>(`/api/questions/${id}`, { method: 'DELETE' }),
  ask: (questionId: string, modelId: string) =>
    request<ResultItem>('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, modelId })
    }),
  saveRun: (payload: Pick<Run, 'models' | 'questions' | 'results'>) =>
    request<{ id: string }>('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  runs: () => request<RunSummary[]>('/api/runs'),
  run: (id: string) => request<Run>(`/api/runs/${id}`)
}
