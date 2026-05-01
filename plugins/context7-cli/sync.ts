#!/usr/bin/env bun
// Manual sync: fetch context7-cli + find-docs skills from upstash/context7@master
// Usage: bun plugins/context7-cli/sync.ts          # write files
//        bun plugins/context7-cli/sync.ts --check  # verify only, exit non-zero if drift

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const UPSTREAM_OWNER = "upstash";
const UPSTREAM_REPO = "context7";
const UPSTREAM_REF = "master";
const SOURCES = ["skills/context7-cli", "skills/find-docs"] as const;

const PLUGIN_DIR = dirname(new URL(import.meta.url).pathname);
const SKILLS_DIR = join(PLUGIN_DIR, "skills");
const MANIFEST_PATH = join(PLUGIN_DIR, ".sync-manifest.json");

type Manifest = {
  upstream: { owner: string; repo: string; ref: string; commit_sha: string };
  synced_at: string;
  files: Record<string, string>; // relative path → blob sha
};

type TreeEntry = { path: string; type: "blob" | "tree"; sha: string };

async function gh<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "agent-plugins-context7-sync",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

async function resolveCommitSha(): Promise<string> {
  const data = await gh<{ sha: string }>(
    `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/commits/${UPSTREAM_REF}`,
  );
  return data.sha;
}

async function listTree(commitSha: string): Promise<TreeEntry[]> {
  const data = await gh<{ tree: TreeEntry[]; truncated: boolean }>(
    `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/git/trees/${commitSha}?recursive=1`,
  );
  if (data.truncated) throw new Error("Upstream tree truncated — sync needs paginated fetch");
  return data.tree;
}

async function fetchRaw(commitSha: string, path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/${commitSha}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Raw fetch ${res.status}: ${url}`);
  return res.text();
}

function targetPath(upstreamPath: string): string {
  // skills/context7-cli/SKILL.md → <plugin>/skills/context7-cli/SKILL.md
  return join(SKILLS_DIR, upstreamPath.slice("skills/".length));
}

async function loadManifest(): Promise<Manifest | null> {
  if (!existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
}

async function main() {
  const { values } = parseArgs({
    options: { check: { type: "boolean", default: false } },
  });
  const checkMode = values.check ?? false;

  console.log(`Resolving ${UPSTREAM_OWNER}/${UPSTREAM_REPO}@${UPSTREAM_REF}…`);
  const commitSha = await resolveCommitSha();
  console.log(`Commit: ${commitSha}`);

  const tree = await listTree(commitSha);
  const blobs = tree.filter(
    (t) => t.type === "blob" && SOURCES.some((src) => t.path === src || t.path.startsWith(`${src}/`)),
  );
  if (blobs.length === 0) throw new Error("No upstream files matched SOURCES");
  console.log(`Found ${blobs.length} files to sync`);

  const newManifestFiles: Record<string, string> = {};
  for (const blob of blobs) {
    const rel = blob.path.slice("skills/".length);
    newManifestFiles[rel] = blob.sha;
  }

  if (checkMode) {
    const existing = await loadManifest();
    if (!existing) {
      console.error("FAIL: no .sync-manifest.json found");
      process.exit(1);
    }
    const drift: string[] = [];
    for (const [rel, sha] of Object.entries(newManifestFiles)) {
      if (existing.files[rel] !== sha) drift.push(rel);
    }
    for (const rel of Object.keys(existing.files)) {
      if (!(rel in newManifestFiles)) drift.push(`${rel} (removed upstream)`);
    }
    if (drift.length > 0) {
      console.error("FAIL: drift detected:");
      for (const d of drift) console.error(`  - ${d}`);
      process.exit(1);
    }
    console.log("OK: local matches upstream");
    return;
  }

  // Write mode: clear existing skill folders to handle removals, then refetch all.
  for (const src of SOURCES) {
    const local = join(SKILLS_DIR, src.slice("skills/".length));
    if (existsSync(local)) await rm(local, { recursive: true, force: true });
  }

  for (const blob of blobs) {
    const dest = targetPath(blob.path);
    await mkdir(dirname(dest), { recursive: true });
    const content = await fetchRaw(commitSha, blob.path);
    await writeFile(dest, content);
    console.log(`  wrote ${blob.path} → ${dest.replace(PLUGIN_DIR + "/", "")}`);
  }

  const manifest: Manifest = {
    upstream: { owner: UPSTREAM_OWNER, repo: UPSTREAM_REPO, ref: UPSTREAM_REF, commit_sha: commitSha },
    synced_at: new Date().toISOString(),
    files: newManifestFiles,
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Synced ${blobs.length} files. Manifest: .sync-manifest.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
