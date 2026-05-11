// Single-check verify: frontmatter metadata.version === changelog top header version.

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { verifyTarget, formatVerifyError } from '../scripts/verify';

let TARGET: string;
let TMP_PARENT: string;

async function makeFixture(opts: {
  fmVersion?: string | null;
  changelogTop?: string | null;
}): Promise<string> {
  const proc = Bun.spawn(['mktemp', '-d'], { stdout: 'pipe' });
  await proc.exited;
  const tmp = (await new Response(proc.stdout).text()).trim();
  TMP_PARENT = tmp;
  const target = `${tmp}/skill`;
  const fm = opts.fmVersion === null
    ? `---\nname: x\n---\nbody\n`
    : `---\nmetadata:\n  version: ${opts.fmVersion ?? '0.2.0'}\n---\nbody\n`;
  await Bun.write(`${target}/SKILL.md`, fm);
  if (opts.changelogTop !== null) {
    const top = opts.changelogTop ?? '0.2.0';
    await Bun.write(`${target}/CHANGELOG.md`, `# Changelog\n\n## [${top}] - 2026-05-11\n\n### Added\n- x\n`);
  }
  return target;
}

beforeEach(() => { TARGET = ''; TMP_PARENT = ''; });

afterEach(async () => {
  if (TMP_PARENT) await Bun.spawn(['rm', '-rf', TMP_PARENT]).exited;
});

describe('verifyTarget', () => {
  test('frontmatter === changelog top → ok', async () => {
    TARGET = await makeFixture({ fmVersion: '0.2.0', changelogTop: '0.2.0' });
    const r = await verifyTarget(TARGET);
    expect(r.ok).toBe(true);
  });

  test('frontmatter !== changelog top → fail with detail', async () => {
    TARGET = await makeFixture({ fmVersion: '0.2.0', changelogTop: '0.1.0' });
    const r = await verifyTarget(TARGET);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('frontmatter=0.2.0');
    expect(r.detail).toContain('changelog top=0.1.0');
  });

  test('missing changelog file → fail (top=null)', async () => {
    TARGET = await makeFixture({ fmVersion: '0.2.0', changelogTop: null });
    const r = await verifyTarget(TARGET);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('changelog top=null');
  });

  test('missing frontmatter metadata.version → fail (frontmatter=null)', async () => {
    TARGET = await makeFixture({ fmVersion: null, changelogTop: '0.2.0' });
    const r = await verifyTarget(TARGET);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('frontmatter=null');
  });
});

describe('formatVerifyError', () => {
  test('produces recovery message with target path', () => {
    const msg = formatVerifyError(
      { ok: false, detail: 'frontmatter=0.1.0 but changelog top=0.2.0' },
      '/some/target',
    );
    expect(msg).toContain('Verify failed');
    expect(msg).toContain('git checkout /some/target');
  });

  test('returns empty for ok result', () => {
    expect(formatVerifyError({ ok: true }, '/x')).toBe('');
  });
});
