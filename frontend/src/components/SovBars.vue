<script setup lang="ts">
import { computed } from 'vue'
import type { Brand } from '../types'
import { sharePct, type RunAgg } from '../lib/aggregate'
import { brandColor } from '../lib/palette'

const props = defineProps<{ brands: Brand[]; agg: RunAgg }>()

const rows = computed(() => props.brands.map(brand => ({
  id: brand.id,
  name: brand.name,
  self: brand.self,
  total: props.agg.byBrand[brand.id]?.total || 0,
  share: sharePct(props.agg, brand.id),
  color: brandColor(brand.id, brand.self)
})).sort((a, b) => b.share - a.share))

const maxShare = computed(() => Math.max(1, ...rows.value.map(row => row.share)))
</script>

<template>
  <div class="share-list">
    <div v-for="row in rows" :key="row.id" class="share-row" :class="{ self: row.self }">
      <div class="share-details">
        <span class="brand-name"><span class="dot" :style="{ background: row.color }"></span>{{ row.name }}</span>
        <span class="share-values">{{ row.total }} / {{ agg.slotCount }} 条回答 <strong>{{ row.share.toFixed(1) }}%</strong></span>
      </div>
      <div class="track" aria-hidden="true">
        <div class="fill" :style="{ width: `${row.share / maxShare * 100}%`, background: row.color }"></div>
      </div>
    </div>
    <p class="scale-note">条长按本轮最高提及率缩放。GPT 与 Gemini 分开计，同一条回答多次只计 1。</p>
  </div>
</template>

<style scoped>
.share-list { display: flex; flex-direction: column; gap: 8px; padding: 4px 0 0; max-height: 420px; overflow: auto; }
.share-row { display: flex; flex-direction: column; gap: 4px; padding: 4px 8px; border-radius: 8px; }
.share-row.self { background: var(--accent-soft); }
.share-details { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.brand-name { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-weight: 650; font-size: 13px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex: none; }
.share-values { color: var(--ink-2); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.share-values strong { color: var(--ink); font-size: 13px; margin-left: 8px; }
.track { height: 6px; border-radius: 999px; background: #eef2f8; overflow: hidden; }
.fill { height: 100%; border-radius: inherit; }
.scale-note { margin: 1px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
@media (max-width: 480px) {
  .share-details { align-items: flex-start; }
  .share-values { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.3; }
  .share-values strong { margin-left: 0; }
}
</style>
