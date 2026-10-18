import type { On, TurnStepChunk, TurnStepInput, TurnStepResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const usage = { input_tokens: 1000, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 85000, model: 'claude-test' }

const step = (agentId?: string): TurnStepInput => ({ turnId: 't1', index: 0, model: 'claude-test', messageCount: 3, ...(agentId ? { agentId } : {}) })

// Stands in for the engine and its clock: time is scripted, so every figure is exact.
// 1s to first token, 40 chunks 75ms apart, the stop chunk 75ms after the last one.
const fakeEngine = (on: On) => {
  let now = 1_000_000
  // A hook standing at the bottom answers with { value }, as the engine would.
  on('clock.now', () => ({ value: now }) as never)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (): AsyncGenerator<TurnStepChunk, TurnStepResult> {
    now += 1000
    for (let i = 0; i < 40; i++) {
      if (i > 0) now += 75
      yield { kind: 'text', index: 0, text: 'abcd' }
    }
    now += 75
    yield { kind: 'stop', stopReason: 'end_turn', usage }
    return { turnId: 't1', index: 0, answer: 'abcd'.repeat(40), toolUses: [], stopReason: 'end_turn', usage }
  })
}

const capture = (on: On) => {
  const logs: string[] = []
  const statuses: (string | undefined)[] = []
  on('ui.log', (_$, e) => { logs.push(e.text); return { value: undefined } as never })
  on('ui.status', (_$, e) => { statuses.push(e.text); return { value: undefined } as never })
  return { logs, statuses }
}

// Reads a step to its end: the chunk kinds that came through, and what the step returned.
const drain = async (stream: AsyncGenerator<TurnStepChunk, TurnStepResult>) => {
  const kinds: string[] = []
  for (let r = await stream.next(); ; r = await stream.next()) {
    if (r.done) return { kinds, result: r.value }
    kinds.push(r.value.kind)
  }
}

test('logs one omp-style line per main-loop request, tok/s over the whole request', async ($, on) => {
  fakeEngine(on)
  const { logs, statuses } = capture(on)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const { kinds, result } = await drain($.turn.step(step()))

  expect(kinds.length).toBe(41)                 // every chunk passed through untouched
  expect(result.answer).toBe('abcd'.repeat(40))
  expect(logs.length).toBe(1)
  expect(logs[0]).toMatch(/Δ 4\.0s {2}in: 86K {2}out: 300 {2}t: 4\.0s {2}ttft: 1\.0s {2}tok\/s: 75\.0\/s$/)
  expect(statuses.some(s => s?.includes('(live)'))).toBe(true)
  expect(statuses.at(-1)).toBe('tok/s: 75.0 · in: 86K · out: 300')
})

test('ignores subagent requests', async ($, on) => {
  fakeEngine(on)
  const { logs, statuses } = capture(on)

  const { result } = await drain($.turn.step(step('agent-1')))

  expect(result.answer).toBe('abcd'.repeat(40))

  expect(logs).toEqual([])
  expect(statuses).toEqual([])
})
