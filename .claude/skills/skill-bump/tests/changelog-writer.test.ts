import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { renderEntry, appendEntry } from '../scripts/changelog-writer';

let TMP: string;

beforeEach(async () => {
  const proc = Bun.spawn(['mktemp', '-d'], { stdout: 'pipe' });
  await proc.exited;
  TMP = (await new Response(proc.stdout).text()).trim();
});

afterEach(async () => {
  await Bun.spawn(['rm', '-rf', TMP]).exited;
});

describe('renderEntry', () => {
  test('full entry with all sections', () => {
    const r = renderEntry({
      version: '0.2.0', date: '2026-05-02',
      added: ['x.ts'], changed: ['y.ts'], removed: ['z.ts'],
    });
    expect(r).toContain('## [0.2.0] - 2026-05-02');
    expect(r).toContain('### Added\n- x.ts');
    expect(r).toContain('### Changed\n- y.ts');
    expect(r).toContain('### Removed\n- z.ts');
  });

  test('omits empty sections', () => {
    const r = renderEntry({
      version: '0.1.0', date: '2026-05-02',
      added: ['x.ts'], changed: [], removed: [],
    });
    expect(r).toContain('### Added');
    expect(r).not.toContain('### Changed');
    expect(r).not.toContain('### Removed');
  });
});

describe('appendEntry', () => {
  test('first entry creates header', async () => {
    const path = `${TMP}/CHANGELOG.md`;
    await appendEntry(path, {
      version: '0.1.0', date: '2026-05-02',
      added: ['a.ts'], changed: [], removed: [],
    });
    const text = await Bun.file(path).text();
    expect(text).toContain('# Changelog');
    expect(text).toContain('Keep a Changelog');
    expect(text).toContain('## [0.1.0] - 2026-05-02');
  });

  test('second entry inserted ABOVE first version block', async () => {
    const path = `${TMP}/CHANGELOG.md`;
    await appendEntry(path, {
      version: '0.1.0', date: '2026-05-01',
      added: ['a.ts'], changed: [], removed: [],
    });
    await appendEntry(path, {
      version: '0.2.0', date: '2026-05-02',
      added: ['b.ts'], changed: [], removed: [],
    });
    const text = await Bun.file(path).text();
    const idx02 = text.indexOf('## [0.2.0]');
    const idx01 = text.indexOf('## [0.1.0]');
    expect(idx02).toBeGreaterThan(-1);
    expect(idx01).toBeGreaterThan(idx02); // newest first
  });
});
