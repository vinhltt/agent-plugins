// TODO(sync): ported from .claude/skills/skill-bump/tests/manifest.test.ts
// Port date: 2026-05-09. Adjust import paths only; keep test logic identical.

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { computeManifest, manifestsEqualIgnoringTimestamp } from '../scripts/manifest';

const TMP_DIR = `/tmp/plugin-bump-manifest-test-${Date.now()}`;

async function writeFile(rel: string, content: string): Promise<void> {
  await Bun.write(`${TMP_DIR}/${rel}`, content);
}

beforeAll(async () => {
  await Bun.spawn(['mkdir', '-p', TMP_DIR]).exited;
  await writeFile('a.ts', 'export const a = 1;');
  await writeFile('b.ts', 'export const b = 2;');
  await writeFile('sub/c.ts', 'export const c = 3;');
});

afterAll(async () => {
  await Bun.spawn(['rm', '-rf', TMP_DIR]).exited;
});

describe('computeManifest', () => {
  test('round-trip: same input → same hashes', async () => {
    const m1 = await computeManifest(TMP_DIR, ['a.ts', 'b.ts'], '0.1.0');
    const m2 = await computeManifest(TMP_DIR, ['a.ts', 'b.ts'], '0.1.0');
    expect(m1.files).toEqual(m2.files);
    expect(m1.version).toBe('0.1.0');
  });

  test('order-insensitive: shuffled input → same hash map', async () => {
    const m1 = await computeManifest(TMP_DIR, ['a.ts', 'b.ts'], '0.1.0');
    const m2 = await computeManifest(TMP_DIR, ['b.ts', 'a.ts'], '0.1.0');
    expect(m1.files).toEqual(m2.files);
    expect(Object.keys(m1.files)).toEqual(['a.ts', 'b.ts']); // sorted
  });

  test('different content → different hash', async () => {
    const m1 = await computeManifest(TMP_DIR, ['a.ts'], '0.1.0');
    await writeFile('a.ts', 'export const a = 99;');
    const m2 = await computeManifest(TMP_DIR, ['a.ts'], '0.1.0');
    expect(m1.files['a.ts']).not.toBe(m2.files['a.ts']);
    // restore for subsequent tests
    await writeFile('a.ts', 'export const a = 1;');
  });

  test('empty file list → empty files map', async () => {
    const m = await computeManifest(TMP_DIR, [], '0.2.0');
    expect(m.files).toEqual({});
    expect(m.version).toBe('0.2.0');
  });

  test('nested path preserved', async () => {
    const m = await computeManifest(TMP_DIR, ['sub/c.ts'], '0.1.0');
    expect(Object.keys(m.files)).toEqual(['sub/c.ts']);
  });

  test('generatedAt is ISO8601', async () => {
    const m = await computeManifest(TMP_DIR, ['a.ts'], '0.1.0');
    expect(m.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('manifestsEqualIgnoringTimestamp', () => {
  test('identical → true (timestamps differ)', async () => {
    const m1 = await computeManifest(TMP_DIR, ['a.ts'], '0.1.0');
    await new Promise(r => setTimeout(r, 10));
    const m2 = await computeManifest(TMP_DIR, ['a.ts'], '0.1.0');
    expect(m1.generatedAt).not.toBe(m2.generatedAt);
    expect(manifestsEqualIgnoringTimestamp(m1, m2)).toBe(true);
  });

  test('different version → false', async () => {
    const m1 = await computeManifest(TMP_DIR, ['a.ts'], '0.1.0');
    const m2 = await computeManifest(TMP_DIR, ['a.ts'], '0.2.0');
    expect(manifestsEqualIgnoringTimestamp(m1, m2)).toBe(false);
  });

  test('different file set → false', async () => {
    const m1 = await computeManifest(TMP_DIR, ['a.ts'], '0.1.0');
    const m2 = await computeManifest(TMP_DIR, ['a.ts', 'b.ts'], '0.1.0');
    expect(manifestsEqualIgnoringTimestamp(m1, m2)).toBe(false);
  });
});
