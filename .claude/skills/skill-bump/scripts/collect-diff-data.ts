// Step 0 + Step 2 of brainstorm §4.4: bootstrap detection + diff collection.

import {
  gitDiffNameStatus,
  resolveSinceAnchor,
  type DiffEntry,
} from './lib/git-helpers';
import { isExcluded } from './lib/default-excludes';

export async function detectBootstrap(target: string): Promise<boolean> {
  const hasChangelog = await Bun.file(`${target}/CHANGELOG.md`).exists();
  return !hasChangelog;
}

export async function collectDiff(
  target: string,
  since: string | undefined,
  cwd: string,
): Promise<{ since: string; entries: DiffEntry[] }> {
  const resolved = since ?? (await resolveSinceAnchor(target, cwd));
  const raw = await gitDiffNameStatus(resolved, target, cwd);
  const filtered = raw.filter(e => !isExcluded(e.path));
  return { since: resolved, entries: filtered };
}
