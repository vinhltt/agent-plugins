// 3-check verify per brainstorm §4.4 Step 7.
// (a) on-disk manifest matches expected + recompute hashes match expected
// (b) manifest.version === SKILL.md frontmatter metadata.version
// (c) changelog top header version === manifest.version

import { computeManifest, manifestsEqualIgnoringTimestamp, type Manifest } from './manifest';
import { readFrontmatter } from './lib/frontmatter';
import { KnownAbort } from './lib/known-abort';

export type VerifyCheck = 'a' | 'b' | 'c';

export interface VerifyResult {
  ok: boolean;
  failedAt?: VerifyCheck;
  detail?: string;
}

export async function verifyTarget(
  target: string,
  expectedManifest: Manifest,
): Promise<VerifyResult> {
  // (a1) on-disk manifest matches expected
  const diskManifest = await readManifestFromDisk(target);
  if (!diskManifest) {
    return { ok: false, failedAt: 'a', detail: 'manifest.json not found on disk' };
  }
  if (!manifestsEqualIgnoringTimestamp(diskManifest, expectedManifest)) {
    return {
      ok: false,
      failedAt: 'a',
      detail: 'on-disk manifest.json differs from expected (corruption or partial write)',
    };
  }
  // (a2) recompute from disk → must equal expected
  const recomputed = await computeManifest(
    target,
    Object.keys(expectedManifest.files),
    diskManifest.version,
  );
  if (!manifestsEqualIgnoringTimestamp(recomputed, expectedManifest)) {
    return {
      ok: false,
      failedAt: 'a',
      detail: 'recompute hashes drift between expected and disk',
    };
  }

  // (b) frontmatter version matches manifest
  const fm = await readFrontmatter(`${target}/SKILL.md`);
  if (fm.version !== diskManifest.version) {
    return {
      ok: false,
      failedAt: 'b',
      detail: `manifest.version=${diskManifest.version} but frontmatter=${fm.version}`,
    };
  }

  // (c) changelog top header matches manifest
  const topVersion = await readChangelogTopVersion(`${target}/CHANGELOG.md`);
  if (topVersion !== diskManifest.version) {
    return {
      ok: false,
      failedAt: 'c',
      detail: `changelog top=[${topVersion}] but manifest.version=${diskManifest.version}`,
    };
  }

  return { ok: true };
}

async function readManifestFromDisk(target: string): Promise<Manifest | null> {
  const f = Bun.file(`${target}/manifest.json`);
  if (!(await f.exists())) return null;
  // M1: runtime validate JSON output. Defends against corruption + prototype-pollution.
  const parsed = JSON.parse(await f.text());
  if (typeof parsed !== 'object' || parsed === null) {
    throw new KnownAbort('manifest.json: not an object', 5);
  }
  if (typeof parsed.version !== 'string') {
    throw new KnownAbort('manifest.json: missing version', 5);
  }
  if (!parsed.files || typeof parsed.files !== 'object') {
    throw new KnownAbort('manifest.json: missing files map', 5);
  }
  if (Object.keys(parsed.files).length > 10000) {
    throw new KnownAbort('manifest.json: too many entries', 5);
  }
  for (const k of Object.keys(parsed.files)) {
    if (k === '__proto__' || k === 'constructor') {
      throw new KnownAbort('manifest.json: forbidden key', 5);
    }
  }
  return parsed as Manifest;
}

async function readChangelogTopVersion(changelogPath: string): Promise<string | null> {
  const text = await Bun.file(changelogPath).text();
  const m = text.match(/^##\s*\[([^\]]+)\]/m);
  return m ? m[1]! : null;
}

export function formatVerifyError(result: VerifyResult, target: string): string {
  if (result.ok) return '';
  return [
    `Verify failed at check (${result.failedAt}): ${result.detail}`,
    `Run 'git checkout ${target}' to discard partial state.`,
  ].join('\n');
}
