# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [0.2.0] - 2026-10-26

### Added
- Status line shows one `<label> <tok/s>` segment per running subagent after the main readout (live estimate while streaming, exact figure after each request); segments leave when the run ends
- One dim summary line per subagent run in the main transcript: requests, input/output tokens, wall-clock time and tok/s
- Labels come from the Agent call description (folded to one line, cut to 20 characters, agent type when empty, id suffix for duplicates); teammates and agents $.agent.list() does not name are left out

### Changed
- Per-request measuring moved into a shared meter used by both the main loop and subagents; main log line and status text unchanged
- A request that fails or is abandoned mid-stream no longer leaves a live estimate standing on the status line

## 0.1.0 - 2026-10-18

### Added

- Per-request transcript line: timestamp, delta, input/output tokens, duration, TTFT, tok/s.
- Pinned status line with the latest tok/s (live estimate while streaming) and session token totals.
- Tests for the log line, status line and subagent exclusion.
