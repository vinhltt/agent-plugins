// TODO(sync): origin = .claude/skills/skill-bump/scripts/manifest.ts
// Port date: 2026-05-09. Source SHA: 3d6e868. Keep API parity unless port-specific divergence is documented here.

// Bun-native manifest computation. SHA-256 over each file, deterministic ordering.

export interface Manifest {
  version: string;
  files: Record<string, string>; // relPath → sha256 hex
  generatedAt: string; // ISO8601
}

export async function computeManifest(
  targetDir: string,
  files: string[],
  version: string,
): Promise<Manifest> {
  const entries: Array<[string, string]> = [];
  for (const rel of files) {
    const buf = await Bun.file(`${targetDir}/${rel}`).arrayBuffer();
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(buf);
    entries.push([rel, hasher.digest('hex')]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return {
    version,
    files: Object.fromEntries(entries),
    generatedAt: new Date().toISOString(),
  };
}

export function manifestsEqualIgnoringTimestamp(a: Manifest, b: Manifest): boolean {
  if (a.version !== b.version) return false;
  const aKeys = Object.keys(a.files).sort();
  const bKeys = Object.keys(b.files).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k, i) => k === bKeys[i] && a.files[k] === b.files[bKeys[i]!]);
}
