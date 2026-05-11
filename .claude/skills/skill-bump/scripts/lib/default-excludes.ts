// Hardcoded exclusions for diff filtering.
// Gitignore is no-op on diff output; we filter by relative path.
// `manifest.json` retained as guard against stale orphans from pre-refactor state.

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
