<script setup lang="ts">
defineProps<{
  label: string
  value: string
  sub?: string
  accent?: boolean
}>()
</script>

<template>
  <div class="tile" :class="{ accent }">
    <div class="tile-label">{{ label }}</div>
    <div class="tile-value">{{ value }}</div>
    <div v-if="sub" class="tile-sub">{{ sub }}</div>
  </div>
</template>

<style scoped>
.tile {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tile.accent {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.tile-label {
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.02em;
}

.tile-value {
  font-size: 30px;
  font-weight: 650;
  line-height: 1.25;
  color: var(--ink);
}

.tile-sub {
  font-size: 12px;
  color: var(--ink-2);
}
</style>
