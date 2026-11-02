export interface Question {
  excludeFromBrandEvaluation?: boolean
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
  brands: Brand[]
  models: ModelInfo[]
  regions: { id: string; label: string; detail: string }[]
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
  regionId?: string
  regionApplied?: boolean
  status: 'ok' | 'error'
  answer?: string
  modelName?: string
  latencyMs?: number
  mentions?: Mention[]
  matches?: MatchRange[]
  usage?: ResultUsage
  error?: string
  reusedFromRunId?: string
  reusedFromCreatedAt?: string
}

export interface Run {
  id: string
  createdAt: string
  regionId?: string
  regionLabel?: string
  stoppedByUser?: boolean
  stoppedAt?: string
  plannedCount?: number
  models: { id: string; label: string; model: string }[]
  questions?: Question[]
  brands?: Brand[]
  results: ResultItem[]
  reusedBaselineId?: string
  analysis?: { parserVersion: string; reanalyzed: boolean }
}

export interface RunSummary {
  id: string
  createdAt: string
  regionId?: string
  regionLabel?: string
  stoppedByUser?: boolean
  plannedCount?: number
  okCount: number
  total: number
  hasReport?: boolean
}
