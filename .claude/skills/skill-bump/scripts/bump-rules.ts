// Pure semver bump inference. No I/O. Table-driven per brainstorm §3 + §4.4.

export type DiffStatus = 'A' | 'M' | 'R' | 'C' | 'D';
export type BumpType = 'major' | 'minor' | 'patch' | 'none';

const BUMP_TABLE: Record<DiffStatus, BumpType> = {
  D: 'major', // conservative-major-on-delete
  A: 'minor',
  M: 'patch',
  R: 'patch',
  C: 'patch',
};

const RANK: Record<BumpType, number> = { none: 0, patch: 1, minor: 2, major: 3 };

export function inferBump(statuses: DiffStatus[]): BumpType {
  if (statuses.length === 0) return 'none';
  return statuses.reduce<BumpType>(
    (acc, s) => (RANK[BUMP_TABLE[s]] > RANK[acc] ? BUMP_TABLE[s] : acc),
    'none',
  );
}

export function applyBump(version: string, bump: BumpType): string {
  if (bump === 'none') return version;
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Invalid semver: ${version}`);
  const maj = Number(m[1]);
  const min = Number(m[2]);
  const pat = Number(m[3]);
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}
