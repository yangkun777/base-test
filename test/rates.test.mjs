import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, sharePct, modelSharePct, degsonReport } from '../frontend/src/lib/aggregate.ts'
import exportDocx from '../lib/export-docx.js'

const brands = [{ id: 'degson', name: 'Degson', self: true }]
const mention = [{ brandId: 'degson', brandName: 'Degson', rank: 1, count: 1, firstIndex: 0 }]
const run = {
  id: 'run-test', createdAt: '2026-10-30T00:00:00.000Z',
  models: [{ id: 'gpt', label: 'GPT', model: 'test' }, { id: 'gemini', label: 'Gemini', model: 'test' }],
  questions: [{ id: 'q1', text: 'First?' }, { id: 'q2', text: 'Second?' }, { id: 'q3', text: 'Third?' }],
  results: [
    { questionId: 'q1', modelId: 'gpt', status: 'ok', answer: 'Degson', mentions: mention },
    { questionId: 'q1', modelId: 'gemini', status: 'error', error: 'failed' },
    { questionId: 'q2', modelId: 'gpt', status: 'ok', answer: 'WAGO', mentions: [{ brandId: 'wago', brandName: 'WAGO', rank: 1 }] },
    { questionId: 'q2', modelId: 'gemini', status: 'ok', answer: 'Degson', mentions: mention },
    { questionId: 'q3', modelId: 'gpt', status: 'error', error: 'failed' },
    { questionId: 'q3', modelId: 'gemini', status: 'error', error: 'failed' }
  ]
}

test('mention rates exclude failed calls overall and per model', () => {
  const stats = aggregate(run, brands)
  assert.equal(stats.okCount, 3)
  assert.deepEqual(stats.okByModel, { gpt: 2, gemini: 1 })
  assert.ok(Math.abs(sharePct(stats, 'degson') - 200 / 3) < 1e-9)
  assert.equal(modelSharePct(stats, 'degson', 'gpt'), 50)
  assert.equal(modelSharePct(stats, 'degson', 'gemini'), 100)
  assert.deepEqual(degsonReport(run).rates.map(item => [item.id, item.hits, item.denom, item.pct]), [
    ['gpt', 1, 2, 50], ['gemini', 1, 1, 100]
  ])
})

test('Word export uses successful calls as its denominator', () => {
  const xml = exportDocx.buildRunDocx(run).toString('utf8')
  assert.match(xml, /1 \/ 2（50\.0%）/)
  assert.match(xml, /1 \/ 1（100\.0%）/)
})


test('denominators follow each answer, ignore old intent flags, and retain competitor-only answers', () => {
  const changed = structuredClone(run)
  changed.questions[0].excludeFromBrandEvaluation = true
  changed.questions[0].text = 'How should engineers select terminals?'
  changed.results[1] = { questionId: 'q1', modelId: 'gemini', status: 'ok', answer: 'Check current and voltage.', mentions: [] }
  changed.results.push({ questionId: 'q3', modelId: 'gpt', status: 'ok', answer: 'NONE', mentions: [] })
  const stats = aggregate(changed, brands)
  assert.equal(stats.okCount, 3)
  assert.equal(stats.okByModel.gpt, 2)
  assert.equal(stats.okByModel.gemini, 1)
  assert.equal(modelSharePct(stats, 'degson', 'gpt'), 50)
  assert.equal(modelSharePct(stats, 'degson', 'gemini'), 100)
  assert.deepEqual(degsonReport(changed).rates.map(r => r.denom), [2, 1])
  const docx = exportDocx.buildRunDocx(changed).toString('utf8')
  assert.match(docx, /1 \/ 2（50\.0%）/)
  assert.match(docx, /未提及任何品牌/)
})
