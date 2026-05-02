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
