export type ManifestFormat = 'claude' | 'codex' | 'cursor';

export interface ManifestTarget {
  format: ManifestFormat;
  dir: string;
  isAnchor: boolean;
}

export const MANIFEST_TARGETS: readonly ManifestTarget[] = [
  { format: 'claude', dir: '.claude-plugin', isAnchor: true },
  { format: 'codex',  dir: '.codex-plugin',  isAnchor: false },
  { format: 'cursor', dir: '.cursor-plugin', isAnchor: false },
] as const;

export async function discoverManifests(pluginRoot: string): Promise<ManifestTarget[]> {
  const found: ManifestTarget[] = [];
  for (const target of MANIFEST_TARGETS) {
    const path = `${pluginRoot}/${target.dir}/plugin.json`;
    if (await Bun.file(path).exists()) found.push(target);
  }
  return found;
}

export interface EnsureResult {
  created: ManifestFormat[];
}

export async function ensureManifests(pluginRoot: string): Promise<EnsureResult> {
  const anchorPath = `${pluginRoot}/.claude-plugin/plugin.json`;
  const anchorContent = await Bun.file(anchorPath).text();

  const created: ManifestFormat[] = [];
  for (const target of MANIFEST_TARGETS) {
    if (target.isAnchor) continue;
    const targetPath = `${pluginRoot}/${target.dir}/plugin.json`;
    if (await Bun.file(targetPath).exists()) continue;

    const proc = Bun.spawn(['mkdir', '-p', `${pluginRoot}/${target.dir}`], { stderr: 'pipe' });
    const code = await proc.exited;
    if (code !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`mkdir failed for ${target.dir}: ${err.trim()}`);
    }

    await Bun.write(targetPath, anchorContent);
    created.push(target.format);
  }
  return { created };
}
