// Shared types for changelog verify checks.
// Each check is a pure function: read files, compare, return result.

export interface CheckResult {
  ok: boolean;
  index: number;        // 1..5 display index
  name: string;         // short label
  expected?: string;
  actual?: string;
  fixHint?: string;
  path?: string;
}

export interface CheckOpts {
  root: string;                  // absolute path to agent-plugins repo
  expectedVersion: string;       // X.Y.Z marketplace target
  plugins: string[];             // plugin names (may be empty → auto-inferred)
  skills: string[];              // skill names (top-level + plugin-scoped)
  agents: string[];              // agent names (top-level + plugin-scoped)
}
