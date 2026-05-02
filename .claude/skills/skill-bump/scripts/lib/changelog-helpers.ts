// Helpers for CHANGELOG.md parsing/insertion. Used by changelog-writer.ts.

// Returns the byte index where the first version block starts (`^## [`).
// If no version block exists yet, returns end-of-file index (append at tail).
export function findHeaderEnd(existing: string): number {
  const m = existing.match(/^## \[/m);
  return m && m.index !== undefined ? m.index : existing.length;
}
