# tok-speed

Shows how fast the model is answering in Claude Code: one log line per model request in the transcript, plus a pinned status line under the prompt.

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

## Notes

- `tok/s` is measured over the whole request, as omp does. Hidden thinking streams no chunks yet counts in `output_tokens`, so timing from the first chunk would inflate the rate.
- Subagent requests are not measured: several run concurrently and would fight over the one status line.
- Session totals live in the module and restart when the plugin reloads.

## Layout

```text
plugins/tok-speed/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json          # { "modules": ["./register.ts"] }
│   ├── register.ts         # turn.start + turn.step hooks
│   └── register.test.ts    # claude plugin test plugins/tok-speed
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
