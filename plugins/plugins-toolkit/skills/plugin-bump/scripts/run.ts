// CLI entrypoint for plugin-bump. Zero node:* imports, Bun-native.
// Pipeline: parse → validate → collect-diff → bump → discover → snapshot → cascade → manifest → changelog → verify

import { applyBump, inferBump, type DiffStatus } from './bump-rules';
import { computeManifest } from './manifest';
import { collectDiff } from './collect-diff-data';
import { appendEntry, type ChangelogEntry } from './changelog-writer';
import {
  assertInGitRepo, assertRefExists, isWorkingTreeDirty,
  repoCwdOf, gitLsFiles, toRepoRelative, stripTargetPrefix, type DiffEntry,
} from './lib/git-helpers';
import { isExcluded } from './lib/default-excludes';
import { discoverComponents } from './lib/component-discovery';
import { cascadeVersion } from './version-cascade';
import { verify, captureHeadSnapshot } from './verify';
import { KnownAbort } from './lib/known-abort';

// ── types ──

export interface CliArgs {
  target: string;
  since?: string;
  auto: boolean;
  dryRun: boolean;
  added: string[];
  changed: string[];
  removed: string[];
}

// ── arg parsing ──

export function parseArgs(argv: string[]): CliArgs {
  let target = '';
  let since: string | undefined;
  let auto = false;
  let dryRun = false;
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith('--target=')) target = arg.slice(9);
    else if (arg.startsWith('--since=')) since = arg.slice(8);
    else if (arg === '--auto') auto = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--added=')) { const v = arg.slice(8); if (v) added.push(v); }
    else if (arg.startsWith('--changed=')) { const v = arg.slice(10); if (v) changed.push(v); }
    else if (arg.startsWith('--removed=')) { const v = arg.slice(10); if (v) removed.push(v); }
    else throw new KnownAbort(`Unknown flag: ${arg}`, 2);
  }

  if (!target) throw new KnownAbort(
    'Usage: bun run.ts --target=<abs-path-to-plugin> [--since=<ref>] [--auto] [--dry-run] [--added=<text>]... [--changed=<text>]... [--removed=<text>]...',
    2,
  );

  return { target, since, auto, dryRun, added, changed, removed };
}

// ── plugin target validation ──

async function assertPluginTargetSafe(target: string): Promise<string> {
  const proc = Bun.spawn(['realpath', target], { stdout: 'pipe', stderr: 'pipe' });
  const code = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  if (code !== 0) throw new KnownAbort(`realpath failed for ${target}: ${stderr.trim()}`, 2);

  const canonical = (await new Response(proc.stdout).text()).trim();
  if (canonical.split('/').includes('..')) throw new KnownAbort(`Path traversal detected: ${canonical}`, 2);

  await assertInGitRepo(canonical).catch(e => { throw new KnownAbort(String(e), 2); });

  const pluginJson = `${canonical}/.claude-plugin/plugin.json`;
  if (!(await Bun.file(pluginJson).exists())) {
    throw new KnownAbort(`Not a plugin folder — .claude-plugin/plugin.json missing at ${canonical}`, 2);
  }

  return canonical;
}

async function readPluginJsonVersion(pluginRoot: string): Promise<string> {
  const raw = await Bun.file(`${pluginRoot}/.claude-plugin/plugin.json`).text();
  const parsed = JSON.parse(raw);
  if (typeof parsed.version !== 'string') throw new KnownAbort('.claude-plugin/plugin.json missing version field', 2);
  return parsed.version;
}

// ── diff classification for changelog bullets ──

function classifyEntries(entries: DiffEntry[]): {
  added: string[]; changed: string[]; removed: string[]; statuses: DiffStatus[];
} {
  const added: string[] = [], changed: string[] = [], removed: string[] = [];
  const statuses: DiffStatus[] = [];
  for (const e of entries) {
    statuses.push(e.status);
    if (e.status === 'A') added.push(e.path);
    else if (e.status === 'D') removed.push(e.path);
    else if (e.status === 'R' || e.status === 'C') changed.push(`${e.oldPath} → ${e.path}`);
    else changed.push(e.path);
  }
  return { added, changed, removed, statuses };
}

function buildBullets(hasDiff: boolean, userDesc: string[]): string[] {
  if (userDesc.length > 0) return userDesc;
  if (hasDiff) return ['TODO: describe'];
  return [];
}

const todayIso = () => new Date().toISOString().slice(0, 10);

// ── main ──

async function main(argv: string[]): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (e instanceof KnownAbort) { console.error(`[plugin-bump] ${e.message}`); return e.exitCode; }
    throw e;
  }

  try {
    // Validate + canonicalize target
    args.target = await assertPluginTargetSafe(args.target);
    const cwd = await repoCwdOf(args.target);

    if (args.since) await assertRefExists(args.since, cwd);

    // Dirty tree gate
    if (await isWorkingTreeDirty(args.target, cwd)) {
      if (!args.auto) throw new KnownAbort(`Dirty working tree under ${args.target}. Commit, stash, or pass --auto.`, 2);
      console.warn(`[plugin-bump] WARN: dirty tree — --auto bypassing.`);
    }

    // Read current version
    const currentVer = await readPluginJsonVersion(args.target);

    // Collect diff
    const diff = await collectDiff(args.target, args.since, cwd);
    if (diff.entries.length === 0) {
      console.log(`[plugin-bump] no changes since ${diff.since} — nothing to bump.`);
      return 2;
    }

    const { added: dA, changed: dC, removed: dR, statuses } = classifyEntries(diff.entries);
    const bumpType = inferBump(statuses);
    const newVer = applyBump(currentVer, bumpType);

    // Discover components
    const components = await discoverComponents(args.target);
    const diffPaths = new Set(diff.entries.map(e => e.path));

    if (args.dryRun) {
      console.log(JSON.stringify({
        mode: 'dry-run', since: diff.since,
        currentVer, newVer, bumpType,
        diff: { added: dA, changed: dC, removed: dR },
        components: components.map(c => ({ kind: c.kind, path: c.pluginRelPath })),
        willUpdate: components.filter(c => diffPaths.has(c.pluginRelPath)).map(c => c.pluginRelPath),
        willSkip: components.filter(c => !diffPaths.has(c.pluginRelPath)).map(c => c.pluginRelPath),
      }, null, 2));
      return 0;
    }

    console.log(`[plugin-bump] ${currentVer} → ${newVer} (${bumpType})`);

    // Capture HEAD snapshot for non-diff components BEFORE any writes
    const preRunSnapshot = await captureHeadSnapshot(components, args.target, cwd, diffPaths);

    // Cascade version to plugin.json + changed components
    await cascadeVersion({ pluginRoot: args.target, newVersion: newVer, components, diffPaths });
    console.log(`[plugin-bump] cascade: done`);

    // Compute + write manifest (all tracked plugin files minus excludes)
    const tracked = await gitLsFiles(args.target, cwd);
    const pluginPrefix = toRepoRelative(args.target, cwd);
    const visibleFiles = tracked
      .map(rel => stripTargetPrefix(rel, pluginPrefix))
      .filter(rel => rel && !isExcluded(rel));
    const manifest = await computeManifest(args.target, visibleFiles, newVer);
    await Bun.write(`${args.target}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`[plugin-bump] manifest: ${visibleFiles.length} files hashed`);

    // Write changelog
    const entry: ChangelogEntry = {
      version: newVer,
      date: todayIso(),
      added: buildBullets(dA.length > 0, args.added),
      changed: buildBullets(dC.length > 0, args.changed),
      removed: buildBullets(dR.length > 0, args.removed),
    };
    await appendEntry(`${args.target}/CHANGELOG.md`, entry);
    console.log(`[plugin-bump] changelog: appended ${newVer}`);

    // 5-check verify
    const result = await verify({ pluginRoot: args.target, cwd, expectedVersion: newVer, components, diffPaths, preRunSnapshot });
    if (!result.ok) {
      console.error(`[plugin-bump] verify FAILED (${result.failures.length} check(s)). State may be partial.`);
      return 4;
    }

    console.log(`[plugin-bump] OK — ${currentVer} → ${newVer} (${bumpType}), all 5 checks passed.`);
    return 0;

  } catch (e) {
    if (e instanceof KnownAbort) {
      console.error(`[plugin-bump] ${e.message}`);
      return e.exitCode;
    }
    console.error(`[plugin-bump] Unexpected error:`, e);
    return 99;
  }
}

process.exit(await main(Bun.argv.slice(2)));
