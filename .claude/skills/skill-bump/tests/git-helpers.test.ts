import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
  gitDiffNameStatus,
  gitLsFiles,
  resolveSinceAnchor,
  assertInGitRepo,
  assertRefExists,
  assertTargetSafe,
  isWorkingTreeDirty,
  parseDiffOutput,
  stripTargetPrefix,
  GitError,
} from '../scripts/lib/git-helpers';
import { isExcluded } from '../scripts/lib/default-excludes';

let REPO: string;

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
  REPO = await makeRepo();
});

afterEach(async () => {
  await Bun.spawn(['rm', '-rf', REPO]).exited;
});

describe('stripTargetPrefix', () => {
  test('absolute path under target → relative', () => {
    expect(stripTargetPrefix('/repo/skill/a.ts', '/repo/skill')).toBe('a.ts');
  });

  test('target with trailing slash works', () => {
    expect(stripTargetPrefix('/repo/skill/a.ts', '/repo/skill/')).toBe('a.ts');
  });

  test('nested path preserved', () => {
    expect(stripTargetPrefix('/repo/skill/sub/c.ts', '/repo/skill')).toBe('sub/c.ts');
  });

  test('path not under target → unchanged', () => {
    expect(stripTargetPrefix('/other/x.ts', '/repo/skill')).toBe('/other/x.ts');
  });
});

describe('isExcluded', () => {
  test('CHANGELOG.md root excluded', () => {
    expect(isExcluded('CHANGELOG.md')).toBe(true);
  });

  test('manifest.json root excluded', () => {
    expect(isExcluded('manifest.json')).toBe(true);
  });

  test('.git/** excluded', () => {
    expect(isExcluded('.git/HEAD')).toBe(true);
  });

  test('sub/CHANGELOG.md NOT excluded (root-only)', () => {
    expect(isExcluded('sub/CHANGELOG.md')).toBe(false);
  });

  test('regular ts file not excluded', () => {
    expect(isExcluded('scripts/run.ts')).toBe(false);
  });
});

describe('parseDiffOutput', () => {
  test('M status', () => {
    const out = 'M\tskill/run.ts\n';
    const e = parseDiffOutput(out, 'skill');
    expect(e).toEqual([{ status: 'M', path: 'run.ts' }]);
  });

  test('R100 rename → status R with old/new paths', () => {
    const out = 'R100\tskill/old.ts\tskill/new.ts\n';
    const e = parseDiffOutput(out, 'skill');
    expect(e).toEqual([{ status: 'R', path: 'new.ts', oldPath: 'old.ts' }]);
  });

  test('A + M + D mix', () => {
    const out = 'A\tskill/new.ts\nM\tskill/run.ts\nD\tskill/old.ts\n';
    const e = parseDiffOutput(out, 'skill');
    expect(e.map(x => x.status).sort()).toEqual(['A', 'D', 'M']);
  });

  test('CHANGELOG.md M filtered out', () => {
    const out = 'M\tskill/CHANGELOG.md\nM\tskill/run.ts\n';
    const e = parseDiffOutput(out, 'skill');
    expect(e).toEqual([{ status: 'M', path: 'run.ts' }]);
  });
});

describe('git ops on real repo', () => {
  test('assertInGitRepo passes inside repo', async () => {
    await expect(assertInGitRepo(REPO)).resolves.toBeUndefined();
  });

  test('assertInGitRepo throws outside', async () => {
    const proc = Bun.spawn(['mktemp', '-d'], { stdout: 'pipe' });
    await proc.exited;
    const nonRepo = (await new Response(proc.stdout).text()).trim();
    try {
      await expect(assertInGitRepo(nonRepo)).rejects.toThrow(GitError);
    } finally {
      await Bun.spawn(['rm', '-rf', nonRepo]).exited;
    }
  });

  test('assertRefExists passes for HEAD', async () => {
    await Bun.write(`${REPO}/a.txt`, 'x');
    await runGit(['add', '.'], REPO);
    await runGit(['commit', '-q', '-m', 'init'], REPO);
    await expect(assertRefExists('HEAD', REPO)).resolves.toBeUndefined();
  });

  test('assertRefExists throws on bad ref', async () => {
    await Bun.write(`${REPO}/a.txt`, 'x');
    await runGit(['add', '.'], REPO);
    await runGit(['commit', '-q', '-m', 'init'], REPO);
    await expect(assertRefExists('nonexistent-ref', REPO)).rejects.toThrow(GitError);
  });

  test('isWorkingTreeDirty: clean=false, dirty=true', async () => {
    await Bun.write(`${REPO}/a.txt`, 'x');
    await runGit(['add', '.'], REPO);
    await runGit(['commit', '-q', '-m', 'init'], REPO);
    expect(await isWorkingTreeDirty(REPO, REPO)).toBe(false);
    await Bun.write(`${REPO}/a.txt`, 'y');
    expect(await isWorkingTreeDirty(REPO, REPO)).toBe(true);
  });

  test('gitLsFiles lists tracked files', async () => {
    await Bun.write(`${REPO}/a.txt`, 'x');
    await Bun.write(`${REPO}/b.txt`, 'y');
    await runGit(['add', '.'], REPO);
    await runGit(['commit', '-q', '-m', 'init'], REPO);
    const files = await gitLsFiles(REPO, REPO);
    expect(files.sort()).toEqual(['a.txt', 'b.txt']);
  });

  test('gitDiffNameStatus parses status across commits', async () => {
    await Bun.write(`${REPO}/a.txt`, 'x');
    await runGit(['add', '.'], REPO);
    await runGit(['commit', '-q', '-m', 'c1'], REPO);
    await Bun.write(`${REPO}/a.txt`, 'y');
    await Bun.write(`${REPO}/b.txt`, 'z');
    await runGit(['add', '.'], REPO);
    await runGit(['commit', '-q', '-m', 'c2'], REPO);
    const entries = await gitDiffNameStatus('HEAD~1..HEAD', REPO, REPO);
    const statuses = entries.map(e => e.status).sort();
    expect(statuses).toEqual(['A', 'M']);
  });

  test('resolveSinceAnchor returns HEAD~1..HEAD when changelog absent', async () => {
    await Bun.write(`${REPO}/a.txt`, 'x');
    await runGit(['add', '.'], REPO);
    await runGit(['commit', '-q', '-m', 'init'], REPO);
    const anchor = await resolveSinceAnchor(REPO, REPO);
    expect(anchor).toBe('HEAD~1..HEAD');
  });

  test('resolveSinceAnchor returns SHA when changelog tracked', async () => {
    await Bun.write(`${REPO}/CHANGELOG.md`, '# Changelog');
    await runGit(['add', '.'], REPO);
    await runGit(['commit', '-q', '-m', 'add cl'], REPO);
    const anchor = await resolveSinceAnchor(REPO, REPO);
    expect(anchor).toMatch(/^[a-f0-9]+\.\.HEAD$/);
  });
});

describe('assertTargetSafe', () => {
  test('happy path: real skill folder with SKILL.md', async () => {
    await Bun.write(`${REPO}/skill/SKILL.md`, '---\n---\n');
    await runGit(['add', '.'], REPO);
    await runGit(['commit', '-q', '-m', 'init'], REPO);
    const canonical = await assertTargetSafe(`${REPO}/skill`);
    expect(canonical).toContain('skill');
  });

  test('throws when SKILL.md missing', async () => {
    const proc = Bun.spawn(['mkdir', '-p', `${REPO}/empty`]);
    await proc.exited;
    await runGit(['add', '.'], REPO);
    await expect(assertTargetSafe(`${REPO}/empty`)).rejects.toThrow(/SKILL.md missing/);
  });
});
