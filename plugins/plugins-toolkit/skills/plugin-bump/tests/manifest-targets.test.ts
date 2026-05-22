import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
  MANIFEST_TARGETS,
  discoverManifests,
  ensureManifests,
  type ManifestTarget,
} from '../scripts/lib/manifest-targets';

let TMP: string;

beforeEach(async () => {
  const proc = Bun.spawn(['mktemp', '-d'], { stdout: 'pipe' });
  await proc.exited;
  TMP = (await new Response(proc.stdout).text()).trim();
});

afterEach(async () => {
  await Bun.spawn(['rm', '-rf', TMP]).exited;
});

describe('MANIFEST_TARGETS', () => {
  test('has exactly 3 entries (claude, codex, cursor)', () => {
    expect(MANIFEST_TARGETS).toHaveLength(3);
    const formats = MANIFEST_TARGETS.map(t => t.format);
    expect(formats).toEqual(['claude', 'codex', 'cursor']);
  });

  test('first entry is claude with isAnchor: true', () => {
    expect(MANIFEST_TARGETS[0]!.format).toBe('claude');
    expect(MANIFEST_TARGETS[0]!.isAnchor).toBe(true);
  });

  test('non-anchor entries have isAnchor: false', () => {
    for (const t of MANIFEST_TARGETS.slice(1)) {
      expect(t.isAnchor).toBe(false);
    }
  });

  test('each target has correct dir property', () => {
    const dirs = MANIFEST_TARGETS.map(t => t.dir);
    expect(dirs).toEqual(['.claude-plugin', '.codex-plugin', '.cursor-plugin']);
  });
});

describe('discoverManifests', () => {
  test('only .claude-plugin exists -> returns 1 target', async () => {
    await Bun.write(`${TMP}/.claude-plugin/plugin.json`, '{}');

    const found = await discoverManifests(TMP);
    expect(found).toHaveLength(1);
    expect(found[0]!.format).toBe('claude');
  });

  test('all 3 dirs exist -> returns 3 targets', async () => {
    await Bun.write(`${TMP}/.claude-plugin/plugin.json`, '{}');
    await Bun.write(`${TMP}/.codex-plugin/plugin.json`, '{}');
    await Bun.write(`${TMP}/.cursor-plugin/plugin.json`, '{}');

    const found = await discoverManifests(TMP);
    expect(found).toHaveLength(3);
    expect(found.map(t => t.format)).toEqual(['claude', 'codex', 'cursor']);
  });

  test('empty dir -> returns 0 targets', async () => {
    const found = await discoverManifests(TMP);
    expect(found).toHaveLength(0);
  });

  test('only .codex-plugin exists -> returns 1 target (codex)', async () => {
    await Bun.write(`${TMP}/.codex-plugin/plugin.json`, '{}');

    const found = await discoverManifests(TMP);
    expect(found).toHaveLength(1);
    expect(found[0]!.format).toBe('codex');
  });
});

describe('ensureManifests', () => {
  const anchorContent = JSON.stringify({ name: 'my-plugin', version: '0.1.0', description: 'A test plugin' }, null, 2) + '\n';

  test('only .claude-plugin exists -> creates .codex-plugin + .cursor-plugin with same content', async () => {
    await Bun.write(`${TMP}/.claude-plugin/plugin.json`, anchorContent);

    const result = await ensureManifests(TMP);
    expect(result.created.sort()).toEqual(['codex', 'cursor']);

    const codexJson = await Bun.file(`${TMP}/.codex-plugin/plugin.json`).text();
    const cursorJson = await Bun.file(`${TMP}/.cursor-plugin/plugin.json`).text();
    expect(codexJson).toBe(anchorContent);
    expect(cursorJson).toBe(anchorContent);
  });

  test('all 3 exist -> creates nothing, returns empty created[]', async () => {
    await Bun.write(`${TMP}/.claude-plugin/plugin.json`, anchorContent);
    await Bun.write(`${TMP}/.codex-plugin/plugin.json`, '{"version":"0.1.0"}');
    await Bun.write(`${TMP}/.cursor-plugin/plugin.json`, '{"version":"0.1.0"}');

    const result = await ensureManifests(TMP);
    expect(result.created).toEqual([]);
  });

  test('.claude-plugin + .codex-plugin exist -> creates only .cursor-plugin', async () => {
    await Bun.write(`${TMP}/.claude-plugin/plugin.json`, anchorContent);
    await Bun.write(`${TMP}/.codex-plugin/plugin.json`, '{"version":"0.1.0"}');

    const result = await ensureManifests(TMP);
    expect(result.created).toEqual(['cursor']);

    expect(await Bun.file(`${TMP}/.cursor-plugin/plugin.json`).exists()).toBe(true);
  });

  test('created manifests have valid JSON with same name/description/version fields', async () => {
    await Bun.write(`${TMP}/.claude-plugin/plugin.json`, anchorContent);

    await ensureManifests(TMP);

    const codex = JSON.parse(await Bun.file(`${TMP}/.codex-plugin/plugin.json`).text());
    expect(codex.name).toBe('my-plugin');
    expect(codex.version).toBe('0.1.0');
    expect(codex.description).toBe('A test plugin');
  });

  test('existing .codex-plugin/plugin.json with extra fields -> NOT overwritten', async () => {
    await Bun.write(`${TMP}/.claude-plugin/plugin.json`, anchorContent);
    const codexContent = JSON.stringify({ name: 'my-plugin', version: '0.1.0', interface: { type: 'chat' } }, null, 2) + '\n';
    await Bun.write(`${TMP}/.codex-plugin/plugin.json`, codexContent);

    await ensureManifests(TMP);

    const afterContent = await Bun.file(`${TMP}/.codex-plugin/plugin.json`).text();
    expect(afterContent).toBe(codexContent);
  });
});
