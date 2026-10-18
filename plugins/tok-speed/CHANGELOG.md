# Changelog

## 0.1.0 - 2026-10-18

### Added

- Per-request transcript line: timestamp, delta, input/output tokens, duration, TTFT, tok/s.
- Pinned status line with the latest tok/s (live estimate while streaming) and session token totals.
- Tests for the log line, status line and subagent exclusion.
