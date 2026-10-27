import type { TurnStepChunk, TurnStepResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { meter, type MeterEvents, type RequestFigure } from './meter.ts'

const usage = { input_tokens: 1000, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 85000, model: 'claude-opus-5-5' }
const result: TurnStepResult = { turnId: 't1', index: 0, answer: 'abcd'.repeat(40), toolUses: [], stopReason: 'end_turn', usage }

// No host involved: the meter only sees a stream and a clock, both scripted here.
// 1s to first token, 40 text chunks 75ms apart, then (unless `stop` is false) a stop chunk 75ms later.
const script = (opts: { stop?: 'usage' | 'none' | false; engineFirst?: boolean; throwAt?: number } = {}) => {
  let now = 0
  const clock = async () => now
  const chunks: TurnStepChunk[] = []
  async function* stream(): AsyncGenerator<TurnStepChunk, TurnStepResult> {
    now += 1000
    if (opts.engineFirst) {
      const c: TurnStepChunk = { kind: 'engine', ref: 1 }
      chunks.push(c)
      yield c
      now += 500
    }
    for (let i = 0; i < 40; i++) {
      if (i === opts.throwAt) throw new Error('stream failed')
      if (i > 0) now += 75
      const c: TurnStepChunk = { kind: 'text', index: 0, text: 'abcd' }
      chunks.push(c)
      yield c
    }
    const stop = opts.stop ?? 'usage'
    if (stop) {
      now += 75
      const c: TurnStepChunk = { kind: 'stop', stopReason: 'end_turn', usage: stop === 'usage' ? usage : null }
      chunks.push(c)
      yield c
    }
    return result
  }
  return { clock, chunks, stream }
}

// Records every event in order, so tests can assert sequence as well as values.
const record = () => {
  const events: string[] = []
  const lives: number[] = []
  const stops: RequestFigure[] = []
  const ev: MeterEvents = {
    live: n => { events.push('live'); lives.push(n) },
    stop: f => { events.push('stop'); stops.push(f) },
    end: () => { events.push('end') },
  }
  return { ev, events, lives, stops }
}

const drain = async (stream: AsyncGenerator<TurnStepChunk, TurnStepResult>) => {
  const seen: TurnStepChunk[] = []
  for (let r = await stream.next(); ; r = await stream.next()) {
    if (r.done) return { seen, result: r.value }
    seen.push(r.value)
  }
}

test('passes every chunk and the step result through untouched', async () => {
  const { clock, chunks, stream } = script()
  const { ev } = record()
  const out = await drain(meter(stream(), clock, ev))
  expect(out.seen.length).toBe(41)
  expect(out.seen.every((c, i) => c === chunks[i])).toBe(true)
  expect(out.result).toBe(result)
})

test('live fires every 16th chunk after the first, from streamed chars over elapsed time', async () => {
  const { clock, stream } = script()
  const { ev, lives } = record()
  await drain(meter(stream(), clock, ev))
  // Chunk 16: 17 chunks × 4 chars at 2.2s; chunk 32: 33 chunks × 4 chars at 3.4s.
  expect(lives.map(n => n.toFixed(4))).toEqual([(17 / 2.2).toFixed(4), (33 / 3.4).toFixed(4)])
})

test('stop figure is exact over the whole request, with time to first token', async () => {
  const { clock, stream } = script()
  const { ev, stops, events } = record()
  await drain(meter(stream(), clock, ev))
  expect(stops).toEqual([{ sentAt: 0, endAt: 4000, firstAt: 1000, usage: { inTok: 86000, outTok: 300, tps: 75, model: 'claude-opus-5-5' } }])
  expect(events.filter(e => e === 'end').length).toBe(1)
  expect(events.at(-1)).toBe('end')
})

test('a stop chunk without usage reports a stop with no usage, then the end', async () => {
  const { clock, stream } = script({ stop: 'none' })
  const { ev, stops, events } = record()
  await drain(meter(stream(), clock, ev))
  expect(stops.length).toBe(1)
  expect(stops[0]?.usage).toBeUndefined()
  expect(events.filter(e => e !== 'live')).toEqual(['stop', 'end'])
})

test('a stream cut short without a stop chunk reports only its end, once', async () => {
  const { clock, stream } = script({ stop: false })
  const { ev, stops, events } = record()
  const out = await drain(meter(stream(), clock, ev))
  expect(out.result).toBe(result)
  expect(stops).toEqual([])
  expect(events.filter(e => e === 'end').length).toBe(1)
  expect(events.at(-1)).toBe('end')
})

test('engine chunks are not counted as the first token or toward a live sample', async () => {
  const { clock, stream } = script({ engineFirst: true })
  const { ev, lives, stops } = record()
  await drain(meter(stream(), clock, ev))
  expect(stops[0]?.firstAt).toBe(1500)
  // Same samples as without the engine chunk, each 0.5s later.
  expect(lives.map(n => n.toFixed(4))).toEqual([(17 / 2.7).toFixed(4), (33 / 3.9).toFixed(4)])
})

test('a stream that throws still reports its end once, and the error reaches the caller', async () => {
  const { clock, stream } = script({ throwAt: 20 })
  const { ev, events } = record()
  let error: unknown
  try {
    await drain(meter(stream(), clock, ev))
  } catch (err) {
    error = err
  }
  expect((error as Error | undefined)?.message).toBe('stream failed')
  expect(events).toEqual(['live', 'end'])
})

test('a stream its reader abandons mid-way still reports its end once', async () => {
  const { clock, stream } = script()
  const { ev, events } = record()
  const m = meter(stream(), clock, ev)
  for (let i = 0; i < 20; i++) await m.next()
  await m.return(result)
  expect(events).toEqual(['live', 'end'])
})
