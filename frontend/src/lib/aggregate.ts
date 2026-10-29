import type { Brand, Run } from '../types'

export interface BrandAgg {
  brandId: string
  /** 提到该品牌的回答条数（每个模型单独计，同一条回答内多次只算 1） */
  total: number
  /** 按模型拆分：该模型有多少个问题提到该品牌 */
  byModel: Record<string, number>
  appearIn: number
  top1: number
  top3: number
}

export interface RunAgg {
  byBrand: Record<string, BrandAgg>
  grandTotal: number
  questionCount: number
  modelCount: number
  slotCount: number
  okCount: number
  total: number
  models: { id: string; label: string }[]
}

export function brandsFromRun(run: Run): Brand[] {
  if (run.brands?.length) return run.brands
  const map = new Map<string, Brand>()
  for (const result of run.results) {
    for (const mention of result.mentions || []) {
      const name = mention.brandName || mention.brandId
      const self = mention.brandId === 'degson' || /degson|高松/i.test(name)
      const prev = map.get(mention.brandId)
      if (!prev || name.length > prev.name.length) {
        map.set(mention.brandId, { id: mention.brandId, name, self: self || !!prev?.self })
      } else if (self) {
        prev.self = true
      }
    }
  }
  return [...map.values()]
}

export function questionIdsOf(run: Run): string[] {
  if (run.questions?.length) return run.questions.map(question => question.id)
  return [...new Set(run.results.map(result => result.questionId))]
}

export function aggregate(run: Run, brands: Brand[]): RunAgg {
  const byBrand: Record<string, BrandAgg> = {}
  for (const brand of brands) {
    byBrand[brand.id] = { brandId: brand.id, total: 0, byModel: {}, appearIn: 0, top1: 0, top3: 0 }
  }
  const questionIds = questionIdsOf(run)
  const questionCount = questionIds.length
  const models = (run.models?.length
    ? run.models.map(model => ({ id: model.id, label: model.label }))
    : [...new Set(run.results.map(result => result.modelId))].map(id => ({ id, label: id })))
  const modelCount = models.length
  const slotCount = questionCount * modelCount
  const okResults = run.results.filter(result => result.status === 'ok')

  for (const result of okResults) {
    const seen = new Set<string>()
    for (const mention of result.mentions || []) {
      const agg = byBrand[mention.brandId]
      if (!agg || seen.has(mention.brandId)) continue
      seen.add(mention.brandId)
      agg.total += 1
      agg.appearIn += 1
      agg.byModel[result.modelId] = (agg.byModel[result.modelId] || 0) + 1
      if (mention.rank === 1) agg.top1 += 1
      if (mention.rank <= 3) agg.top3 += 1
    }
  }

  return {
    byBrand,
    grandTotal: slotCount,
    questionCount,
    modelCount,
    slotCount,
    okCount: okResults.length,
    total: run.results.length,
    models
  }
}

export function sharePct(agg: RunAgg, brandId: string): number {
  if (agg.slotCount === 0) return 0
  return (agg.byBrand[brandId]?.total || 0) / agg.slotCount * 100
}

export function modelSharePct(agg: RunAgg, brandId: string, modelId: string): number {
  if (agg.questionCount === 0) return 0
  return (agg.byBrand[brandId]?.byModel[modelId] || 0) / agg.questionCount * 100
}

function isDegsonMention(mention: { brandId?: string; brandName?: string }) {
  return mention.brandId === 'degson' || /degson|高松/i.test(mention.brandName || '')
}

export interface DegsonModelCell {
  mentioned: boolean
  rank: number | null
  before: string[]
  error: boolean
}

export interface DegsonRankRow {
  questionId: string
  text: string
  byModel: Record<string, DegsonModelCell>
}

export interface DegsonReport {
  questionCount: number
  models: { id: string; label: string }[]
  rates: { id: string; label: string; hits: number; denom: number; pct: number }[]
  rows: DegsonRankRow[]
}

export function degsonReport(run: Run): DegsonReport {
  const questionIds = questionIdsOf(run)
  const questionCount = questionIds.length
  const models = (run.models?.length
    ? run.models.map(model => ({ id: model.id, label: model.label }))
    : [...new Set(run.results.map(result => result.modelId))].map(id => ({ id, label: id })))
  const hits: Record<string, number> = Object.fromEntries(models.map(model => [model.id, 0]))
  const rows: DegsonRankRow[] = []

  for (const questionId of questionIds) {
    const text = run.questions?.find(question => question.id === questionId)?.text || questionId
    const byModel: Record<string, DegsonModelCell> = {}
    let any = false
    for (const model of models) {
      const result = run.results.find(item => item.questionId === questionId && item.modelId === model.id)
      const mentions = result?.status === 'ok' ? result.mentions || [] : []
      const mention = mentions.find(isDegsonMention)
      if (mention) {
        hits[model.id] += 1
        any = true
      }
      byModel[model.id] = {
        mentioned: !!mention,
        rank: mention?.rank ?? null,
        before: mention
          ? mentions
            .filter(item => item.rank < (mention.rank || 0))
            .sort((a, b) => a.rank - b.rank)
            .map(item => item.brandName || item.brandId)
          : [],
        error: !result || result.status !== 'ok'
      }
    }
    if (any) rows.push({ questionId, text, byModel })
  }

  return {
    questionCount,
    models,
    rates: models.map(model => {
      const count = hits[model.id] || 0
      return {
        ...model,
        hits: count,
        denom: questionCount,
        pct: questionCount ? count / questionCount * 100 : 0
      }
    }),
    rows
  }
}
