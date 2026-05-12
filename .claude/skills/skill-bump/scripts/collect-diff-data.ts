// Step 0 + Step 2 of brainstorm §4.4: bootstrap detection + diff collection.

import {
  gitDiffNameStatus,
  gitDiffStagedNameStatus,
  resolveSinceAnchor,
  type DiffEntry,
} from './lib/git-helpers';
import { isExcluded } from './lib/default-excludes';

export async function detectBootstrap(target: string): Promise<boolean> {
  const hasChangelog = await Bun.file(`${target}/CHANGELOG.md`).exists();
  return !hasChangelog;
}

// Merge committed + staged entries. Same path → most severe status wins (D > A/R/C > M).
function mergeDiffEntries(committed: DiffEntry[], staged: DiffEntry[]): DiffEntry[] {
  const severity = (s: DiffEntry['status']) => ({ D: 4, A: 3, R: 2, C: 2, M: 1 }[s] ?? 0);
  const byPath = new Map<string, DiffEntry>();
  for (const e of [...committed, ...staged]) {
    const existing = byPath.get(e.path);
    if (!existing || severity(e.status) > severity(existing.status)) byPath.set(e.path, e);
  }
  return [...byPath.values()];
}

export async function collectDiff(
  target: string,
  since: string | undefined,
  cwd: string,
): Promise<{ since: string; entries: DiffEntry[] }> {
  const resolved = since ?? (await resolveSinceAnchor(target, cwd));
  const committed = await gitDiffNameStatus(resolved, target, cwd);
  const staged = await gitDiffStagedNameStatus(target, cwd);
  const merged = mergeDiffEntries(committed, staged);
  return { since: resolved, entries: merged.filter(e => !isExcluded(e.path)) };
}
