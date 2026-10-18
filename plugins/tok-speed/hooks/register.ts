import type { Register, TurnUsage } from 'claude-code'

// Live speed is estimated from streamed characters; the final figure always
// comes from the API's output_tokens on the stop chunk.
const CHARS_PER_TOKEN = 4
// Reading the clock is a host call, so the live estimate samples it every N chunks.
const LIVE_SAMPLE_EVERY = 16

const pad = (n: number) => String(n).padStart(2, '0')

const stamp = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const compact =(n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n)

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`

const inputTokens = (u: TurnUsage) =>
  u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)

export const register: Register = on => {
  // Module state: a hot reload starts the session totals over, which is fine for a readout.
  let lastMark: number | undefined
  let totalIn = 0
  let totalOut = 0
  let lastTps: number | undefined

  const summary = (tps: string) => `tok/s: ${tps} · in: ${compact(totalIn)} · out: ${compact(totalOut)}`

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) lastMark = await $.clock.now()
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // Subagents stream concurrently; one status line cannot show them all, so only the main loop is measured.
    if (e.agentId) return yield* next(e)

    const sentAt = await $.clock.now()
    let firstAt: number | undefined
    let chars = 0
    let chunks = 0
    const stream = next(e)

    // Iterated by hand so the engine's TurnStepResult (the generator's return value) is passed up as-is.
    for (let r = await stream.next(); ; r = await stream.next()) {
      if (r.done) {
        // A step cut short never sends a stop chunk: drop the live estimate, keep the last real figure.
        if (lastTps !== undefined) $.ui.status(summary(lastTps.toFixed(1)))
        return r.value
      }
      const chunk = r.value
      if (chunk.kind === 'text' || chunk.kind === 'thinking') chars += chunk.text.length
      else if (chunk.kind === 'input') chars += chunk.json.length

      if (chunk.kind === 'stop') {
        const endAt = await $.clock.now()
        const u = chunk.usage
        if (u) {
          // Measured over the whole request, as omp does: hidden thinking streams no chunks
          // yet counts in output_tokens, so timing from the first chunk inflates the rate.
          const totalMs = endAt - sentAt
          const tps = totalMs > 0 ? u.output_tokens / (totalMs / 1000) : 0
          const inTok = inputTokens(u)
          totalIn += inTok
          totalOut += u.output_tokens
          lastTps = tps
          const delta = lastMark === undefined ? '' : `  Δ ${secs(endAt - lastMark)}`
          const ttft = firstAt === undefined ? '' : `  ttft: ${secs(firstAt - sentAt)}`
          $.ui.log(
            `${stamp(endAt)}${delta}  in: ${compact(inTok)}  out: ${compact(u.output_tokens)}  t: ${secs(endAt - sentAt)}${ttft}  tok/s: ${tps.toFixed(1)}/s`,
          )
          $.ui.status(summary(tps.toFixed(1)))
        }
        lastMark = endAt
      } else if (chunk.kind !== 'engine') {
        if (firstAt === undefined) firstAt = await $.clock.now()
        else if (++chunks % LIVE_SAMPLE_EVERY === 0) {
          const elapsed = ((await $.clock.now()) - sentAt) / 1000
          if (elapsed > 0) $.ui.status(summary(`~${(chars / CHARS_PER_TOKEN / elapsed).toFixed(0)} (live)`))
        }
      }
      yield chunk
    }
  })
}
