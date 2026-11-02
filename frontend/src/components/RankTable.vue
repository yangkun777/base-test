<script setup lang="ts">
import { computed } from 'vue'
import type { Brand } from '../types'
import { sharePct, type RunAgg } from '../lib/aggregate'
import { brandColor } from '../lib/palette'

const props = defineProps<{ brands: Brand[]; agg: RunAgg }>()

const rows = computed(() =>
  props.brands
    .map(brand => {
      const agg = props.agg.byBrand[brand.id]
      return {
        id: brand.id,
        name: brand.name,
        self: brand.self,
        color: brandColor(brand.id, brand.self),
        total: agg?.total || 0,
        share: sharePct(props.agg, brand.id),
        appearIn: agg?.appearIn || 0,
        top1: agg?.top1 || 0,
        top3: agg?.top3 || 0
      }
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 12)
)

function pct(count: number): string {
  if (props.agg.okCount === 0) return '—'
  return `${Math.round(count / props.agg.okCount * 100)}%`
}
</script>

<template>
  <table class="rank-table" aria-label="各品牌首次提及顺位和占比">
    <thead>
      <tr>
        <th>品牌</th>
        <th v-for="model in agg.models" :key="model.id" class="num">{{ model.label }}</th>
        <th class="num">合计</th>
        <th class="num">综合提及率</th>
        <th class="num">首次出现第 1 位</th>
        <th class="num">首次出现前 3 位</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.id" :class="{ self: row.self }">
        <td data-label="品牌">
          <span class="dot" :style="{ background: row.color }"></span>
          <span class="name">{{ row.name }}</span>
          <span v-if="row.self" class="badge">本品牌</span>
        </td>
        <td
          v-for="model in agg.models"
          :key="`${row.id}-${model.id}`"
          class="num"
          :data-label="model.label"
        >{{ agg.byBrand[row.id]?.byModel[model.id] || 0 }} / {{ agg.okByModel[model.id] || 0 }}</td>
        <td class="num" data-label="合计">{{ row.total }} / {{ agg.okCount }}</td>
        <td class="num" data-label="综合提及率">
          <div class="share-cell">
            <span class="share-value">{{ agg.okCount ? row.share.toFixed(1) + '%' : '—' }}</span>
            <span class="share-bar">
              <span class="share-fill" :style="{ width: `${Math.min(row.share, 100)}%`, background: row.color }"></span>
            </span>
          </div>
        </td>
        <td class="num" data-label="首次出现第 1 位">{{ row.top1 }} 次（{{ pct(row.top1) }}）</td>
        <td class="num" data-label="首次出现前 3 位">{{ row.top3 }} 次（{{ pct(row.top3) }}）</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.rank-table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

th {
  text-align: left;
  font-size: 12px;
  font-weight: 550;
  color: var(--muted);
  padding: 8px;
  border-bottom: 1px solid var(--border);
}

td {
  padding: 8px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--ink-2);
}

tbody tr:last-child td { border-bottom: none; }

th.num, td.num { text-align: right; white-space: nowrap; }

tr.self td {
  background: #f3f7ff;
  color: var(--ink);
}

tr.self td:first-child { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
tr.self td:last-child { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }

.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: var(--space-2);
}

.name { color: var(--ink); font-weight: 550; }

.badge {
  margin-left: var(--space-2);
  font-size: 11px;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
}

.share-cell {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.share-bar {
  width: 88px;
  height: 5px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.share-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
}

@media (max-width: 960px) {
  .rank-table, tbody, tr, td { display: block; }
  .rank-table thead { display: none; }
  tbody { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  tbody tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); }
  tbody tr.self { background: var(--accent-soft); border-color: var(--border-strong); }
  td, tbody tr:last-child td { border: 0; padding: 0; }
  td.num { text-align: left; }
  td:not(:first-child) { display: flex; flex-direction: column; gap: 2px; font-variant-numeric: tabular-nums; }
  td:not(:first-child)::before { content: attr(data-label); display: block; color: var(--muted); font-size: 12px; }
  td:first-child { grid-column: 1 / -1; display: flex; align-items: center; min-width: 0; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
  tr.self td { background: transparent; }
  tr.self td:first-child, tr.self td:last-child { border-radius: 0; }
  .dot { flex: none; }
  .name { overflow-wrap: anywhere; }
  .share-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
  .share-bar { width: min(100%, 140px); }
}

@media (max-width: 580px) {
  tbody { grid-template-columns: 1fr; }
}
</style>
