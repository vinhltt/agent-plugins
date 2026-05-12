// TODO(sync): origin = .claude/skills/skill-bump/scripts/lib/default-excludes.ts
// Port date: 2026-05-09. Source SHA: 3d6e868. Keep API parity unless port-specific divergence is documented here.

// Hardcoded exclusions for diff filtering.
// Brainstorm §4.2: gitignore is no-op on diff output; we filter by relative path.

export const DEFAULT_EXCLUDES = [
  'CHANGELOG.md',
  'manifest.json',
  '.git/**',
  'node_modules/**',
] as const;

export function isExcluded(relPath: string): boolean {
  return DEFAULT_EXCLUDES.some(pat => {
    if (pat.endsWith('/**')) return relPath.startsWith(pat.slice(0, -3));
    return relPath === pat;
  });
}
