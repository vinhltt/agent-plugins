import type { EngineInterface, Register } from 'claude-code'
import { compact, secs, stamp } from './format.ts'
import { meter } from './meter.ts'

const LABEL_MAX = 20

// One subagent's figures for its current run, plus what survives between its runs.
interface AgentRecord {
  // Survive a new run: who the agent is does not change between its runs.
  label?: string
  ignored?: boolean // a teammate, or confirmed not listed by the time its run ended
  listing?: Promise<Listing> // the $.agent.list() lookup in flight; cleared to retry if not listed yet
  // Reset at each run's start.
  reqs: number
  inTok: number
  outTok: number
  reqMs: number
  tps?: number
  live?: number
}

// What one lookup learned: only 'absent' is proof the id is not an agent we show; 'error' says nothing.
type Listing = 'listed' | 'absent' | 'error'

// Created per register() call: a hot reload starts the session totals over, which is fine for a readout.
// One object rather than closure variables because the engine only lets `$` reach functions
// declared at the top of the file, so those functions take the state as an argument.
interface State {
  lastMark?: number
  totalIn: number
  totalOut: number
  lastTps?: number
  // The main loop's figure as shown: '75.0' or '~72 (live)'.
  mainTps?: string
  // Last text sent, so an unchanged line costs no host call.
  shown?: string
  agents: Map<string, AgentRecord>
  // Insertion order is segment order.
  running: Set<string>
}

const ensure = (s: State, id: string) => {
  let rec = s.agents.get(id)
  if (!rec) s.agents.set(id, (rec = { reqs: 0, inTok: 0, outTok: 0, reqMs: 0 }))
  return rec
}

const summary = (s: State, tps: string) => `tok/s: ${tps} · in: ${compact(s.totalIn)} · out: ${compact(s.totalOut)}`

const segment = (r: AgentRecord) =>
  r.live !== undefined ? `${r.label} ~${r.live.toFixed(0)} (live)` : `${r.label} ${r.tps!.toFixed(1)}`

// The one place the status line is composed: every event writes state, then renders.
// A subagent shows from its first figure until its run ends, and only once it has a label.
const statusText = (s: State) => {
  const segs = [...s.running]
    .map(id => s.agents.get(id))
    .filter((r): r is AgentRecord => !!r && r.label !== undefined && !r.ignored && (r.live ?? r.tps) !== undefined)
    .map(segment)
  const main = s.mainTps === undefined ? undefined : summary(s, s.mainTps)
  if (!segs.length) return main
  return main ? `${main} │ ${segs.join(' · ')}` : segs.join(' · ')
}

function render($: EngineInterface, s: State) {
  const text = statusText(s)
  if (text === s.shown) return
  s.shown = text
  $.ui.status(text)
}

// Agent descriptions are a few words; one line, cut by code point, and an id suffix keeps two alike apart.
const uniqueLabel = (s: State, description: string, id: string) => {
  const chars = [...description]
  const base = chars.length > LABEL_MAX ? `${chars.slice(0, LABEL_MAX - 1).join('').trimEnd()}…` : description
  const taken = [...s.running].some(o => o !== id && s.agents.get(o)?.label === base)
  return taken ? `${base}-${id.slice(-4)}` : base
}

// Names the agent from $.agent.list(). Never awaited before a request is sent, so it delays nothing.
function lookup($: EngineInterface, s: State, id: string): Promise<Listing> {
  const rec = ensure(s, id)
  const listing = $.agent.list().then(
    (list): Listing => {
      rec.listing = undefined
      const a = list.find(x => x.id === id)
      // Not listed yet: the next request asks again.
      if (!a) return 'absent'
      if (a.type === 'teammate' || a.teammateId !== undefined) rec.ignored = true
      else rec.label = uniqueLabel(s, a.description.replace(/\s+/g, ' ').trim() || a.type, id)
      render($, s)
      return 'listed'
    },
    (): Listing => {
      rec.listing = undefined
      return 'error'
    },
  )
  rec.listing = listing
  return listing
}

// A run ended: last chance to name the agent, then its one summary line.
async function finish($: EngineInterface, s: State, id: string, durationMs: number) {
  s.running.delete(id)
  const rec = s.agents.get(id)
  if (rec && rec.reqs > 0) {
    // Awaited after next(e), so only this hook's own return waits on it, and only when no step named the agent.
    if (rec.label === undefined && !rec.ignored) {
      if (rec.listing) await rec.listing
      if (rec.label === undefined && !rec.ignored && (await lookup($, s, id)) === 'absent') rec.ignored = true
    }
    if (rec.label !== undefined && !rec.ignored) {
      const tps = rec.reqMs > 0 ? rec.outTok / (rec.reqMs / 1000) : 0
      $.ui.log(
        `agent ${rec.label}  reqs: ${rec.reqs}  in: ${compact(rec.inTok)}  out: ${compact(rec.outTok)}  t: ${secs(durationMs)}  tok/s: ${tps.toFixed(1)}/s`,
      )
    }
  }
  render($, s)
}

export const register: Register = on => {
  const s: State = { totalIn: 0, totalOut: 0, agents: new Map(), running: new Set() }

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) s.lastMark = await $.clock.now()
    else {
      // Hidden until its first figure; the label found in an earlier run is kept.
      const rec = ensure(s, e.agentId)
      Object.assign(rec, { reqs: 0, inTok: 0, outTok: 0, reqMs: 0, tps: undefined, live: undefined })
      s.running.add(e.agentId)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (id !== undefined) {
      const rec = ensure(s, id)
      // Its start may be unheard (spawned inside a hook of ours, or a hot reload mid-run).
      s.running.add(id)
      // At most one lookup per request; meter events come only after the request is sent.
      let asked = false
      const want = () => {
        if (asked) return
        asked = true
        if (rec.label === undefined && !rec.ignored && !rec.listing) void lookup($, s, id)
      }
      return yield* meter(next(e), () => $.clock.now(), {
        live: n => {
          want()
          rec.live = n
          render($, s)
        },
        // Subagents log one summary line per run, at turn.complete, not one per request.
        stop: f => {
          want()
          if (f.usage) {
            rec.reqs++
            rec.inTok += f.usage.inTok
            rec.outTok += f.usage.outTok
            rec.reqMs += f.endAt - f.sentAt
            rec.tps = f.usage.tps
          }
          rec.live = undefined
          render($, s)
        },
        end: () => {
          want()
          rec.live = undefined
          render($, s)
        },
      })
    }

    return yield* meter(next(e), () => $.clock.now(), {
      live: n => {
        s.mainTps = `~${n.toFixed(0)} (live)`
        render($, s)
      },
      stop: f => {
        if (f.usage) {
          const { inTok, outTok, tps } = f.usage
          s.totalIn += inTok
          s.totalOut += outTok
          s.lastTps = tps
          const delta = s.lastMark === undefined ? '' : `  Δ ${secs(f.endAt - s.lastMark)}`
          const ttft = f.firstAt === undefined ? '' : `  ttft: ${secs(f.firstAt - f.sentAt)}`
          $.ui.log(
            `${stamp(f.endAt)}${delta}  in: ${compact(inTok)}  out: ${compact(outTok)}  t: ${secs(f.endAt - f.sentAt)}${ttft}  tok/s: ${tps.toFixed(1)}/s`,
          )
          s.mainTps = tps.toFixed(1)
          render($, s)
        }
        s.lastMark = f.endAt
      },
      // A live estimate never outlives its stream: back to the last real figure, as v0.1.0 did
      // at every stream end, also after a stop chunk without usage that followed live samples.
      end: () => {
        if (s.lastTps === undefined) return
        s.mainTps = s.lastTps.toFixed(1)
        render($, s)
      },
    })
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id === undefined) return next(e)
    // `finally`: the segment leaves even when a hook beneath throws.
    try {
      return await next(e)
    } finally {
      await finish($, s, id, e.durationMs)
    }
  })
}
