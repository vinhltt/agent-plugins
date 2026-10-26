# tok-speed

Shows how fast the model is answering in Claude Code: one log line per main-loop model request in the transcript, plus a pinned status line under the prompt that also shows each running subagent's speed.

## Install

```bash
/plugin marketplace add vinhltt/agent-plugins
/plugin install tok-speed@agent-plugins-marketplace
```

Requires a Claude Code build with function hooks (`hooks.json` `modules`), 2.1.302 or later.

## What it shows

**Transcript** — a dim line after every model request of the main loop (not sent to the model):

```text
2026-10-18 17:15:52  Δ 31.8s  in: 93K  out: 1.2K  t: 14.6s  ttft: 0.9s  tok/s: 84.9/s
```

| Field | Meaning |
|---|---|
| `Δ` | Time since the previous line, or since the prompt was sent (includes tool time) |
| `in` | Input tokens of the request: uncached + cache write + cache read |
| `out` | `output_tokens` as reported by the API (thinking included) |
| `t` | Whole request duration, send to stop |
| `ttft` | Time to the first streamed chunk |
| `tok/s` | `out / t` |

**Status line** — pinned under the prompt, beside any existing `statusLine`:

```text
tok/s: 84.9 · in: 1.5M · out: 13K
```

While a response streams it shows a live estimate (`~72 (live)`, from streamed characters at ~4 chars/token); the API's exact figure replaces it when the request ends. `in`/`out` are session totals of the main loop.

**Subagents** — while subagents run, the status line adds `│` and one `<label> <tok/s>` segment per running subagent, each with its own live estimate and exact figure:

```text
tok/s: 84.9 · in: 1.5M · out: 13K │ scout-auth 61.2 · review-pr ~72 (live)
```

The label is the Agent call's `description` (whitespace folded to one line, cut to 20 characters with `…`; the agent type when the description is empty; `-<last 4 of id>` added when two running agents share one). A segment appears with the agent's first figure and leaves when its run ends. With no subagent running the line is exactly the main readout above.

When a subagent run ends, one dim summary line goes to the main transcript (no per-request lines for subagents):

```text
agent scout-auth  reqs: 7  in: 310K  out: 4.2K  t: 58.3s  tok/s: 72.0/s
```

| Field | Meaning |
|---|---|
| `reqs` | Model requests of the run that reported usage |
| `in` / `out` | Totals of those requests, as above |
| `t` | Wall-clock length of the run (tool time included) |
| `tok/s` | Σ`out` / Σ request duration |

## Notes

- `tok/s` is measured over the whole request, as omp does. Hidden thinking streams no chunks yet counts in `output_tokens`, so timing from the first chunk would inflate the rate.
- Subagents are shown once `$.agent.list()` names them; teammates and ids it does not list (workflow agents, compaction/memory forks) get no segment and no summary line. A background agent logs one summary line per run.
- The status line has no length cap: with many subagents the terminal may cut or wrap it; the main readout stays first.
- Dim lines are transcript-only, never sent to the model. `claude -p` / SDK hosts receive them as `ui_log` / `ui_status` messages.
- Session totals live in the module and restart when the plugin reloads.

## Layout

```text
plugins/tok-speed/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json          # { "modules": ["./register.ts"] }
│   ├── register.ts         # turn.start + turn.step + turn.complete hooks, status line
│   ├── register.test.ts    # claude plugin test plugins/tok-speed
│   ├── meter.ts            # per-request timing over a step stream (no host calls)
│   ├── meter.test.ts
│   └── format.ts           # timestamp / token / seconds formatting
├── tsconfig.json           # extends the types Claude Code lays in .claude-plugin/types/
├── CHANGELOG.md
└── README.md
```

## Development

```bash
claude plugin validate plugins/tok-speed
claude plugin test plugins/tok-speed
claude --plugin-dir plugins/tok-speed   # load from disk, hot-reloads on save
```
