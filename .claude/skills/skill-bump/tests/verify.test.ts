import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { verifyTarget, formatVerifyError } from '../scripts/verify';
import { computeManifest } from '../scripts/manifest';
import { KnownAbort } from '../scripts/lib/known-abort';

let TARGET: string;
let TMP_PARENT: string;

async function makeFixture(): Promise<string> {
  const proc = Bun.spawn(['mktemp', '-d'], { stdout: 'pipe' });
  await proc.exited;
  const tmp = (await new Response(proc.stdout).text()).trim();
  TMP_PARENT = tmp;
  const target = `${tmp}/skill`;
  await Bun.write(`${target}/SKILL.md`, `---
metadata:
  version: 0.1.0
---

body
`);
  await Bun.write(`${target}/run.ts`, 'export const x = 1;');
  return target;
}

async function buildExpectedAndWrite(target: string): Promise<{ expected: any }> {
  const expected = await computeManifest(target, ['SKILL.md', 'run.ts'], '0.1.0');
  await Bun.write(`${target}/manifest.json`, JSON.stringify(expected, null, 2));
  await Bun.write(`${target}/CHANGELOG.md`, `# Changelog

## [0.1.0] - 2026-05-02

### Added
- run.ts
`);
  return { expected };
}

beforeEach(async () => {
  TARGET = await makeFixture();
});

afterEach(async () => {
  await Bun.spawn(['rm', '-rf', TMP_PARENT]).exited;
});

describe('verifyTarget', () => {
  test('all consistent → ok', async () => {
    const { expected } = await buildExpectedAndWrite(TARGET);
    const r = await verifyTarget(TARGET, expected);
    expect(r.ok).toBe(true);
  });

  test('check (a): manifest.json missing → fail', async () => {
    const { expected } = await buildExpectedAndWrite(TARGET);
    await Bun.spawn(['rm', `${TARGET}/manifest.json`]).exited;
    const r = await verifyTarget(TARGET, expected);
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe('a');
    expect(r.detail).toContain('not found');
  });

  test('check (a1): on-disk manifest mutated → fail', async () => {
    const { expected } = await buildExpectedAndWrite(TARGET);
    const tampered = { ...expected, files: { ...expected.files, 'run.ts': 'deadbeef' } };
    await Bun.write(`${TARGET}/manifest.json`, JSON.stringify(tampered, null, 2));
    const r = await verifyTarget(TARGET, expected);
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe('a');
    expect(r.detail).toContain('on-disk');
  });

  test('check (a2): source file mutated after manifest write → fail', async () => {
    const { expected } = await buildExpectedAndWrite(TARGET);
    await Bun.write(`${TARGET}/run.ts`, 'export const x = 999;');
    const r = await verifyTarget(TARGET, expected);
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe('a');
    expect(r.detail).toContain('drift');
  });

  test('check (b): frontmatter version mismatch', async () => {
    const { expected } = await buildExpectedAndWrite(TARGET);
    await Bun.write(`${TARGET}/SKILL.md`, `---
metadata:
  version: 0.9.9
---
body
`);
    // also need SKILL.md hash to match manifest, so rebuild expected
    const newExpected = await computeManifest(TARGET, ['SKILL.md', 'run.ts'], '0.1.0');
    await Bun.write(`${TARGET}/manifest.json`, JSON.stringify(newExpected, null, 2));
    const r = await verifyTarget(TARGET, newExpected);
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe('b');
  });

  test('check (c): changelog top header mismatch', async () => {
    const { expected } = await buildExpectedAndWrite(TARGET);
    await Bun.write(`${TARGET}/CHANGELOG.md`, `# Changelog

## [9.9.9] - 2026-05-02

### Added
- run.ts
`);
    const r = await verifyTarget(TARGET, expected);
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe('c');
  });

  test('M1: corrupted manifest.json (missing version) throws KnownAbort', async () => {
    const { expected } = await buildExpectedAndWrite(TARGET);
    await Bun.write(`${TARGET}/manifest.json`, JSON.stringify({ files: {} }));
    expect(verifyTarget(TARGET, expected)).rejects.toThrow(KnownAbort);
  });

  test('M1: forbidden key (__proto__) throws KnownAbort', async () => {
    const { expected } = await buildExpectedAndWrite(TARGET);
    await Bun.write(
      `${TARGET}/manifest.json`,
      `{"version":"0.1.0","files":{"__proto__":"x"}}`,
    );
    expect(verifyTarget(TARGET, expected)).rejects.toThrow(/forbidden key/);
  });
});

describe('formatVerifyError', () => {
  test('produces recovery message with target path', () => {
    const msg = formatVerifyError(
      { ok: false, failedAt: 'a', detail: 'whatever' },
      '/some/target',
    );
    expect(msg).toContain('Verify failed');
    expect(msg).toContain('git checkout /some/target');
  });

  test('returns empty for ok result', () => {
    expect(formatVerifyError({ ok: true }, '/x')).toBe('');
  });
});
