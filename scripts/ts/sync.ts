#!/usr/bin/env bun
// Generic plugin sync runner. Reads sync.config.json, syncs each plugin from GitHub.
// Usage: bun scripts/ts/sync.ts [--plugin=<name> ...] [--check]

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

type Source = { from: string; to: string };
type Upstream = { type: "github"; owner: string; repo: string; ref: string };
type PluginConfig = { name: string; upstream: Upstream; sources: Source[] };
type Config = { plugins: PluginConfig[] };
type TreeEntry = { path: string; type: "blob" | "tree"; sha: string };
type Manifest = {
  upstream: { owner: string; repo: string; ref: string; commit_sha: string };
  synced_at: string;
  files: Record<string, string>;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..");
const CONFIG_PATH = join(SCRIPT_DIR, "sync.config.json");
const PLUGIN_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
// GitHub allows owner/repo with [A-Za-z0-9._-]; ref allows additionally `/`.
const GH_SLUG_RE = /^[A-Za-z0-9._-]+$/;
const GH_REF_RE = /^[A-Za-z0-9._\-/]+$/;

function pluginDir(name: string): string {
  return join(REPO_ROOT, "plugins", name);
}

function manifestPath(name: string): string {
  return join(pluginDir(name), ".sync-manifest.json");
}

function validatePath(p: string, field: string): void {
  if (!p) throw new Error(`${field}: empty`);
  if (p.startsWith("/")) throw new Error(`${field}: absolute path not allowed: "${p}"`);
  const segs = p.split("/");
  if (segs.some((s) => s === ".." || s === ".")) {
    throw new Error(`${field}: path traversal segment not allowed: "${p}"`);
  }
}

function validateConfig(raw: unknown): Config {
  if (!raw || typeof raw !== "object") throw new Error("config: not an object");
  const cfg = raw as Config;
  if (!Array.isArray(cfg.plugins) || cfg.plugins.length === 0) {
    throw new Error("config.plugins: must be non-empty array");
  }
  const seen = new Set<string>();
  for (const p of cfg.plugins ?? []) {
    if (typeof p?.name !== "string" || !PLUGIN_NAME_RE.test(p.name)) {
      throw new Error(`plugin.name: invalid "${p?.name}"`);
    }
    if (seen.has(p.name)) throw new Error(`plugin.name: duplicate "${p.name}"`);
    seen.add(p.name);
    if (!p.upstream || p.upstream.type !== "github") {
      throw new Error(`${p.name}.upstream.type: must be "github"`);
    }
    const ownerOk = typeof p.upstream.owner === "string" && GH_SLUG_RE.test(p.upstream.owner);
    const repoOk = typeof p.upstream.repo === "string" && GH_SLUG_RE.test(p.upstream.repo);
    const refOk = typeof p.upstream.ref === "string" && GH_REF_RE.test(p.upstream.ref);
    if (!ownerOk) throw new Error(`${p.name}.upstream.owner: invalid "${p.upstream.owner}"`);
    if (!repoOk) throw new Error(`${p.name}.upstream.repo: invalid "${p.upstream.repo}"`);
    if (!refOk) throw new Error(`${p.name}.upstream.ref: invalid "${p.upstream.ref}"`);
    if (!Array.isArray(p.sources) || p.sources.length === 0) {
      throw new Error(`${p.name}.sources: must be non-empty array`);
    }
    for (const s of p.sources) {
      if (typeof s?.from !== "string") throw new Error(`${p.name}.sources[].from: must be string`);
      if (typeof s?.to !== "string") throw new Error(`${p.name}.sources[].to: must be string`);
      validatePath(s.from, `${p.name}.sources[].from`);
      validatePath(s.to, `${p.name}.sources[].to`);
    }
  }
  return cfg;
}

async function loadConfig(): Promise<Config> {
  const raw = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  return validateConfig(raw);
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agent-plugins-sync",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function gh<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function resolveCommitSha(u: Upstream): Promise<string> {
  const data = await gh<{ sha: string }>(
    `https://api.github.com/repos/${u.owner}/${u.repo}/commits/${u.ref}`,
  );
  return data.sha;
}

async function listTree(u: Upstream, sha: string): Promise<TreeEntry[]> {
  const data = await gh<{ tree: TreeEntry[]; truncated: boolean }>(
    `https://api.github.com/repos/${u.owner}/${u.repo}/git/trees/${sha}?recursive=1`,
  );
  if (data.truncated) throw new Error(`Upstream tree truncated for ${u.owner}/${u.repo}@${sha}`);
  return data.tree;
}

async function fetchRaw(u: Upstream, sha: string, path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${u.owner}/${u.repo}/${sha}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Raw fetch ${res.status}: ${url}`);
  return res.text();
}

// Returns manifest key (relative to source.to) for an upstream blob path matching source.from.
// Match rule: blob.path === source.from OR blob.path startsWith source.from + "/".
function matchSource(blobPath: string, sources: Source[]): { source: Source; key: string } | null {
  for (const src of sources) {
    if (blobPath === src.from || blobPath.startsWith(src.from + "/")) {
      // key = blob path relative to dirname(from), so basename(from) is preserved
      const parent = posix.dirname(src.from);
      const key = parent === "." ? blobPath : blobPath.slice(parent.length + 1);
      return { source: src, key };
    }
  }
  return null;
}

async function loadManifest(plugin: string): Promise<Manifest | null> {
  const p = manifestPath(plugin);
  if (!existsSync(p)) return null;
  return JSON.parse(await readFile(p, "utf8"));
}

async function syncPlugin(p: PluginConfig, checkMode: boolean): Promise<void> {
  console.log(`\n[${p.name}] Resolving ${p.upstream.owner}/${p.upstream.repo}@${p.upstream.ref}…`);
  const sha = await resolveCommitSha(p.upstream);
  console.log(`[${p.name}] Commit: ${sha}`);

  const tree = await listTree(p.upstream, sha);
  const matched: { entry: TreeEntry; source: Source; key: string }[] = [];
  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    const m = matchSource(entry.path, p.sources);
    if (m) matched.push({ entry, source: m.source, key: m.key });
  }
  if (matched.length === 0) throw new Error(`[${p.name}] No upstream files matched sources`);
  console.log(`[${p.name}] Matched ${matched.length} files`);

  const newFiles: Record<string, string> = {};
  for (const m of matched) newFiles[m.key] = m.entry.sha;

  if (checkMode) {
    const existing = await loadManifest(p.name);
    if (!existing) throw new Error(`[${p.name}] No .sync-manifest.json found`);
    const drift: string[] = [];
    for (const [k, sha] of Object.entries(newFiles)) {
      if (existing.files[k] !== sha) drift.push(k);
    }
    for (const k of Object.keys(existing.files)) {
      if (!(k in newFiles)) drift.push(`${k} (removed upstream)`);
    }
    if (drift.length > 0) {
      const lines = drift.map((d) => `  - ${d}`).join("\n");
      throw new Error(`[${p.name}] drift detected:\n${lines}`);
    }
    console.log(`[${p.name}] OK: local matches upstream`);
    return;
  }

  // Write mode: clear each target subtree, refetch all matched blobs.
  const clearedDirs = new Set<string>();
  for (const m of matched) {
    const subtree = join(pluginDir(p.name), m.source.to, posix.basename(m.source.from));
    if (clearedDirs.has(subtree)) continue;
    clearedDirs.add(subtree);
    if (existsSync(subtree)) await rm(subtree, { recursive: true, force: true });
  }

  for (const m of matched) {
    const dest = join(pluginDir(p.name), m.source.to, m.key);
    await mkdir(dirname(dest), { recursive: true });
    const content = await fetchRaw(p.upstream, sha, m.entry.path);
    await writeFile(dest, content);
    console.log(`[${p.name}]   wrote ${m.entry.path}`);
  }

  const manifest: Manifest = {
    upstream: { owner: p.upstream.owner, repo: p.upstream.repo, ref: p.upstream.ref, commit_sha: sha },
    synced_at: new Date().toISOString(),
    files: newFiles,
  };
  await writeFile(manifestPath(p.name), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[${p.name}] Synced ${matched.length} files`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      check: { type: "boolean", default: false },
      plugin: { type: "string", multiple: true },
    },
  });
  const checkMode = values.check ?? false;
  const filter = (values.plugin as string[] | undefined) ?? [];

  const cfg = await loadConfig();
  let plugins = cfg.plugins;
  if (filter.length > 0) {
    const known = new Set(plugins.map((p) => p.name));
    for (const name of filter) if (!known.has(name)) throw new Error(`unknown plugin: ${name}`);
    plugins = plugins.filter((p) => filter.includes(p.name));
  }

  const errors: { plugin: string; err: unknown }[] = [];
  for (const p of plugins) {
    try {
      await syncPlugin(p, checkMode);
    } catch (e) {
      console.error(`[${p.name}] ERROR:`, e instanceof Error ? e.message : e);
      errors.push({ plugin: p.name, err: e });
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} plugin(s) failed: ${errors.map((e) => e.plugin).join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
