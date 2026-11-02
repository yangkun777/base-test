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
    request<{ question: Question; questions: Question[] }>('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  removeQuestion: (id: string) =>
    request<{ questions: Question[] }>(`/api/questions/${id}`, { method: 'DELETE' }),
  clearQuestions: () =>
    request<{ questions: Question[] }>('/api/questions', { method: 'DELETE' }),
  ask: (questionId: string, modelId: string, regionId: string, signal?: AbortSignal) =>
    request<ResultItem>('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, modelId, regionId }),
      signal
    }),
  saveRun: (payload: Pick<Run, 'models' | 'questions' | 'results'> & { regionId: string; stoppedByUser: boolean }) =>
    request<{ id: string }>('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
  runs: () => request<RunSummary[]>('/api/runs'),
  run: (id: string) => request<Run>(`/api/runs/${id}`)
}
