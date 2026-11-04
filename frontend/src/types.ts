export interface CoverageRow { answers: number; percent: number; citations: number }
export interface SourceCoverage { official: CoverageRow; thirdParty: CoverageRow; competitor: CoverageRow; directory: CoverageRow; media: CoverageRow; distributor: CoverageRow }
export interface TargetLanding { id: string; label: string; module?: string; priority?: number; type?: string; questions: string[]; citations: number; answers: number; models: string[]; hitUrls: string[]; missingQuestions: string[] }
export interface Question {
  module?: string
  questionType?: string
  priority?: number
  productFit?: 'oem_connector' | 'consumer' | 'generic'
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

export interface Citation {
  url: string
  title?: string
  start?: number
  end?: number
  segment?: string
}

export interface RetrievalSource {
  url: string
  title?: string
}

export type SourceAuthority = 'manufacturer' | 'certification_body' | 'distributor' | 'directory' | 'trade_media' | 'blog_or_reseller' | 'unknown'
export type SourceOwnership = 'first_party' | 'third_party' | 'unknown'

export interface SourceItem {
    brands?: { brandId: string; brandName: string; relation: 'mentions' | 'supports' }[]
  url: string
  rawUrl?: string
  rawUrls?: string[]
  title: string
  host: string
  kind: string
  kindLabel: string
  authority?: SourceAuthority
  authorityLabel?: string
  ownership?: SourceOwnership
  authoritySource?: 'rule' | 'manual'
  authorityOverride?: SourceAuthority
  ownershipOverride?: SourceOwnership
  origin?: string
  origins?: string[]
  start?: number | null
  end?: number | null
  segment?: string
  degsonRelated?: boolean
}

export interface SourceRecord extends SourceItem {
    module?: string
    answerMode?: string
  questionId: string
  modelId: string
  mentioned?: boolean
  category?: string
}

export interface AuthorityRow {
  id: SourceAuthority
  label: string
  citations: number
  answers: number
  answerPercent: number
  uniqueHosts: number
  firstPartyCitations: number
  thirdPartyCitations: number
}

export interface AuthoritySummary {
  authoritativeThirdParty: { citations: number; answers: number; answerPercent: number }
  manufacturerClaims: { citations: number; answers: number; answerPercent?: number }
  lowAuthority: { citations: number; answers: number; answerPercent: number; topHosts?: { host: string; count: number; answers: number }[] }
  unknown?: { citations: number; answers: number; answerPercent: number }
}

export interface SourceKindRow {
  id: string
  label: string
  count: number
  percent: number
  answers?: number
  answerPercent?: number
  uniqueHosts?: number
}

export interface SourceHost {
  questions?: number
  host: string
  kind: string
  kindLabel: string
  count: number
  answers?: number
}

export interface SourceGroup {
  mentioned?: number
  sourced?: number
  unsourced?: number
  answers?: number
  brandAnswers?: number
  noBrandAnswers?: number
  withCitations?: number
  citationCount: number
  uniqueUrlCount?: number
  uniqueHostCount?: number
  categories: SourceKindRow[]
  byAuthority?: AuthorityRow[]
  topHosts: SourceHost[]
  items: SourceRecord[]
}

export interface SourceSummary {
    byAnswerMode?: Record<string, { questionCount: number; answerCount: number; brandAnswerCount: number; degsonMentions: number; degsonRate: number | null; sourceAnswers: number; targetHits: number }>
    byModule?: Record<string, { questionCount: number; answerCount: number; brandAnswerCount: number; degsonMentions: number; degsonRate: number | null; sourceAnswers: number; competitorAnswers: number; directoryAnswers: number; targetHits: number }>
    moduleScore?: number | null
    sourceBrands?: { brandId: string; brandName: string; citations: number; answers: number; questions: number; hosts: string[]; models: string[] }[]
    competitorSourceMap?: { brandId: string; brandName: string; host: string; kindLabel: string; citations: number; answers: number; questions: number; models: string[] }[]
  coverage?: SourceCoverage & { withSources: number }
  targetLanding?: TargetLanding[]
  hostStats?: (SourceHost & { citations: number; models: string[] })[]
  answers: number
  withCitations: number
  withoutCitations: number
  brandAnswerCount?: number
  noBrandAnswerCount?: number
  allCitationCount: number
  uniqueUrlCount?: number
  uniqueHostCount?: number
  originCounts?: Record<string, number>
  thirdPartyCount?: number
  thirdPartyShare?: number
  officialCount?: number
  officialShare?: number
  competitorCount?: number
  competitorShare?: number
  socialCount?: number
  socialShare?: number
  testCount?: number
  redirectCount?: number
  byAuthority?: AuthorityRow[]
  authoritySummary?: AuthoritySummary
  allCategories: SourceKindRow[]
  allTopHosts: SourceHost[]
  categories: SourceKindRow[]
  topHosts: SourceHost[]
  mentioned: number
  sourced: number
  unsourced: number
  citationCount: number
  models: {
    coverage?: SourceCoverage
    modelId: string
    answers: number
    withCitations: number
    mentioned: number
    sourced: number
    unsourced: number
    citations: number
    categories?: SourceKindRow[]
    byAuthority?: AuthorityRow[]
    topHosts?: SourceHost[]
    degson?: {
      mentioned: number
      sourced: number
      unsourced: number
      citationCount: number
      categories: SourceKindRow[]
      topHosts: SourceHost[]
    }
  }[]
  degson: SourceGroup
  absent: SourceGroup
  byCategory: {
    category: string
    answers: number
    withCitations: number
    citationCount?: number
    mentioned: number
    sourced: number
    unsourced: number
    counts: Record<string, number>
    categories: SourceKindRow[]
    byAuthority?: AuthorityRow[]
    topHosts: SourceHost[]
    items: SourceRecord[]
  }[]
  items: SourceRecord[]
  allItems: SourceRecord[]
  advice: string
}

export interface ResultItem {
    answerMode?: string
    answerModeSource?: 'rule' | 'manual'
    answerModeOverride?: string
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
  citations?: Citation[]
  retrievalSources?: RetrievalSource[]
  sources?: SourceItem[]
  degsonSources?: SourceItem[]
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
  sourceSummary?: SourceSummary
  degsonSourceSummary?: SourceSummary
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
