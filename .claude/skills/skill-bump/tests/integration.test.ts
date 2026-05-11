// Integration: full pipeline (run.ts as subprocess) on inline fixtures.
// Per phase 5: bootstrap, rename-within, frontmatter-no-version, metadata-multi-key,
// outside-repo, idempotency.

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';

const RUN_TS = `${import.meta.dir}/../scripts/run.ts`;

let REPO: string;

async function sh(args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const code = await proc.exited;
  return {
    code,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  };
}

async function git(args: string[], cwd: string): Promise<void> {
  const r = await sh(['git', ...args], cwd);
  if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
}

async function makeRepo(): Promise<string> {
  const r = await sh(['mktemp', '-d']);
  const dir = r.stdout.trim();
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.email', 'test@test'], dir);
  await git(['config', 'user.name', 'Test'], dir);
  await git(['config', 'commit.gpgsign', 'false'], dir);
  return dir;
}

async function commitAll(repo: string, msg: string): Promise<void> {
  await git(['add', '-A'], repo);
  await git(['commit', '-q', '-m', msg], repo);
}

async function runSkill(target: string, flags: string[] = []): Promise<{ code: number; stdout: string; stderr: string }> {
  return sh(['bun', RUN_TS, `--target=${target}`, ...flags]);
}

beforeEach(async () => {
  REPO = await makeRepo();
});

afterEach(async () => {
  await sh(['rm', '-rf', REPO]);
});

describe('bootstrap', () => {
  test('empty target → bootstrap → 0.1.0 + no manifest + TODO placeholder', async () => {
    const skill = `${REPO}/skill`;
    await Bun.write(`${skill}/SKILL.md`, `---
metadata:
  version: 0.1.0
---
body
`);
    await Bun.write(`${skill}/run.ts`, 'export const x = 1;');
    await commitAll(REPO, 'init');

    const r = await runSkill(skill, ['--auto']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('bootstrapped');

    // Regression guard: manifest.json must NEVER be written.
    expect(await Bun.file(`${skill}/manifest.json`).exists()).toBe(false);

    const cl = await Bun.file(`${skill}/CHANGELOG.md`).text();
    expect(cl).toContain('## [0.1.0]');
    expect(cl).toContain('### Added');
    expect(cl).toContain('- TODO: describe');
    // file paths must NOT appear — changelog is the meaning ledger, not the file list
    expect(cl).not.toContain('- run.ts');
    expect(cl).not.toContain('- SKILL.md');
  });

  test('bootstrap with --added flags → descriptions used, no TODO', async () => {
    const skill = `${REPO}/skill`;
    await Bun.write(`${skill}/SKILL.md`, `---
metadata:
  version: 0.1.0
---
body
`);
    await Bun.write(`${skill}/run.ts`, 'export const x = 1;');
    await commitAll(REPO, 'init');

    const r = await runSkill(skill, [
      '--auto',
      '--added=Initial release with run.ts entrypoint',
      '--added=Frontmatter parser bootstrapped',
    ]);
    expect(r.code).toBe(0);

    const cl = await Bun.file(`${skill}/CHANGELOG.md`).text();
    expect(cl).toContain('- Initial release with run.ts entrypoint');
    expect(cl).toContain('- Frontmatter parser bootstrapped');
    expect(cl).not.toContain('- TODO: describe');
    expect(cl).not.toContain('- run.ts');
  });
});

describe('rename-within', () => {
  test('git mv → patch bump', async () => {
    const skill = `${REPO}/skill`;
    await Bun.write(`${skill}/SKILL.md`, `---
metadata:
  version: 0.1.0
---
`);
    await Bun.write(`${skill}/old.ts`, 'export {};');
    await commitAll(REPO, 'init');

    // bootstrap
    await runSkill(skill, ['--auto']);
    await commitAll(REPO, 'bootstrap');

    // rename
    await git(['mv', `${skill}/old.ts`, `${skill}/new.ts`], REPO);
    await commitAll(REPO, 'rename');

    const r = await runSkill(skill, ['--auto']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('patch');

    // Frontmatter is the single SoT for version.
    const fm = await Bun.file(`${skill}/SKILL.md`).text();
    expect(fm).toMatch(/version:\s*0\.1\.1/);
    const cl = await Bun.file(`${skill}/CHANGELOG.md`).text();
    expect(cl).toContain('## [0.1.1]');
    // Regression guard.
    expect(await Bun.file(`${skill}/manifest.json`).exists()).toBe(false);
  });
});

describe('frontmatter-no-version (non-bootstrap)', () => {
  test('missing metadata.version on incremental → abort', async () => {
    const skill = `${REPO}/skill`;
    await Bun.write(`${skill}/SKILL.md`, `---
name: test
---
body
`);
    await Bun.write(`${skill}/run.ts`, 'x');
    // pre-stage changelog so it's NOT bootstrap (presence of CHANGELOG.md alone signals existing skill)
    await Bun.write(`${skill}/CHANGELOG.md`, '# Changelog\n\n## [0.1.0] - 2026-05-02\n');
    await commitAll(REPO, 'init');
    await Bun.write(`${skill}/run.ts`, 'y');
    await commitAll(REPO, 'edit');

    const r = await runSkill(skill, ['--auto']);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('metadata.version missing');
  });
});

describe('metadata-multi-key', () => {
  test('version not first child of metadata → parser still finds it', async () => {
    const skill = `${REPO}/skill`;
    await Bun.write(`${skill}/SKILL.md`, `---
name: test
metadata:
  authors: VinhLTT
  version: 0.3.0
  scope: per-skill
---
body
`);
    await Bun.write(`${skill}/run.ts`, 'x');
    await commitAll(REPO, 'init');
    const r = await runSkill(skill, ['--auto']);
    expect(r.code).toBe(0);
    const cl = await Bun.file(`${skill}/CHANGELOG.md`).text();
    expect(cl).toContain('## [0.3.0]');
    expect(await Bun.file(`${skill}/manifest.json`).exists()).toBe(false);
  });
});

describe('outside-repo', () => {
  test('target outside any git repo → graceful abort', async () => {
    const r = await sh(['mktemp', '-d']);
    const dir = r.stdout.trim();
    try {
      await Bun.write(`${dir}/SKILL.md`, '---\nmetadata:\n  version: 0.1.0\n---\n');
      const result = await runSkill(dir, ['--auto']);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('Not inside git repo');
    } finally {
      await sh(['rm', '-rf', dir]);
    }
  });
});

describe('idempotency', () => {
  test('2 runs separated by commit → 2nd run no-op', async () => {
    const skill = `${REPO}/skill`;
    await Bun.write(`${skill}/SKILL.md`, '---\nmetadata:\n  version: 0.1.0\n---\n');
    await Bun.write(`${skill}/run.ts`, 'x');
    await commitAll(REPO, 'init');

    const r1 = await runSkill(skill, ['--auto']);
    expect(r1.code).toBe(0);
    await commitAll(REPO, 'bootstrap output');

    const beforeFm = await Bun.file(`${skill}/SKILL.md`).text();
    const beforeCl = await Bun.file(`${skill}/CHANGELOG.md`).text();

    const r2 = await runSkill(skill, ['--auto']);
    expect(r2.code).toBe(0);
    expect(r2.stdout).toContain('no changes');

    expect(await Bun.file(`${skill}/SKILL.md`).text()).toBe(beforeFm);
    expect(await Bun.file(`${skill}/CHANGELOG.md`).text()).toBe(beforeCl);
    expect(await Bun.file(`${skill}/manifest.json`).exists()).toBe(false);
  });
});

describe('dry-run', () => {
  test('dry-run prints plan, writes nothing', async () => {
    const skill = `${REPO}/skill`;
    await Bun.write(`${skill}/SKILL.md`, '---\nmetadata:\n  version: 0.1.0\n---\n');
    await Bun.write(`${skill}/run.ts`, 'x');
    await commitAll(REPO, 'init');

    const r = await runSkill(skill, ['--auto', '--dry-run']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('"mode": "bootstrap"');
    expect(await Bun.file(`${skill}/manifest.json`).exists()).toBe(false);
    expect(await Bun.file(`${skill}/CHANGELOG.md`).exists()).toBe(false);
  });
});

describe('dirty-tree fail-fast', () => {
  test('default mode → abort with helpful message', async () => {
    const skill = `${REPO}/skill`;
    await Bun.write(`${skill}/SKILL.md`, '---\nmetadata:\n  version: 0.1.0\n---\n');
    await Bun.write(`${skill}/run.ts`, 'x');
    await commitAll(REPO, 'init');
    // dirty
    await Bun.write(`${skill}/run.ts`, 'y');

    const r = await runSkill(skill); // no --auto
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Dirty working tree');
  });
});
