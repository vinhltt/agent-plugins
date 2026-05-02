// CLI entrypoint. Strict zero node:* — manual argv parser inline.
// Workflow: brainstorm §4.4 Steps 0-7 + Step 2.5 short-circuit + C2 write order.

import { applyBump, inferBump, type DiffStatus } from './bump-rules';
import { computeManifest } from './manifest';
import { detectBootstrap, collectDiff } from './collect-diff-data';
import { appendEntry, type ChangelogEntry } from './changelog-writer';
import {
  assertTargetSafe, assertRefExists, isWorkingTreeDirty,
  repoCwdOf, gitLsFiles, toRepoRelative, stripTargetPrefix, type DiffEntry,
} from './lib/git-helpers';
import { isExcluded } from './lib/default-excludes';
import { readFrontmatter, writeFrontmatterVersion } from './lib/frontmatter';
import { verifyTarget, formatVerifyError } from './verify';
import { KnownAbort } from './lib/known-abort';

interface Args {
  target: string;
  since?: string;
  auto: boolean;
  dryRun: boolean;
  added: string[];
  changed: string[];
  removed: string[];
}

const TODO_PLACEHOLDER = 'TODO: describe';

function parseArgsOrExit(): Args {
  const argv = Bun.argv.slice(2);
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
    else { console.error(`Unknown arg: ${arg}`); process.exit(2); }
  }
  if (!target) {
    console.error('Usage: bun run.ts --target=<path> [--since=<ref>] [--auto] [--dry-run] [--added=<text>]... [--changed=<text>]... [--removed=<text>]...');
    process.exit(2);
  }
  return { target, since, auto, dryRun, added, changed, removed };
}

// Bullets shown in changelog. User descriptions win; otherwise TODO placeholder
// when the diff bucket is non-empty so the editor knows something is missing.
function buildBullets(hasDiff: boolean, userDesc: string[]): string[] {
  if (userDesc.length > 0) return userDesc;
  if (hasDiff) return [TODO_PLACEHOLDER];
  return [];
}

async function assertPreconditions(args: Args): Promise<string> {
  let canonical: string;
  try {
    canonical = await assertTargetSafe(args.target);
  } catch (e) {
    if (e instanceof Error) throw new KnownAbort(e.message, 2);
    throw e;
  }
  args.target = canonical;
  const cwd = await repoCwdOf(canonical);
  if (args.since) await assertRefExists(args.since, cwd);
  if (await isWorkingTreeDirty(canonical, cwd)) {
    if (!args.auto) {
      throw new KnownAbort(
        `Dirty working tree under ${canonical}. Commit, stash, or pass --auto.`, 2);
    }
    console.warn(`[skill-changelog] WARN: dirty tree under ${canonical}; --auto bypassing.`);
  }
  return cwd;
}

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

const todayIso = () => new Date().toISOString().slice(0, 10);

// Shared C2 write order: changelog → manifest → verify. Frontmatter bumped beforehand.
async function writeAndVerify(
  target: string, cwd: string, version: string, entry: ChangelogEntry,
): Promise<number> {
  await appendEntry(`${target}/CHANGELOG.md`, entry);
  // gitLsFiles returns repo-relative paths; convert to target-relative for computeManifest.
  const tracked = await gitLsFiles(target, cwd);
  const targetRel = toRepoRelative(target, cwd);
  const visible = tracked
    .map(rel => stripTargetPrefix(rel, targetRel))
    .filter(rel => rel && !isExcluded(rel));
  const expected = await computeManifest(target, visible, version);
  await Bun.write(`${target}/manifest.json`, JSON.stringify(expected, null, 2));
  const v = await verifyTarget(target, expected);
  if (!v.ok) {
    console.error(formatVerifyError(v, target));
    return 4;
  }
  return 0;
}

async function runIncremental(args: Args, cwd: string): Promise<number> {
  const diff = await collectDiff(args.target, args.since, cwd);
  if (diff.entries.length === 0) {
    console.log(`[skill-changelog] no changes since ${diff.since} — nothing to bump.`);
    return 0;
  }
  const { added: dA, changed: dC, removed: dR, statuses } = classifyEntries(diff.entries);
  const bumpType = inferBump(statuses);
  const fm = await readFrontmatter(`${args.target}/SKILL.md`);
  if (fm.version === null) {
    throw new KnownAbort('metadata.version missing in non-bootstrap path', 2);
  }
  const newVersion = applyBump(fm.version, bumpType);
  const entryBullets = {
    added: buildBullets(dA.length > 0, args.added),
    changed: buildBullets(dC.length > 0, args.changed),
    removed: buildBullets(dR.length > 0, args.removed),
  };
  if (args.dryRun) {
    console.log(JSON.stringify({
      mode: 'incremental', since: diff.since, bump: bumpType,
      from: fm.version, to: newVersion,
      diff: { added: dA, changed: dC, removed: dR },
      entry: entryBullets,
    }, null, 2));
    return 0;
  }
  await writeFrontmatterVersion(`${args.target}/SKILL.md`, newVersion);
  const entry: ChangelogEntry = { version: newVersion, date: todayIso(), ...entryBullets };
  const code = await writeAndVerify(args.target, cwd, newVersion, entry);
  if (code === 0) {
    console.log(`[skill-changelog] OK — ${fm.version} → ${newVersion} (${bumpType}), verified.`);
  }
  return code;
}

async function runBootstrap(args: Args, cwd: string): Promise<number> {
  const fm = await readFrontmatter(`${args.target}/SKILL.md`);
  const baseVersion = fm.version ?? '0.1.0';
  const tracked = await gitLsFiles(args.target, cwd);
  const targetRel = toRepoRelative(args.target, cwd);
  const visible = tracked
    .map(rel => stripTargetPrefix(rel, targetRel))
    .filter(rel => rel && !isExcluded(rel));
  const entryBullets = {
    added: buildBullets(visible.length > 0, args.added),
    changed: buildBullets(false, args.changed),
    removed: buildBullets(false, args.removed),
  };
  if (args.dryRun) {
    console.log(JSON.stringify({
      mode: 'bootstrap', version: baseVersion,
      files: visible, entry: entryBullets,
    }, null, 2));
    return 0;
  }
  if (fm.version === null) {
    await writeFrontmatterVersion(`${args.target}/SKILL.md`, baseVersion);
  }
  const entry: ChangelogEntry = { version: baseVersion, date: todayIso(), ...entryBullets };
  const code = await writeAndVerify(args.target, cwd, baseVersion, entry);
  if (code === 0) {
    console.log(`[skill-changelog] OK — bootstrapped at ${baseVersion}, verified.`);
  }
  return code;
}

async function main(): Promise<number> {
  const args = parseArgsOrExit();
  try {
    const cwd = await assertPreconditions(args);
    const bootstrap = await detectBootstrap(args.target);
    return bootstrap ? await runBootstrap(args, cwd) : await runIncremental(args, cwd);
  } catch (e) {
    if (e instanceof KnownAbort) {
      console.error(`[skill-changelog] ${e.message}`);
      return e.exitCode;
    }
    console.error(`[skill-changelog] Unexpected error:`, e);
    return 99;
  }
}

process.exit(await main());
