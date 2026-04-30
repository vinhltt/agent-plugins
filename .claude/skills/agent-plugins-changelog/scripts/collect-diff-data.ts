#!/usr/bin/env bun
// Collect git diff data for the agent-plugins repo (top-level layout).
//
// Outputs structured JSON: version (from .claude-plugin/marketplace.json) +
// filtered/grouped changes. Config (changelog.exclude) read from .agent-plugins.json.
// Pure mechanical port of specify-changelog-generator/collect-diff-data.ts adapted
// for whole-repo scope + per-plugin / per-component grouping.
//
// TODO(sync): consider porting bug fixes back to specify-changelog-generator.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

// Always excluded from changelog: build artifacts (CHANGELOG, manifest), boilerplate
// (LICENSE), and git internals. Skill self-path is NOT excluded — changes to
// `.claude/skills/<name>/...` are tracked and grouped as `Skills/<name>`.
const DEFAULT_EXCLUDES = [
  "CHANGELOG.md",
  "LICENSE",
  "manifest.json",
  ".git/**"
] as const;

interface DiffEntry {
  status: string;
  path: string;
  old_path?: string;
  group?: string;
}

interface Output {
  version: string | null;
  changes: DiffEntry[];
}

/** Convert a path prefix (supports ** / * glob) to a regex for startswith matching. */
export function prefixToRegex(prefix: string): RegExp {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\\\*\\\*/g, ".+").replace(/\\\*/g, "[^/]+");
  return new RegExp("^" + pattern);
}

/**
 * Map file path to component group label per top-level layout:
 *   plugins/<name>/...                 → "<name>"
 *   skills/<name>/...                  → "Skills/<name>"
 *   .claude/skills/<name>/...          → "Skills/<name>"  (repo-internal Claude Code skills,
 *                                                          symmetric with top-level skills/)
 *   agents/<name>.md                   → "Agents/<name>"
 *   .claude/agents/<name>.md           → "Agents/<name>"
 *   hooks/<name>.json                  → "Hooks/<name>"
 *   .claude/hooks/<name>.json          → "Hooks/<name>"
 *   commands/<name>.md OR /<name>/...  → "Commands/<name>"
 *   .claude/commands/<name>.md         → "Commands/<name>"
 *   .claude-plugin/marketplace.json    → "Marketplace"
 *   else                               → "General"
 */
export function classifyGroup(path: string): string {
  const normalized = path.replace(/\\/g, "/");

  if (normalized === ".claude-plugin/marketplace.json") return "Marketplace";

  const parts = normalized.split("/");
  let head = parts[0];
  let second = parts[1] ?? "";
  let third = parts[2] ?? "";

  // Repo-internal Claude Code components live under `.claude/<kind>/...`.
  // Strip the leading `.claude/` so the same kind/name rules apply.
  if (head === ".claude" && second) {
    head = second;
    second = third;
  }

  if (head === "plugins" && second) return second;

  const stripExt = (s: string, ext: string): string =>
    s.endsWith(ext) ? s.slice(0, -ext.length) : s;

  if (head === "skills" && second) return `Skills/${second}`;
  if (head === "agents" && second) return `Agents/${stripExt(second, ".md")}`;
  if (head === "hooks" && second) return `Hooks/${stripExt(second, ".json")}`;
  if (head === "commands" && second) return `Commands/${stripExt(second, ".md")}`;

  return "General";
}

/** Check if path matches any exclude pattern. Supports glob (**), trailing slash, exact. */
export function isExcluded(path: string, excludes: readonly string[]): boolean {
  const normalized = path.replace(/\\/g, "/");
  for (const pattern of excludes) {
    const p = pattern.replace(/\\/g, "/");
    if (p.includes("**") || p.includes("*")) {
      if (prefixToRegex(p).test(normalized)) return true;
    } else if (p.endsWith("/")) {
      if (normalized.startsWith(p)) return true;
    } else {
      if (normalized === p) return true;
    }
  }
  return false;
}

/** Parse git diff --name-status output into structured entries. */
export function parseDiffLines(lines: string[]): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const statusRaw = (parts[0] ?? "").trim();
    if (!statusRaw) continue;
    const status = statusRaw[0]!; // Normalize R100 → R

    if ((status === "R" || status === "C") && parts.length >= 3) {
      entries.push({ status, old_path: parts[1]!, path: parts[2]! });
    } else if (parts.length >= 2) {
      entries.push({ status, path: parts[1]! });
    }
  }
  return entries;
}

/** Auto-detect git repository root. */
async function detectGitRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    console.error("Error: not a git repository");
    process.exit(1);
  }
  const stdout = await new Response(proc.stdout).text();
  return stdout.trim();
}

/** Read version from marketplace.json metadata.version. Returns semver or null. */
export async function parseMarketplaceVersion(projectRoot: string): Promise<string | null> {
  const marketplacePath = join(projectRoot, ".claude-plugin", "marketplace.json");
  if (!existsSync(marketplacePath)) return null;
  try {
    const data = await Bun.file(marketplacePath).json();
    return data?.metadata?.version ?? null;
  } catch {
    return null;
  }
}

/** Read changelog.exclude from .agent-plugins.json. Empty array if config missing. */
export async function parseChangelogExcludes(projectRoot: string): Promise<string[]> {
  const jsonPath = join(projectRoot, ".agent-plugins.json");
  if (!existsSync(jsonPath)) return [];
  try {
    const data = await Bun.file(jsonPath).json();
    const cfg = data?.changelog;
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return [];
    return Array.isArray(cfg.exclude) ? cfg.exclude : [];
  } catch {
    return [];
  }
}

/** Run git diff --name-status and return raw output lines. */
async function runGitDiff(projectRoot: string, sinceRef: string | undefined): Promise<string[]> {
  const cmd = sinceRef
    ? ["git", "diff", "--name-status", `${sinceRef}..HEAD`]
    : ["git", "diff", "--cached", "--name-status"];
  const proc = Bun.spawn(cmd, { cwd: projectRoot, stdout: "pipe", stderr: "pipe" });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const stderr = (await new Response(proc.stderr).text()).trim();
    console.error(`Error running git diff: ${stderr}`);
    process.exit(1);
  }
  const stdout = await new Response(proc.stdout).text();
  return stdout.trim() ? stdout.trim().split(/\r?\n/) : [];
}

const HELP = `collect-diff-data — emit grouped JSON diff for agent-plugins changelog

Usage:
  bun collect-diff-data.ts [--since=<git-ref>] [--root=<path>]

Options:
  --since <ref>   Compute diff <ref>..HEAD (default: staged changes)
  --root <path>   Project root (default: auto-detect via git)
  --help          Show this message
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      since: { type: "string" },
      root: { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (values.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const projectRoot = values.root ?? (await detectGitRoot());

  const version = await parseMarketplaceVersion(projectRoot);
  const customExcludes = await parseChangelogExcludes(projectRoot);
  const allExcludes = [...DEFAULT_EXCLUDES, ...customExcludes];

  const diffLines = await runGitDiff(projectRoot, values.since);
  const entries = parseDiffLines(diffLines);

  const changes: DiffEntry[] = [];
  for (const entry of entries) {
    if (isExcluded(entry.path, allExcludes)) continue;
    entry.group = classifyGroup(entry.path);
    changes.push(entry);
  }

  const output: Output = { version, changes };
  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.main) {
  await main();
}
