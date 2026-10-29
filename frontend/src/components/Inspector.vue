<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Brand, MatchRange, Question, ResultItem, Run } from '../types'
import { brandColor } from '../lib/palette'

const props = defineProps<{ run: Run; questions: Question[]; brands: Brand[] }>()

const expanded = ref<Record<string, boolean>>({})

function toggle(key: string) {
  expanded.value[key] = !expanded.value[key]
}

const groups = computed(() => {
  const known = new Map((props.run.questions || props.questions).map(question => [question.id, question]))
  const ids = [...new Set(props.run.results.map(result => result.questionId))]
  return ids.map(id => ({
    question: known.get(id) || { id, text: '该问题已从题库移除' },
    results: props.run.results.filter(result => result.questionId === id)
  }))
})

function modelLabel(modelId: string): string {
  return props.run.models.find(m => m.id === modelId)?.label || modelId
}

function brandName(brandId: string, fallback?: string): string {
  return props.brands.find(b => b.id === brandId)?.name || fallback || brandId
}

interface Segment {
  text: string
  brandId?: string
}

// 按服务端返回的命中区间切分原文，模板里逐段渲染（不走 v-html）
function segments(result: ResultItem): Segment[] {
  const answer = result.answer || ''
  const out: Segment[] = []
  let cursor = 0
  for (const match of (result.matches || []) as MatchRange[]) {
    if (match.start < cursor) continue
    if (match.start > cursor) out.push({ text: answer.slice(cursor, match.start) })
    out.push({ text: answer.slice(match.start, match.end), brandId: match.brandId })
    cursor = match.end
  }
  if (cursor < answer.length) out.push({ text: answer.slice(cursor) })
  return out
}

function markStyle(brandId: string) {
  const color = brandColor(brandId, brandId === 'degson')
  return {
    background: `${color}2e`,
    boxShadow: `inset 0 -2px 0 ${color}`,
    color: 'var(--ink)'
  }
}
</script>

<template>
  <div class="inspector">
    <article v-for="(group, index) in groups" :key="group.question.id" class="question-block">
      <button class="question-head" :aria-expanded="!!expanded[group.question.id]" @click="toggle(group.question.id)">
        <span class="q-index">{{ index + 1 }}</span>
        <span class="question-text">{{ group.question.text }}</span>
        <span class="chevron" :class="{ open: expanded[group.question.id] }">⌃</span>
      </button>
      <div class="answers">
        <div v-for="result in group.results" :key="`${result.questionId}-${result.modelId}`" class="model-line">
          <span class="model-name" :class="result.modelId">{{ modelLabel(result.modelId) }}</span>
          <span v-if="result.status === 'ok'" class="meta-info">
            <span
              v-for="mention in result.mentions"
              :key="mention.brandId"
              class="mention-chip"
              :style="{ color: brandColor(mention.brandId, mention.brandId === 'degson'), background: `${brandColor(mention.brandId, mention.brandId === 'degson')}18` }"
            >
              <i>{{ mention.rank }}</i>{{ brandName(mention.brandId, mention.brandName) }}
            </span>
            <span v-if="!result.mentions?.length" class="no-mention">未抽到品牌</span>
          </span>
          <span v-else class="error-info">调研失败：{{ result.error }}</span>
        </div>
      </div>
      <div v-if="expanded[group.question.id]" class="full">
        <div v-for="result in group.results" :key="`full-${result.modelId}`" class="answer-body">
          <strong>{{ modelLabel(result.modelId) }}</strong>
          <template v-if="result.status === 'ok'">
            <template v-for="(seg, i) in segments(result)" :key="i">
              <mark v-if="seg.brandId" :style="markStyle(seg.brandId)">{{ seg.text }}</mark>
              <span v-else>{{ seg.text }}</span>
            </template>
          </template>
          <span v-else>{{ result.error }}</span>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.inspector { display: flex; flex-direction: column; gap: 10px; }
.question-block { border: 1px solid var(--border); border-radius: 12px; background: #fbfcfe; overflow: hidden; }
.question-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 4px;
  background: none;
  border: 0;
  text-align: left;
  color: var(--ink);
}
.q-index {
  width: 22px; height: 22px; border-radius: 999px; background: var(--accent-soft); color: var(--accent);
  display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex: none;
}
.question-text { flex: 1; font-size: 13px; line-height: 1.45; }
.answers { display: flex; flex-direction: column; gap: 8px; padding: 8px 14px 12px 46px; }
.model-line { display: flex; align-items: flex-start; gap: 10px; }
.model-name { flex: none; min-width: 62px; font-size: 12px; font-weight: 700; color: var(--ink-2); }
.model-name.gpt { color: var(--m-gpt); }
.model-name.gemini { color: var(--m-gemini); }
.meta-info { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; }
.mention-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; border-radius: 999px; padding: 2px 8px 2px 3px; white-space: nowrap;
}
.mention-chip i {
  width: 16px; height: 16px; border-radius: 999px; background: #fff;
  display: inline-flex; align-items: center; justify-content: center; font-style: normal; font-size: 11px;
}

.no-mention {
  font-size: 12px;
  color: var(--muted);
}

.error-info {
  flex: 1;
  font-size: 12px;
  color: var(--bad);
}

.chevron {
  flex: none;
  color: var(--muted);
  transition: transform 0.15s ease;
}

.chevron.open { transform: rotate(180deg); }
.full { border-top: 1px solid var(--border); }

.answer-body {
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--border);
  font-size: 14px;
  line-height: 1.8;
  color: var(--ink-2);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 520px;
  overflow-y: auto;
}

.answer-body mark {
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 600;
}

@media (max-width: 680px) {
  .question-head { flex-direction: column; gap: 8px; }
  .answer-head { align-items: flex-start; }
  .model-name { min-width: 50px; }
}
</style>
