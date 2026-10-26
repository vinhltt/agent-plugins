import type { TurnStepChunk, TurnStepResult, TurnUsage } from 'claude-code'

// Live speed is estimated from streamed characters; the final figure always
// comes from the API's output_tokens on the stop chunk.
export const CHARS_PER_TOKEN = 4
// Reading the clock is a host call, so the live estimate samples it every N chunks.
export const LIVE_SAMPLE_EVERY = 16

/** One model request as measured at its stop chunk. */
export interface RequestFigure {
  sentAt: number
  endAt: number
  firstAt?: number
  // Absent when the stop chunk carries no usage; the caller still sees the stop, as v0.1.0 did.
  usage?: { inTok: number; outTok: number; tps: number }
}

export interface MeterEvents {
  /** Tokens/s estimated from the characters streamed so far. */
  live?(estimate: number): void
  /** Every stop chunk. */
  stop?(figure: RequestFigure): void
  /** Every stream end, exactly once: after a stop chunk, cut short without one, thrown or abandoned. */
  end?(): void
}

/** The clock is injected so the meter makes no host call of its own and tests can script time. */
export type Clock = () => Promise<number>

export const inputTokens = (u: TurnUsage) =>
  u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)

/**
 * Passes a step's chunks through untouched and reports its timing through `ev`.
 * Formatting and state stay with the caller, so main loop and subagents share one measurement.
 */
export async function* meter(
  stream: AsyncGenerator<TurnStepChunk, TurnStepResult>,
  clock: Clock,
  ev: MeterEvents,
): AsyncGenerator<TurnStepChunk, TurnStepResult> {
  const sentAt = await clock()
  let firstAt: number | undefined
  let chars = 0
  let chunks = 0

  // `finally`: a stream that throws or is abandoned mid-way ends too, so no live estimate is left standing.
  try {
    // Iterated by hand so the engine's TurnStepResult (the generator's return value) is passed up as-is.
    for (let r = await stream.next(); ; r = await stream.next()) {
      if (r.done) return r.value
      const chunk = r.value
      if (chunk.kind === 'text' || chunk.kind === 'thinking') chars += chunk.text.length
      else if (chunk.kind === 'input') chars += chunk.json.length

      if (chunk.kind === 'stop') {
        const endAt = await clock()
        const u = chunk.usage
        // Measured over the whole request, as omp does: hidden thinking streams no chunks
        // yet counts in output_tokens, so timing from the first chunk inflates the rate.
        const totalMs = endAt - sentAt
        ev.stop?.({
          sentAt,
          endAt,
          firstAt,
          usage: u
            ? { inTok: inputTokens(u), outTok: u.output_tokens, tps: totalMs > 0 ? u.output_tokens / (totalMs / 1000) : 0 }
            : undefined,
        })
      } else if (chunk.kind !== 'engine') {
        if (firstAt === undefined) firstAt = await clock()
        else if (++chunks % LIVE_SAMPLE_EVERY === 0) {
          const elapsed = ((await clock()) - sentAt) / 1000
          if (elapsed > 0) ev.live?.(chars / CHARS_PER_TOKEN / elapsed)
        }
      }
      yield chunk
    }
  } finally {
    ev.end?.()
  }
}
