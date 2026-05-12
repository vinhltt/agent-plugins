// TODO(sync): ported from .claude/skills/skill-bump/tests/collect-diff-data.test.ts
// Port date: 2026-05-09. Adjust import paths only; keep test logic identical.

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { detectBootstrap, collectDiff } from '../scripts/collect-diff-data';

let TMP: string;

async function runGit(args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  if ((await proc.exited) !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`git ${args.join(' ')}: ${err}`);
  }
}

async function makeRepo(): Promise<string> {
  const proc = Bun.spawn(['mktemp', '-d'], { stdout: 'pipe' });
  await proc.exited;
  const dir = (await new Response(proc.stdout).text()).trim();
  await runGit(['init', '-q', '-b', 'main'], dir);
  await runGit(['config', 'user.email', 'test@test'], dir);
  await runGit(['config', 'user.name', 'Test'], dir);
  await runGit(['config', 'commit.gpgsign', 'false'], dir);
  return dir;
}

beforeEach(async () => {
  TMP = await makeRepo();
});

afterEach(async () => {
  await Bun.spawn(['rm', '-rf', TMP]).exited;
});

describe('detectBootstrap', () => {
  test('empty target → bootstrap', async () => {
    const plugin = `${TMP}/plugin`;
    await Bun.write(`${plugin}/SKILL.md`, '---\n---\n');
    expect(await detectBootstrap(plugin)).toBe(true);
  });

  test('CHANGELOG.md present → not bootstrap', async () => {
    const plugin = `${TMP}/plugin`;
    await Bun.write(`${plugin}/CHANGELOG.md`, '# Changelog');
    expect(await detectBootstrap(plugin)).toBe(false);
  });
});

describe('collectDiff', () => {
  test('only CHANGELOG.md changed → empty entries (filtered)', async () => {
    const plugin = `${TMP}/plugin`;
    await Bun.write(`${plugin}/run.ts`, 'export {}');
    await Bun.write(`${plugin}/CHANGELOG.md`, '# v1');
    await runGit(['add', '.'], TMP);
    await runGit(['commit', '-q', '-m', 'baseline'], TMP);

    await Bun.write(`${plugin}/CHANGELOG.md`, '# v2');
    await runGit(['add', '.'], TMP);
    await runGit(['commit', '-q', '-m', 'cl bump'], TMP);

    const result = await collectDiff(plugin, 'HEAD~1..HEAD', TMP);
    expect(result.entries).toEqual([]);
  });

  test('source file modified → entry returned', async () => {
    const plugin = `${TMP}/plugin`;
    await Bun.write(`${plugin}/run.ts`, 'export const a = 1;');
    await runGit(['add', '.'], TMP);
    await runGit(['commit', '-q', '-m', 'init'], TMP);
    await Bun.write(`${plugin}/run.ts`, 'export const a = 2;');
    await runGit(['add', '.'], TMP);
    await runGit(['commit', '-q', '-m', 'edit'], TMP);
    const result = await collectDiff(plugin, 'HEAD~1..HEAD', TMP);
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.status).toBe('M');
  });

  test('resolves anchor automatically when --since absent', async () => {
    const plugin = `${TMP}/plugin`;
    await Bun.write(`${plugin}/run.ts`, 'x');
    await runGit(['add', '.'], TMP);
    await runGit(['commit', '-q', '-m', 'init'], TMP);
    await Bun.write(`${plugin}/run.ts`, 'y');
    await runGit(['add', '.'], TMP);
    await runGit(['commit', '-q', '-m', 'edit'], TMP);
    const result = await collectDiff(plugin, undefined, TMP);
    expect(result.since).toMatch(/HEAD~1\.\.HEAD|[a-f0-9]+\.\.HEAD/);
  });
});
