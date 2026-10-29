export interface Question {
  id: string
  topic?: string
  text: string
}

export interface Brand {
  id: string
  name: string
  self: boolean
}

export interface ModelInfo {
  id: string
  label: string
  model: string
  configured: boolean
}

export interface Meta {
  questions: Question[]
  maxQuestions: number
  brands: Brand[]
  models: ModelInfo[]
}

export interface Mention {
  brandId: string
  brandName?: string
  count: number
  firstIndex: number
  rank: number
}

export interface MatchRange {
  brandId: string
  start: number
  end: number
}

export interface ResultUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedTokens?: number
  searchQueries?: string[]
}

export interface ResultItem {
  questionId: string
  modelId: string
  status: 'ok' | 'error'
  answer?: string
  modelName?: string
  latencyMs?: number
  mentions?: Mention[]
  matches?: MatchRange[]
  usage?: ResultUsage
  error?: string
}

export interface Run {
  id: string
  createdAt: string
  models: { id: string; label: string; model: string }[]
  questions?: Question[]
  brands?: Brand[]
  results: ResultItem[]
}

export interface RunSummary {
  id: string
  createdAt: string
  okCount: number
  total: number
}
