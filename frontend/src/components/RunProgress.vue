<script setup lang="ts">
import { useRun } from '../composables/useRun'

const { state, progressDone } = useRun()
</script>

<template>
  <div class="progress-panel card">
    <div class="progress-head">
      <div>
        <div class="card-title">评测执行中</div>
        <div class="card-sub">{{ state.stopRequested ? '正在取消当前请求并保存已完成的结果…' : '正在按所选地区逐题测试；停止后按实际完成量生成报告。已发出的当前请求仍可能计费。' }}</div>
      </div>
      <div class="counter">{{ progressDone }} / {{ state.progress.length }}</div>
    </div>
    <div class="bar">
      <div class="fill" :style="{ width: state.progress.length ? `${progressDone / state.progress.length * 100}%` : '0%' }"></div>
    </div>
    <ul class="items">
      <li v-for="item in state.progress" :key="`${item.questionId}-${item.modelId}`" :class="item.status">
        <span class="status-icon">
          <template v-if="item.status === 'ok'">✓</template>
          <template v-else-if="item.status === 'error'">✕</template>
          <template v-else-if="item.status === 'running'"><span class="spinner"></span></template>
          <template v-else>·</template>
        </span>
        <span class="label">{{ item.label }}</span>
        <span v-if="item.error" class="err">{{ item.error }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.progress-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.counter {
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
  margin: var(--space-3) 0 var(--space-4);
}

.fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.3s ease;
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-1) var(--space-5);
}

.items li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
  color: var(--muted);
  padding: 3px 0;
}

.items li.running { color: var(--ink); }
.items li.ok { color: var(--ink-2); }
.items li.error { color: var(--bad); }

.status-icon {
  width: 16px;
  text-align: center;
  flex: none;
}

.items li.ok .status-icon { color: var(--good); }

.spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid var(--accent);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.err {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
