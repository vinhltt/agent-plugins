import type { AgentInfo, On, TurnStepChunk, TurnStepInput, TurnStepResult, TurnUsage } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const usage = { input_tokens: 1000, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 85000, model: 'claude-opus-5-5' }

const step = (agentId?: string, model = 'claude-opus-5-5'): TurnStepInput =>
  ({ turnId: 't1', index: 0, model, messageCount: 3, ...(agentId ? { agentId } : {}) })

interface EngineOptions {
  // What $.agent.list() answers.
  agents?: AgentInfo[]
  // Overrides `agents` per call (0-based); throwing rejects that call.
  list?: (call: number) => AgentInfo[]
  // The n-th step throws after this many text chunks.
  failAt?: (n: number) => number | undefined
  // The stop chunk's usage for the n-th step the engine runs (0-based); null sends a stop without usage.
  usageFor?: (e: TurnStepInput, n: number) => TurnUsage | null
}

// Stands in for the engine and its clock: time is scripted, so every figure is exact.
// 1s to first token, 40 chunks 75ms apart, the stop chunk 75ms after the last one.
const fakeEngine = (on: On, opts: EngineOptions = {}) => {
  let now = 1_000_000
  let steps = 0
  let listCalls = 0
  // A hook standing at the bottom answers with { value }, as the engine would.
  on('clock.now', () => ({ value: now }) as never)
  on('agent.list', () => ({ value: opts.list ? opts.list(listCalls++) : (listCalls++, opts.agents ?? []) }) as never)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* (_$, e): AsyncGenerator<TurnStepChunk, TurnStepResult> {
    const n = steps++
    const u = opts.usageFor ? opts.usageFor(e, n) : usage
    const failAt = opts.failAt?.(n)
    now += 1000
    for (let i = 0; i < 40; i++) {
      if (i === failAt) throw new Error('request failed')
      if (i > 0) now += 75
      yield { kind: 'text', index: 0, text: 'abcd' }
    }
    now += 75
    yield { kind: 'stop', stopReason: 'end_turn', usage: u }
    return { turnId: 't1', index: 0, answer: 'abcd'.repeat(40), toolUses: [], stopReason: 'end_turn', usage }
  })
  return { listCalls: () => listCalls }
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

// Reads n chunks of a step, leaving it mid-stream.
const advance = async (stream: AsyncGenerator<TurnStepChunk, TurnStepResult>, n: number) => {
  for (let i = 0; i < n; i++) await stream.next()
}

// The label lookup is left un-awaited by design; let it land before reading the status.
const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

const agent = (id: string, description: string, extra: Partial<AgentInfo> = {}): AgentInfo =>
  ({ id, description, type: 'general-purpose', status: 'running', ...extra })

const complete = (agentId: string, durationMs = 9500) =>
  ({ answer: '', durationMs, isAborted: false, turnId: 't1', agentId, reason: 'answer' as const })

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
  expect(statuses.at(-1)).toBe('tok/s: 75.0 [opus-5.5] · in: 86K · out: 300')
})

test('a stop chunk without usage after live samples falls back to the last exact figure', async ($, on) => {
  fakeEngine(on, { usageFor: (_e, n) => (n === 0 ? usage : null) })
  const { logs, statuses } = capture(on)

  await drain($.turn.step(step()))
  const before = statuses.length
  await drain($.turn.step(step()))

  expect(logs.length).toBe(1)
  expect(statuses.slice(before).some(s => s?.includes('(live)'))).toBe(true)
  expect(statuses.at(-1)).toBe('tok/s: 75.0 [opus-5.5] · in: 86K · out: 300')
})

test('a listed subagent shows as a segment, with no per-request log line', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')] })
  const { logs, statuses } = capture(on)

  await $.turn.start({ text: 'go', turnId: 't1', agentId: 'agent-1' })
  const { kinds, result } = await drain($.turn.step(step('agent-1')))
  await settle()

  expect(kinds.length).toBe(41)                 // subagent chunks pass through untouched too
  expect(result.answer).toBe('abcd'.repeat(40))
  expect(logs).toEqual([])
  expect(statuses.some(s => s?.includes('(live)'))).toBe(true)
  // No main figure yet: the segment stands alone, without a leading separator.
  expect(statuses.at(-1)).toBe('scout-auth [opus-5.5] 75.0')
})

test('an id $.agent.list() does not name shows nothing and logs nothing', async ($, on) => {
  fakeEngine(on)
  const { logs, statuses } = capture(on)

  await $.turn.start({ text: 'go', turnId: 't1', agentId: 'agent-x' })
  await drain($.turn.step(step('agent-x')))
  await settle()
  await $.turn.complete(complete('agent-x'))

  expect(statuses).toEqual([])
  expect(logs).toEqual([])
})

test('teammates show nothing and log nothing', async ($, on) => {
  fakeEngine(on, { agents: [agent('tm-1', 'helper', { type: 'teammate' }), agent('tm-2', 'reviewer', { teammateId: 'rev@team' })] })
  const { logs, statuses } = capture(on)

  for (const id of ['tm-1', 'tm-2']) {
    await $.turn.start({ text: 'go', turnId: 't1', agentId: id })
    await drain($.turn.step(step(id)))
    await settle()
    await $.turn.complete(complete(id))
  }

  expect(statuses).toEqual([])
  expect(logs).toEqual([])
})

test('concurrent subagents each keep their own figure, live beside exact', async ($, on) => {
  fakeEngine(on, {
    agents: [agent('agent-a', 'scout-auth'), agent('agent-b', 'review-pr')],
    usageFor: e => (e.agentId === 'agent-b' ? { ...usage, output_tokens: 600 } : usage),
  })
  const { statuses } = capture(on)

  const a = $.turn.step(step('agent-a'))
  const b = $.turn.step(step('agent-b'))
  // Interleave the 40 text chunks of both streams, then a's stop chunk while b still streams.
  for (let i = 0; i < 40; i++) {
    await a.next()
    await b.next()
    await settle()
  }
  await a.next()
  await settle()
  expect(statuses.at(-1)).toMatch(/^scout-auth \[opus-5\.5\] \d+\.\d · review-pr \[opus-5\.5\] ~\d+ \(live\)$/)

  await drain(b)
  await settle()
  // One shared clock: a spans 7.925s for 300 tokens, b (sent 1s later, finished 75ms after a) 7.0s for 600.
  expect(statuses.at(-1)).toBe('scout-auth [opus-5.5] 37.9 · review-pr [opus-5.5] 85.7')
})

test('a subagent stop does not overwrite the main live estimate', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')] })
  const { statuses } = capture(on)

  const main = $.turn.step(step())
  await advance(main, 20)                       // past the first live sample
  await drain($.turn.step(step('agent-1')))
  await settle()

  expect(statuses.at(-1)).toMatch(/^tok\/s: ~\d+ \(live\) \[opus-5\.5\] · in: 0 · out: 0 │ scout-auth \[opus-5\.5\] \d+\.\d$/)
  await drain(main)
})

test('turn.complete removes the segment and logs one summary line for the run', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')] })
  const { logs, statuses } = capture(on)

  await drain($.turn.step(step()))
  await $.turn.start({ text: 'go', turnId: 't1', agentId: 'agent-1' })
  await drain($.turn.step(step('agent-1')))
  await drain($.turn.step(step('agent-1')))
  await settle()
  expect(statuses.at(-1)).toBe('tok/s: 75.0 [opus-5.5] · in: 86K · out: 300 │ scout-auth [opus-5.5] 75.0')

  await $.turn.complete(complete('agent-1'))

  expect(logs.at(-1)).toBe('agent scout-auth  reqs: 2  in: 172K  out: 600  t: 9.5s  tok/s: 75.0/s')
  expect(statuses.at(-1)).toBe('tok/s: 75.0 [opus-5.5] · in: 86K · out: 300')
  expect(statuses.at(-1)).not.toContain('│')
})

test('a second agent with the same description is told apart by its id, long labels are cut', async ($, on) => {
  fakeEngine(on, {
    agents: [agent('agent-aaaa1111', 'review-pr'), agent('agent-bbbb2222', 'review-pr'), agent('agent-c', 'a much longer task description')],
  })
  const { statuses } = capture(on)

  for (const id of ['agent-aaaa1111', 'agent-bbbb2222', 'agent-c']) {
    await drain($.turn.step(step(id)))
    await settle()
  }

  expect(statuses.at(-1)).toBe('review-pr [opus-5.5] 75.0 · review-pr-2222 [opus-5.5] 75.0 · a much longer task… [opus-5.5] 75.0')
})

test('a description is kept to one line, and an empty one falls back to the agent type', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', ' fix\n  auth '), agent('agent-2', '  ', { type: 'Explore' })] })
  const { statuses } = capture(on)

  for (const id of ['agent-1', 'agent-2']) {
    await drain($.turn.step(step(id)))
    await settle()
  }

  expect(statuses.at(-1)).toBe('fix auth [opus-5.5] 75.0 · Explore [opus-5.5] 75.0')
})

test('an agent listed only by its second request shows from then on, one lookup per request', async ($, on) => {
  const engine = fakeEngine(on, { list: call => (call === 0 ? [] : [agent('agent-1', 'scout-auth')]) })
  const { logs, statuses } = capture(on)

  await $.turn.start({ text: 'go', turnId: 't1', agentId: 'agent-1' })
  await drain($.turn.step(step('agent-1')))
  await settle()
  expect(statuses).toEqual([])
  expect(engine.listCalls()).toBe(1)

  await drain($.turn.step(step('agent-1')))
  await settle()
  expect(statuses.at(-1)).toBe('scout-auth [opus-5.5] 75.0')
  expect(engine.listCalls()).toBe(2)

  await $.turn.complete(complete('agent-1'))
  expect(engine.listCalls()).toBe(2)            // named already: no lookup at the end
  expect(logs.at(-1)).toMatch(/^agent scout-auth {2}reqs: 2 /)
})

test('a failed lookup is retried and never hides the agent for good', async ($, on) => {
  // Every lookup of the first run fails, the end-of-run one included; the second run's succeeds.
  fakeEngine(on, { list: call => { if (call < 2) throw new Error('list failed'); return [agent('agent-1', 'scout-auth')] } })
  const { logs, statuses } = capture(on)

  await $.turn.start({ text: 'go', turnId: 't1', agentId: 'agent-1' })
  await drain($.turn.step(step('agent-1')))
  await settle()
  await $.turn.complete(complete('agent-1'))
  expect(statuses).toEqual([])
  expect(logs).toEqual([])

  await $.turn.start({ text: 'wake', turnId: 't2', agentId: 'agent-1' })
  await drain($.turn.step(step('agent-1')))
  await settle()
  expect(statuses.at(-1)).toBe('scout-auth [opus-5.5] 75.0')
})

test('a new run starts its counters over and keeps its label', async ($, on) => {
  const engine = fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')] })
  const { logs, statuses } = capture(on)

  await $.turn.start({ text: 'go', turnId: 't1', agentId: 'agent-1' })
  await drain($.turn.step(step('agent-1')))
  await drain($.turn.step(step('agent-1')))
  await settle()
  await $.turn.complete(complete('agent-1'))

  await $.turn.start({ text: 'wake', turnId: 't2', agentId: 'agent-1' })
  expect(statuses.at(-1)).toBeUndefined()       // hidden again until the new run's first figure
  await drain($.turn.step(step('agent-1')))
  await $.turn.complete(complete('agent-1', 4000))

  expect(engine.listCalls()).toBe(1)
  expect(logs).toEqual([
    'agent scout-auth  reqs: 2  in: 172K  out: 600  t: 9.5s  tok/s: 75.0/s',
    'agent scout-auth  reqs: 1  in: 86K  out: 300  t: 4.0s  tok/s: 75.0/s',
  ])
})

test('a run whose requests reported no usage logs no summary line', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')], usageFor: () => null })
  const { logs } = capture(on)

  await $.turn.start({ text: 'go', turnId: 't1', agentId: 'agent-1' })
  await drain($.turn.step(step('agent-1')))
  await settle()
  await $.turn.complete(complete('agent-1'))

  expect(logs).toEqual([])
})

test('a subagent request that fails mid-stream leaves no live estimate standing', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')], failAt: n => (n === 1 ? 20 : undefined) })
  const { statuses } = capture(on)

  await drain($.turn.step(step('agent-1')))
  await settle()
  let failed = false
  try {
    await drain($.turn.step(step('agent-1')))
  } catch {
    failed = true
  }
  await settle()

  expect(failed).toBe(true)
  expect(statuses.some(s => s?.includes('(live)'))).toBe(true)
  expect(statuses.at(-1)).toBe('scout-auth [opus-5.5] 75.0')
})

// The fake engine answers with the model the request named, unless a test says otherwise.
const answeredBy = (e: TurnStepInput): TurnUsage => ({ ...usage, model: e.model })

test('a new model shows only with its own figure, never beside the previous one', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')], usageFor: answeredBy })
  const { statuses } = capture(on)

  await drain($.turn.step(step()))
  const main = $.turn.step(step(undefined, 'claude-sonnet-5-5'))
  await advance(main, 5)                        // sent, but before its first live sample
  await drain($.turn.step(step('agent-1', 'claude-haiku-5-5')))
  await settle()
  expect(statuses.at(-1)).toBe('tok/s: 75.0 [opus-5.5] · in: 86K · out: 300 │ scout-auth [haiku-5.5] 75.0')

  await advance(main, 15)                       // past the first live sample
  expect(statuses.at(-1)).toMatch(/^tok\/s: ~\d+ \(live\) \[sonnet-5\.5\] · /)
  await drain(main)
  // One shared clock: the second main request also spans the subagent's 4s, so 300 tokens over 8s.
  expect(statuses.at(-1)).toBe('tok/s: 37.5 [sonnet-5.5] · in: 172K · out: 600 │ scout-auth [haiku-5.5] 75.0')
})

test('the live estimate is tagged with the model named, the exact figure with the model that answered', async ($, on) => {
  fakeEngine(on, { usageFor: () => ({ ...usage, model: 'claude-haiku-5-5' }) })
  const { statuses } = capture(on)

  await drain($.turn.step(step(undefined, 'claude-sonnet-5-5')))

  expect(statuses.some(s => /^tok\/s: ~\d+ \(live\) \[sonnet-5\.5\] · /.test(s ?? ''))).toBe(true)
  expect(statuses.at(-1)).toBe('tok/s: 75.0 [haiku-5.5] · in: 86K · out: 300')
})

test('a main request that fails mid-stream restores the last figure together with its model', async ($, on) => {
  fakeEngine(on, { usageFor: answeredBy, failAt: n => (n === 1 ? 20 : undefined) })
  const { statuses } = capture(on)

  await drain($.turn.step(step()))
  const before = statuses.length
  let failed = false
  try {
    await drain($.turn.step(step(undefined, 'claude-sonnet-5-5')))
  } catch {
    failed = true
  }

  expect(failed).toBe(true)
  expect(statuses.slice(before).some(s => s?.includes('(live) [sonnet-5.5]'))).toBe(true)
  expect(statuses.at(-1)).toBe('tok/s: 75.0 [opus-5.5] · in: 86K · out: 300')
})

test('a subagent request on another model that fails mid-stream keeps the earlier figure and its model', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')], usageFor: answeredBy, failAt: n => (n === 1 ? 20 : undefined) })
  const { statuses } = capture(on)

  await drain($.turn.step(step('agent-1', 'claude-haiku-5-5')))
  await settle()
  let failed = false
  try {
    await drain($.turn.step(step('agent-1', 'claude-sonnet-5-5')))
  } catch {
    failed = true
  }
  await settle()

  expect(failed).toBe(true)
  expect(statuses.some(s => s?.includes('scout-auth [sonnet-5.5] ~'))).toBe(true)
  expect(statuses.at(-1)).toBe('scout-auth [haiku-5.5] 75.0')
})

test('a subagent segment carries its own model, apart from the main one', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')], usageFor: answeredBy })
  const { statuses } = capture(on)

  await drain($.turn.step(step()))
  await drain($.turn.step(step('agent-1', 'claude-haiku-5-5')))
  await settle()

  expect(statuses.at(-1)).toBe('tok/s: 75.0 [opus-5.5] · in: 86K · out: 300 │ scout-auth [haiku-5.5] 75.0')
})

test('a subagent figure, like the main one, is tagged with the model that answered', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')], usageFor: () => ({ ...usage, model: 'claude-haiku-5-5' }) })
  const { statuses } = capture(on)

  await drain($.turn.step(step('agent-1', 'claude-sonnet-5-5')))
  await settle()

  expect(statuses.some(s => /^scout-auth \[sonnet-5\.5\] ~\d+ \(live\)$/.test(s ?? ''))).toBe(true)
  expect(statuses.at(-1)).toBe('scout-auth [haiku-5.5] 75.0')
})

test('a stop chunk that names no model keeps the model the request named', async ($, on) => {
  fakeEngine(on, { agents: [agent('agent-1', 'scout-auth')], usageFor: () => ({ ...usage, model: '' }) })
  const { statuses } = capture(on)

  await drain($.turn.step(step(undefined, 'claude-sonnet-5-5')))
  await drain($.turn.step(step('agent-1', 'claude-haiku-5-5')))
  await settle()

  expect(statuses.at(-1)).toBe('tok/s: 75.0 [sonnet-5.5] · in: 86K · out: 300 │ scout-auth [haiku-5.5] 75.0')
})
