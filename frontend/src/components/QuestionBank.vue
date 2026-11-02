<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRun } from '../composables/useRun'

const { state, addQuestion, removeQuestion, clearQuestions } = useRun()

const text = ref('')
const error = ref('')
const saving = ref(false)

const bank = computed(() => state.meta?.questions || [])

const runQuestions = computed(() => {
  const run = state.currentRun
  if (!run) return null
  if (run.questions?.length) return run.questions
  const ids = [...new Set(run.results.map(result => result.questionId))]
  return ids.map(id => bank.value.find(question => question.id === id) || { id, text: id })
})

const viewingPast = computed(() => {
  const past = runQuestions.value
  if (!past) return false
  if (past.length !== bank.value.length) return true
  return past.some((question, index) => question.id !== bank.value[index]?.id || question.text !== bank.value[index]?.text)
})

const questions = computed(() => viewingPast.value && runQuestions.value ? runQuestions.value : bank.value)

async function onAdd() {
  if (saving.value || state.running) return
  error.value = ''
  saving.value = true
  try {
    await addQuestion(text.value)
    text.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function onRemove(id: string) {
  if (saving.value || state.running) return
  error.value = ''
  saving.value = true
  try {
    await removeQuestion(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function onClear() {
  if (saving.value || state.running || !bank.value.length) return
  error.value = ''
  saving.value = true
  try {
    await clearQuestions()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section v-if="state.meta" class="card bank">
    <div class="bank-head">
      <div>
        <div class="card-title">评测问题</div>
        <div class="card-sub">{{ viewingPast ? '这是所选评测当时提交的题目' : '本地给出的题目将依次提交给所选模型（先后顺序）' }}</div>
      </div>
      <span class="count">{{ questions.length }} 题</span>
    </div>

    <ol class="list">
      <li v-for="(question, index) in questions" :key="`${question.id}-${index}`">
        <span class="idx">{{ index + 1 }}</span>
        <p class="body">{{ question.text }}</p>
        <button
          v-if="!viewingPast"
          class="remove"
          :disabled="saving || state.running"
          title="删除"
          @click="onRemove(question.id)"
        >删除</button>
      </li>
    </ol>
    <p v-if="!questions.length" class="empty-hint">还没有问题，添加后才能发起评测</p>

    <div v-if="viewingPast" class="next-bank">
      <div class="next-head">
        <span>下一轮题库</span>
        <div class="next-actions">
          <span>{{ bank.length }} 题</span>
          <button type="button" class="clear" :disabled="saving || state.running || !bank.length" @click="onClear">一键清空</button>
        </div>
      </div>
      <ol v-if="bank.length" class="list next-list">
        <li v-for="(question, index) in bank" :key="`next-${question.id}`">
          <span class="idx">{{ index + 1 }}</span>
          <p class="body">{{ question.text }}</p>
          <button class="remove" :disabled="saving || state.running" title="删除" @click="onRemove(question.id)">删除</button>
        </li>
      </ol>
      <p v-else class="empty-hint">下一轮还没有题目</p>
    </div>

    <form class="add" @submit.prevent="onAdd">
      <div class="composer">
        <textarea v-model="text" rows="1" maxlength="2000" :disabled="saving || state.running" placeholder="输入新的评测问题，按 Enter 快速添加" @keydown.enter.exact.prevent="onAdd"></textarea>
        <span class="counter">{{ text.length }}/2000</span>
        <button type="submit" :disabled="saving || state.running || !text.trim()">添加问题</button>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
    </form>
  </section>
</template>

<style scoped>
.bank-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
}

.count {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--accent);
}

.list {
  list-style: none;
  margin: 8px 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  max-height: 220px;
  overflow: auto;
}

.list li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 44px;
  border-bottom: 1px solid var(--border);
}

.list li:last-child { border-bottom: 0; }

.idx {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--ink-2);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.body {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.45;
}

.remove {
  background: none;
  border: 0;
  color: var(--muted);
  font-size: 12px;
  padding: 2px 0;
}

.remove:hover:not(:disabled) { color: var(--bad); }
.remove:disabled { opacity: 0.4; cursor: default; }

.empty-hint {
  margin: 0 0 var(--space-3);
  color: var(--muted);
  font-size: 13px;
}

.next-bank {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.next-head {
  display: flex;
  justify-content: space-between;
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 650;
}

.next-actions { display: flex; align-items: center; gap: 12px; }
.clear { border: 0; background: transparent; color: var(--bad); font: inherit; font-size: 12px; cursor: pointer; }
.clear:disabled { opacity: 0.4; cursor: default; }

.next-list { max-height: 140px; }

.composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.composer textarea {
  width: 100%;
  height: 36px;
  min-height: 36px;
  background: #fff;
  color: var(--ink);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  resize: none;
}

.counter { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.hint, .err { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
.err { color: var(--bad); }

.composer button {
  height: 38px;
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 8px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 650;
}

.composer button:disabled { opacity: 0.45; cursor: default; }
</style>
