<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'
import type { Brand, Run } from '../types'
import type { RunAgg } from '../lib/aggregate'
import { CHART_FONT, CHART_INK, MODEL_COLORS, TOOLTIP_STYLE } from '../lib/palette'

const props = defineProps<{ brands: Brand[]; agg: RunAgg; run: Run }>()

const option = computed<EChartsOption>(() => {
  const brandNames = props.brands.map(b => b.name)
  const series = props.run.models.map(model => ({
    name: `${model.label}`,
    type: 'bar' as const,
    barWidth: 14,
    barGap: '35%',
    itemStyle: {
      color: MODEL_COLORS[model.id] || CHART_INK.muted,
      borderRadius: [4, 4, 0, 0] as [number, number, number, number]
    },
    data: props.brands.map(brand => props.agg.byBrand[brand.id]?.byModel[model.id] || 0)
  }))
  return {
    textStyle: { fontFamily: CHART_FONT },
    tooltip: {
      ...TOOLTIP_STYLE,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(36, 48, 66, 0.06)' } }
    },
    legend: {
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: CHART_INK.secondary, fontSize: 13 }
    },
    grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: brandNames,
      axisLine: { lineStyle: { color: CHART_INK.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_INK.secondary,
        fontSize: 11,
        interval: 0,
        rotate: brandNames.length > 6 ? 32 : 0
      }
    },
    yAxis: {
      type: 'value',
      name: '提及问题数',
      nameTextStyle: { color: CHART_INK.secondary, fontSize: 12 },
      splitLine: { lineStyle: { color: CHART_INK.grid } },
      axisLabel: { color: CHART_INK.secondary, fontSize: 13 }
    },
    series
  }
})
</script>

<template>
  <EChart :option="option" class="matrix" />
</template>

<style scoped>
.matrix {
  height: 380px;
}
</style>
