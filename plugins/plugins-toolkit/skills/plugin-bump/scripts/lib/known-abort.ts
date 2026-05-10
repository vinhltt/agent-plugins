// TODO(sync): origin = .claude/skills/skill-bump/scripts/lib/known-abort.ts
// Port date: 2026-05-09. Source SHA: 3d6e868. Keep API parity unless port-specific divergence is documented here.

// Controlled-exit error type. Caller surfaces the message + exits with `exitCode`.
// Non-KnownAbort errors → exit 99 (unexpected).
export class KnownAbort extends Error {
  exitCode: number;
  constructor(msg: string, exitCode: number) {
    super(msg);
    this.name = 'KnownAbort';
    this.exitCode = exitCode;
  }
}
