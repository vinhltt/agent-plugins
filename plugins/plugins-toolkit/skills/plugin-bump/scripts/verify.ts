// 5-check Definition of Done. Read-only. Any failure → ok=false + full report.
// Called by run.ts AFTER cascade + manifest + changelog writes.

import { computeManifest, manifestsEqualIgnoringTimestamp, type Manifest } from './manifest';
import { gitShowHead, toRepoRelative } from './lib/git-helpers';
import { KnownAbort } from './lib/known-abort';
import type { DiscoveredComponent } from './lib/component-discovery';

export type VerifyCheckId = 'a' | 'b' | 'c' | 'd' | 'e';

export interface VerifyFailure {
  check: VerifyCheckId;
  reason: string;
  path?: string;
}

export interface VerifyResult {
  ok: boolean;
  failures: VerifyFailure[];
}

export interface VerifyInput {
  pluginRoot: string;
  cwd: string; // git repo root
  expectedVersion: string;
  components: DiscoveredComponent[];
  diffPaths: Set<string>; // plugin-relative paths
  preRunSnapshot: Map<string, string | null>; // pluginRelPath → version at HEAD (non-diff components)
}

// ── version parsers (read from raw content strings) ──

function parseSkillVersion(content: string): string | null {
  let inMetadata = false;
  for (const line of content.split('\n')) {
    if (/^metadata:\s*$/.test(line)) { inMetadata = true; continue; }
    if (inMetadata) {
      if (line.trim() === '') continue;
      const indent = line.length - line.trimStart().length;
      if (indent === 0) { inMetadata = false; continue; }
      const m = line.match(/^\s+version:\s*['"]?([^'"\s]+)['"]?/);
      if (m) return m[1]!;
    }
  }
  return null;
}

function parseTopLevelVersion(content: string): string | null {
  // Reads `version:` from frontmatter block (agents/commands)
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') break;
    const m = lines[i]!.match(/^version:\s*['"]?([^'"\s]+)['"]?/);
    if (m) return m[1]!;
  }
  return null;
}

function parseComponentVersion(content: string, comp: DiscoveredComponent): string | null {
  if (comp.versionTarget.fmt === 'json-field') {
    try { return (JSON.parse(content) as Record<string, unknown>).version as string ?? null; }
    catch { return null; }
  }
  if (comp.versionTarget.key === 'metadata.version') return parseSkillVersion(content);
  return parseTopLevelVersion(content);
}

async function readOnDiskComponentVersion(comp: DiscoveredComponent): Promise<string | null> {
  const content = await Bun.file(comp.absPath).text();
  return parseComponentVersion(content, comp);
}

// ── snapshot capture (call BEFORE cascade) ──

export async function captureHeadSnapshot(
  components: DiscoveredComponent[],
  pluginRoot: string,
  cwd: string,
  diffPaths: Set<string>,
): Promise<Map<string, string | null>> {
  const snapshot = new Map<string, string | null>();
  const pluginPrefix = toRepoRelative(pluginRoot, cwd);

  for (const comp of components) {
    if (diffPaths.has(comp.pluginRelPath)) continue; // only snapshot stable (non-diff) components
    const repoRelPath = pluginPrefix ? `${pluginPrefix}/${comp.pluginRelPath}` : comp.pluginRelPath;
    const content = await gitShowHead(repoRelPath, cwd);
    snapshot.set(comp.pluginRelPath, content ? parseComponentVersion(content, comp) : null);
  }
  return snapshot;
}

// ── manifest helpers ──

async function readManifestFromDisk(target: string): Promise<Manifest | null> {
  const f = Bun.file(`${target}/manifest.json`);
  if (!(await f.exists())) return null;
  const parsed = JSON.parse(await f.text());
  if (typeof parsed !== 'object' || parsed === null) throw new KnownAbort('manifest.json: not an object', 5);
  if (typeof parsed.version !== 'string') throw new KnownAbort('manifest.json: missing version', 5);
  if (!parsed.files || typeof parsed.files !== 'object') throw new KnownAbort('manifest.json: missing files map', 5);
  if (Object.keys(parsed.files).length > 10000) throw new KnownAbort('manifest.json: too many entries', 5);
  for (const k of Object.keys(parsed.files)) {
    if (k === '__proto__' || k === 'constructor') throw new KnownAbort('manifest.json: forbidden key', 5);
  }
  return parsed as Manifest;
}

// ── verify ──

export async function verify(input: VerifyInput): Promise<VerifyResult> {
  const { pluginRoot, cwd, expectedVersion, components, diffPaths, preRunSnapshot } = input;
  const failures: VerifyFailure[] = [];

  // (a) on-disk manifest matches expected + recomputed hashes
  const diskManifest = await readManifestFromDisk(pluginRoot);
  if (!diskManifest) {
    failures.push({ check: 'a', reason: 'manifest.json not found on disk' });
  } else if (!manifestsEqualIgnoringTimestamp(diskManifest, { version: expectedVersion, files: diskManifest.files, generatedAt: '' })) {
    failures.push({ check: 'a', reason: `manifest.version mismatch: expected ${expectedVersion}, got ${diskManifest.version}` });
  } else {
    const recomputed = await computeManifest(pluginRoot, Object.keys(diskManifest.files), diskManifest.version);
    if (!manifestsEqualIgnoringTimestamp(recomputed, diskManifest)) {
      failures.push({ check: 'a', reason: 'recomputed file hashes differ from manifest.json (partial write or file changed)' });
    }
  }

  // (b) plugin.json.version === manifest.version
  const pluginJsonPath = `${pluginRoot}/.claude-plugin/plugin.json`;
  let pluginJsonVer: string | null = null;
  try {
    const raw = await Bun.file(pluginJsonPath).text();
    pluginJsonVer = (JSON.parse(raw) as Record<string, unknown>).version as string ?? null;
  } catch { /* fall through — null triggers failure below */ }
  if (pluginJsonVer !== expectedVersion) {
    failures.push({ check: 'b', reason: `plugin.json version=${pluginJsonVer} != expected ${expectedVersion}` });
  }

  // (c) CHANGELOG.md top header version === expectedVersion
  const clPath = `${pluginRoot}/CHANGELOG.md`;
  const clText = await Bun.file(clPath).exists() ? await Bun.file(clPath).text() : '';
  const clMatch = clText.match(/^##\s*\[([^\]]+)\]/m);
  const clVer = clMatch ? clMatch[1]! : null;
  if (clVer !== expectedVersion) {
    failures.push({ check: 'c', reason: `CHANGELOG.md top=[${clVer}] != expected ${expectedVersion}` });
  }

  // (d) every component in diff has new version on disk
  for (const comp of components) {
    if (!diffPaths.has(comp.pluginRelPath)) continue;
    const ver = await readOnDiskComponentVersion(comp);
    if (ver !== expectedVersion) {
      failures.push({ check: 'd', reason: `version=${ver} != expected ${expectedVersion}`, path: comp.pluginRelPath });
    }
  }

  // (e) every component NOT in diff has version unchanged from HEAD snapshot
  for (const comp of components) {
    if (diffPaths.has(comp.pluginRelPath)) continue;
    const snapshotVer = preRunSnapshot.get(comp.pluginRelPath);
    if (snapshotVer === undefined) continue; // not captured = new file in diff, skip
    const diskVer = await readOnDiskComponentVersion(comp);
    if (diskVer !== snapshotVer) {
      failures.push({
        check: 'e',
        reason: `version changed from ${snapshotVer} to ${diskVer} but path not in diff`,
        path: comp.pluginRelPath,
      });
    }
  }

  if (failures.length > 0) {
    for (const f of failures) {
      const loc = f.path ? ` — ${f.path}` : '';
      console.error(`[verify] FAIL check (${f.check})${loc}: ${f.reason}`);
    }
  }

  return { ok: failures.length === 0, failures };
}
