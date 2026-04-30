#!/usr/bin/env bun
// CLI: verify — deterministic post-flight check for agent-plugins-changelog skill.
// Replaces commander with node:util.parseArgs (D7).
// 5 checks: CHANGELOG header, marketplace.json, plugin.json, frontmatter, cross-consistency.
//
// TODO(sync): consider porting bug fixes back to specify-changelog-generator.

import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import type { CheckOpts, CheckResult } from "./checks/types";
import { checkChangelogHeader } from "./checks/check-changelog-header";
import { checkMarketplaceVersion } from "./checks/check-marketplace-version";
import { checkPluginVersions } from "./checks/check-plugin-versions";
import { checkSkillVersions } from "./checks/check-skill-versions";
import { checkCrossConsistency } from "./checks/check-cross-consistency";

const PATTERNS = {
  plugin:  /^plugins\/([^/]+)\//,
  skill:   /^skills\/([^/]+)\//,
  agent:   /^agents\/([^/]+)\.md$/,
  hook:    /^hooks\/([^/]+)\.json$/,
  command: /^commands\/([^/]+)\.md$/,
};

interface InferResult {
  plugins: string[]; skills: string[]; agents: string[];
  hooks: string[]; commands: string[];
}

export function inferAffected(files: string[]): InferResult {
  const buckets = {
    plugins: new Set<string>(),
    skills: new Set<string>(),
    agents: new Set<string>(),
    hooks: new Set<string>(),
    commands: new Set<string>(),
  };
  for (const f of files) {
    for (const [key, re] of Object.entries(PATTERNS)) {
      const m = f.match(re);
      if (!m) continue;
      const bucket =
        key === "plugin"  ? "plugins"  :
        key === "skill"   ? "skills"   :
        key === "agent"   ? "agents"   :
        key === "hook"    ? "hooks"    : "commands";
      buckets[bucket as keyof typeof buckets].add(m[1]!);
      break;
    }
  }
  return {
    plugins:  [...buckets.plugins].sort(),
    skills:   [...buckets.skills].sort(),
    agents:   [...buckets.agents].sort(),
    hooks:    [...buckets.hooks].sort(),
    commands: [...buckets.commands].sort(),
  };
}

interface RunDeps { gitDiff?: (root: string) => string[] }

function defaultGitDiff(root: string): string[] {
  try {
    const out = execFileSync("git", ["-C", root, "diff", "--name-only", "HEAD"], {
      encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function runChecks(opts: CheckOpts, deps: RunDeps = {}): CheckResult[] {
  let { plugins, skills, agents } = opts;
  if (plugins.length === 0 && skills.length === 0 && agents.length === 0) {
    const git = deps.gitDiff ?? defaultGitDiff;
    const inferred = inferAffected(git(opts.root));
    plugins = inferred.plugins;
    skills = inferred.skills;
    agents = inferred.agents;
  }
  const resolved: CheckOpts = { ...opts, plugins, skills, agents };

  const results: CheckResult[] = [];
  results.push(checkChangelogHeader(resolved));
  results.push(checkMarketplaceVersion(resolved));
  results.push(...checkPluginVersions(resolved));
  results.push(...checkSkillVersions(resolved));
  results.push(...checkCrossConsistency(resolved));
  return results;
}

export function report(results: CheckResult[]): number {
  const failures = results.filter((r) => !r.ok);
  if (failures.length === 0) {
    process.stdout.write("ALL CHECKS PASSED\n");
    return 0;
  }
  for (const f of failures) {
    process.stdout.write(`✗ [${f.index}/5] ${f.name}\n`);
    if (f.expected !== undefined || f.actual !== undefined) {
      process.stdout.write(
        `        expected: ${f.expected ?? "(none)"}    actual: ${f.actual ?? "(none)"}\n`,
      );
    }
    if (f.fixHint) process.stdout.write(`        fix: ${f.fixHint}\n`);
  }
  return 1;
}

function parseCsv(v?: string): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

const HELP = `verify — deterministic post-flight check for agent-plugins-changelog

Usage:
  bun verify.ts --expected-version=<X.Y.Z> [options]

Options:
  --expected-version <version>  Target marketplace version (REQUIRED)
  --plugins <csv>               Affected plugin names (auto-inferred if omitted)
  --skills <csv>                Affected skill names (auto-inferred if omitted)
  --agents <csv>                Affected agent names (auto-inferred if omitted)
  --root <path>                 Project root (default: cwd)
  --help                        Show this message
`;

export function main(): void {
  const { values } = parseArgs({
    options: {
      "expected-version": { type: "string" },
      plugins: { type: "string" },
      skills: { type: "string" },
      agents: { type: "string" },
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

  if (!values["expected-version"]) {
    process.stderr.write(
      "error: --expected-version is required. SKILL.md must propose + confirm version before calling verify.ts.\n",
    );
    process.exit(1);
  }

  const checkOpts: CheckOpts = {
    root: values.root ?? process.cwd(),
    expectedVersion: values["expected-version"]!,
    plugins: parseCsv(values.plugins),
    skills:  parseCsv(values.skills),
    agents:  parseCsv(values.agents),
  };

  process.exit(report(runChecks(checkOpts)));
}

if (import.meta.main) {
  main();
}
