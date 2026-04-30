#!/usr/bin/env bun
// CLI: manifest — compute / compare / seed-versions for agent-plugins repo.
//
// Subcommands:
//   compute        Walk repo, sha256 every tracked file, write manifest.json (or stdout).
//   compare        Diff current scan vs manifest.json. Exit 1 if any drift.
//   seed-versions  Bootstrap component versions from current frontmatter (one-shot migration).
//
// Top-level layout (agent-plugins):
//   .claude-plugin/marketplace.json    → version + checksum
//   plugins/<name>/.claude-plugin/plugin.json → version + checksum (per plugin)
//   plugins/<name>/**                  → checksums nested under plugins[<name>]
//   skills/<name>/SKILL.md             → version (frontmatter metadata.version) + checksum
//   agents/<name>.md                   → version (frontmatter version) + checksum
//   hooks/<name>.json                  → checksum only (no version per D5)
//   commands/<name>.md OR /<name>/...  → checksum only (no version per D5)
//   <other>                            → checksum under top-level "files"
//
// TODO(sync): consider porting bug fixes back to specify-changelog-generator.

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const EXCLUDE_DIRS = new Set([".git", "node_modules", "__pycache__", ".logs"]);
const EXCLUDE_EXTENSIONS = new Set([".pyc"]);
const MANIFEST_FILENAME = "manifest.json";

interface ComponentEntry {
  version?: string;
  checksum: string;
}

interface ComponentBuckets {
  skills?: Record<string, ComponentEntry>;
  agents?: Record<string, ComponentEntry>;
  hooks?: Record<string, { checksum: string }>;
  commands?: Record<string, { checksum: string }>;
}

interface PluginEntry {
  version: string;
  checksum: string;
  components?: ComponentBuckets;
}

export interface Manifest {
  algorithm: "sha256";
  generated_at: string;
  marketplace: { version: string; checksum: string };
  plugins: Record<string, PluginEntry>;
  components: ComponentBuckets;
  files: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Frontmatter parser (minimal YAML subset: top-level scalars + 1-level nesting)
// ---------------------------------------------------------------------------

function stripQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

export function parseFrontmatter(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = raw.slice(3, end).replace(/^\n/, "");
  const result: Record<string, unknown> = {};
  let currentNested: Record<string, unknown> | null = null;
  for (const line of block.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const isNested = /^\s{2,}\S/.test(line);
    if (isNested && currentNested) {
      const m = line.trim().match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
      if (m && m[2] !== "") currentNested[m[1]!] = stripQuotes(m[2]!);
      continue;
    }
    if (line.startsWith(" ")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (val === "") {
      currentNested = {};
      result[key] = currentNested;
    } else {
      result[key] = stripQuotes(val);
      currentNested = null;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// File scanning + hashing
// ---------------------------------------------------------------------------

function isExcluded(relPath: string, customExcludes: readonly string[]): boolean {
  const parts = relPath.split("/");
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  const dot = relPath.lastIndexOf(".");
  if (dot !== -1 && EXCLUDE_EXTENSIONS.has(relPath.slice(dot))) return true;
  if (relPath === MANIFEST_FILENAME) return true;
  for (const pat of customExcludes) {
    if (pat.endsWith("/**")) {
      if (relPath.startsWith(pat.slice(0, -3) + "/")) return true;
    } else if (pat.endsWith("/")) {
      if (relPath.startsWith(pat)) return true;
    } else if (relPath === pat) {
      return true;
    }
  }
  return false;
}

/**
 * Enumerate files via `git ls-files` (tracked + staged paths). Returns null if
 * `root` is not a git repo so callers can fall back to a disk walk (used by
 * tests against temp fixtures).
 */
function listGitFiles(root: string): string[] | null {
  try {
    const out = execFileSync("git", ["-C", root, "ls-files"], {
      encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });
    return out.split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

function walkDisk(root: string, customExcludes: readonly string[]): string[] {
  const results: string[] = [];
  function walk(dir: string): void {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(/[\\/]/).join("/");
      if (isExcluded(rel, customExcludes)) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) results.push(rel);
    }
  }
  walk(root);
  results.sort();
  return results;
}

function sha256(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function readJsonSafe<T>(absPath: string): T | null {
  if (!existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function readVersionFromFrontmatter(absPath: string, kind: "skill" | "agent"): string | null {
  if (!existsSync(absPath)) return null;
  const raw = readFileSync(absPath, "utf-8");
  const fm = parseFrontmatter(raw);
  if (!fm) return null;
  if (kind === "skill") {
    const meta = fm.metadata as Record<string, unknown> | undefined;
    return (meta?.version as string | undefined) ?? (fm.version as string | undefined) ?? null;
  }
  return (fm.version as string | undefined) ?? null;
}

function readChangelogExcludes(root: string): string[] {
  const data = readJsonSafe<{ changelog?: { exclude?: unknown } }>(join(root, ".agent-plugins.json"));
  const ex = data?.changelog?.exclude;
  return Array.isArray(ex) ? (ex as string[]) : [];
}

// ---------------------------------------------------------------------------
// Component identification + manifest building
// ---------------------------------------------------------------------------

/** When `staged` is provided, gate component anchor files (SKILL.md, plugin.json, agent.md, etc.)
 *  against the staged set. `null` = non-git context (tests) → no gating. */
function gated(rel: string, staged: Set<string> | null): boolean {
  return staged === null || staged.has(rel);
}

/** Component identification rooted at an arbitrary directory.
 *  `prefix` is the rel-path prefix used for staged-set lookups
 *  (empty for top-level scan, "plugins/<name>/" for plugin scan). */
function identifyComponents(
  baseDir: string,
  prefix: string,
  staged: Set<string> | null,
): ComponentBuckets {
  const buckets: ComponentBuckets = {};

  const skillsDir = join(baseDir, "skills");
  if (existsSync(skillsDir) && statSync(skillsDir).isDirectory()) {
    buckets.skills = {};
    for (const name of readdirSync(skillsDir).sort()) {
      const dir = join(skillsDir, name);
      if (!statSync(dir).isDirectory()) continue;
      const skillMd = join(dir, "SKILL.md");
      if (!existsSync(skillMd)) continue;
      const rel = `${prefix}skills/${name}/SKILL.md`;
      if (!gated(rel, staged)) continue;
      buckets.skills[name] = {
        version: readVersionFromFrontmatter(skillMd, "skill") ?? "0.1.0",
        checksum: sha256(skillMd),
      };
    }
  }

  const agentsDir = join(baseDir, "agents");
  if (existsSync(agentsDir) && statSync(agentsDir).isDirectory()) {
    buckets.agents = {};
    for (const name of readdirSync(agentsDir).sort()) {
      if (!name.endsWith(".md")) continue;
      const file = join(agentsDir, name);
      if (!statSync(file).isFile()) continue;
      const rel = `${prefix}agents/${name}`;
      if (!gated(rel, staged)) continue;
      buckets.agents[name.slice(0, -3)] = {
        version: readVersionFromFrontmatter(file, "agent") ?? "0.1.0",
        checksum: sha256(file),
      };
    }
  }

  const hooksDir = join(baseDir, "hooks");
  if (existsSync(hooksDir) && statSync(hooksDir).isDirectory()) {
    buckets.hooks = {};
    for (const name of readdirSync(hooksDir).sort()) {
      if (!name.endsWith(".json")) continue;
      const file = join(hooksDir, name);
      if (!statSync(file).isFile()) continue;
      const rel = `${prefix}hooks/${name}`;
      if (!gated(rel, staged)) continue;
      buckets.hooks[name.slice(0, -5)] = { checksum: sha256(file) };
    }
  }

  const commandsDir = join(baseDir, "commands");
  if (existsSync(commandsDir) && statSync(commandsDir).isDirectory()) {
    buckets.commands = {};
    for (const name of readdirSync(commandsDir).sort()) {
      const full = join(commandsDir, name);
      const stat = statSync(full);
      if (stat.isFile() && name.endsWith(".md")) {
        const rel = `${prefix}commands/${name}`;
        if (!gated(rel, staged)) continue;
        buckets.commands[name.slice(0, -3)] = { checksum: sha256(full) };
      } else if (stat.isDirectory()) {
        const idx = join(full, "index.md");
        if (!existsSync(idx)) continue;
        const rel = `${prefix}commands/${name}/index.md`;
        if (!gated(rel, staged)) continue;
        buckets.commands[name] = { checksum: sha256(idx) };
      }
    }
  }

  // Strip empty buckets to keep manifest tidy.
  for (const k of ["skills", "agents", "hooks", "commands"] as const) {
    if (buckets[k] && Object.keys(buckets[k]!).length === 0) delete buckets[k];
  }
  return buckets;
}

function scanPlugins(root: string, staged: Set<string> | null): Record<string, PluginEntry> {
  const pluginsDir = join(root, "plugins");
  if (!existsSync(pluginsDir) || !statSync(pluginsDir).isDirectory()) return {};
  const out: Record<string, PluginEntry> = {};
  for (const name of readdirSync(pluginsDir).sort()) {
    if (name.startsWith(".")) continue;
    const dir = join(pluginsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const pjPath = join(dir, ".claude-plugin", "plugin.json");
    if (!existsSync(pjPath)) continue;
    const pjRel = `plugins/${name}/.claude-plugin/plugin.json`;
    if (!gated(pjRel, staged)) continue;
    const pj = readJsonSafe<{ version?: string }>(pjPath);
    out[name] = {
      version: pj?.version ?? "0.1.0",
      checksum: sha256(pjPath),
      components: identifyComponents(dir, `plugins/${name}/`, staged),
    };
    if (out[name]!.components && Object.keys(out[name]!.components!).length === 0) {
      delete out[name]!.components;
    }
  }
  return out;
}

export function buildManifest(root: string): Manifest {
  const customExcludes = readChangelogExcludes(root);
  const gitFiles = listGitFiles(root);
  const stagedSet: Set<string> | null = gitFiles
    ? new Set(gitFiles.filter((rel) => !isExcluded(rel, customExcludes)))
    : null;
  const allFiles = stagedSet ? [...stagedSet].sort() : walkDisk(root, customExcludes);

  const filesMap: Record<string, string> = {};
  for (const rel of allFiles) {
    filesMap[rel] = sha256(join(root, rel));
  }

  const marketplacePath = join(root, ".claude-plugin", "marketplace.json");
  const marketplaceData = readJsonSafe<{ metadata?: { version?: string } }>(marketplacePath);
  const marketplaceRel = ".claude-plugin/marketplace.json";
  const marketplaceTracked = !stagedSet || stagedSet.has(marketplaceRel);

  return {
    algorithm: "sha256",
    generated_at: new Date().toISOString(),
    marketplace: {
      version: marketplaceData?.metadata?.version ?? "0.0.0",
      checksum: existsSync(marketplacePath) && marketplaceTracked ? sha256(marketplacePath) : "",
    },
    plugins: scanPlugins(root, stagedSet),
    components: identifyComponents(root, "", stagedSet),
    files: filesMap,
  };
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

interface DriftReport {
  marketplace_drift: boolean;
  plugin_drift: string[];
  file_added: string[];
  file_changed: string[];
  file_removed: string[];
}

function compareManifests(current: Manifest, existing: Manifest): DriftReport {
  const report: DriftReport = {
    marketplace_drift:
      current.marketplace.checksum !== existing.marketplace.checksum ||
      current.marketplace.version !== existing.marketplace.version,
    plugin_drift: [],
    file_added: [],
    file_changed: [],
    file_removed: [],
  };

  const allPluginNames = new Set([
    ...Object.keys(current.plugins),
    ...Object.keys(existing.plugins),
  ]);
  for (const p of allPluginNames) {
    const a = current.plugins[p];
    const b = existing.plugins[p];
    if (!a || !b) {
      report.plugin_drift.push(p);
      continue;
    }
    if (a.checksum !== b.checksum || a.version !== b.version) {
      report.plugin_drift.push(p);
    }
  }

  const curFiles = new Set(Object.keys(current.files));
  const exFiles = new Set(Object.keys(existing.files));
  for (const f of curFiles) {
    if (!exFiles.has(f)) report.file_added.push(f);
    else if (current.files[f] !== existing.files[f]) report.file_changed.push(f);
  }
  for (const f of exFiles) {
    if (!curFiles.has(f)) report.file_removed.push(f);
  }
  report.file_added.sort();
  report.file_changed.sort();
  report.file_removed.sort();
  return report;
}

function hasDrift(r: DriftReport): boolean {
  return (
    r.marketplace_drift ||
    r.plugin_drift.length > 0 ||
    r.file_added.length > 0 ||
    r.file_changed.length > 0 ||
    r.file_removed.length > 0
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `manifest — compute / compare / seed-versions for agent-plugins

Usage:
  bun manifest.ts <command> [options]

Commands:
  compute        Scan repo, emit manifest JSON (default: stdout)
  compare        Compare current scan vs manifest.json — exit 1 on drift
  seed-versions  Walk components, persist current frontmatter versions to manifest.json

Options:
  --root <path>  Project root (default: cwd)
  --write        compute: write to <root>/manifest.json instead of stdout
  --help         Show this message
`;

function getManifestPath(root: string): string {
  return join(root, MANIFEST_FILENAME);
}

function writeManifest(path: string, m: Manifest): void {
  writeFileSync(path, JSON.stringify(m, null, 2) + "\n");
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      root: { type: "string" },
      write: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
    process.exit(positionals.length === 0 ? 1 : 0);
  }

  const cmd = positionals[0];
  const root = values.root ?? process.cwd();
  const manifestPath = getManifestPath(root);

  if (cmd === "compute") {
    const m = buildManifest(root);
    if (values.write) {
      writeManifest(manifestPath, m);
      process.stderr.write(`Wrote ${manifestPath}\n`);
    } else {
      process.stdout.write(JSON.stringify(m, null, 2) + "\n");
    }
    process.exit(0);
  }

  if (cmd === "compare") {
    const existing = readJsonSafe<Manifest>(manifestPath);
    if (!existing) {
      process.stderr.write(`error: ${manifestPath} not found — run \`compute --write\` first\n`);
      process.exit(1);
    }
    const current = buildManifest(root);
    const drift = compareManifests(current, existing);
    if (hasDrift(drift)) {
      process.stdout.write(JSON.stringify(drift, null, 2) + "\n");
      process.exit(1);
    }
    process.stderr.write("OK: manifest.json is up to date\n");
    process.exit(0);
  }

  if (cmd === "seed-versions") {
    // Build manifest from current state — frontmatter versions are already seeded
    // by buildManifest (it calls readVersionFromFrontmatter on each component).
    const m = buildManifest(root);
    writeManifest(manifestPath, m);
    process.stderr.write(`Seeded versions into ${manifestPath}\n`);
    process.exit(0);
  }

  process.stderr.write(`error: unknown command "${cmd}"\n${HELP}`);
  process.exit(1);
}

if (import.meta.main) {
  await main();
}
