// Validates §4.5 parallel-safe claim. 3 sibling skills, run in parallel.
// H3: --no-optional-locks prevents .git/index.lock contention.

import { test, expect, beforeEach, afterEach } from 'bun:test';

const RUN_TS = `${import.meta.dir}/../scripts/run.ts`;
let REPO: string;

async function sh(args: string[], cwd?: string) {
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

beforeEach(async () => {
  const r = await sh(['mktemp', '-d']);
  REPO = r.stdout.trim();
  await git(['init', '-q', '-b', 'main'], REPO);
  await git(['config', 'user.email', 't@t'], REPO);
  await git(['config', 'user.name', 't'], REPO);
  await git(['config', 'commit.gpgsign', 'false'], REPO);

  for (const name of ['skill-a', 'skill-b', 'skill-c']) {
    await Bun.write(`${REPO}/${name}/SKILL.md`, `---
metadata:
  version: 0.1.0
---
body for ${name}
`);
    await Bun.write(`${REPO}/${name}/${name}-impl.ts`, `export const ${name.replace('-','')} = 1;`);
  }
  await git(['add', '-A'], REPO);
  await git(['commit', '-q', '-m', 'init'], REPO);
});

afterEach(async () => {
  await sh(['rm', '-rf', REPO]);
});

test('3 parallel runs on sibling skills produce no conflicts', async () => {
  const skills = ['skill-a', 'skill-b', 'skill-c'].map(n => `${REPO}/${n}`);
  const procs = skills.map(dir =>
    Bun.spawn(['bun', RUN_TS, `--target=${dir}`, '--auto'], {
      cwd: REPO, stdout: 'pipe', stderr: 'pipe',
    }),
  );
  const results = await Promise.all(procs.map(async p => ({
    code: await p.exited,
    stderr: await new Response(p.stderr).text(),
  })));

  for (const r of results) {
    expect(r.code).toBe(0);
  }

  const manifests = await Promise.all(
    skills.map(d => Bun.file(`${d}/manifest.json`).json()),
  );
  // Each manifest's file set is disjoint by content (skill-N-impl.ts unique to N).
  const sigs = new Set(manifests.map(m => JSON.stringify(Object.keys(m.files).sort())));
  expect(sigs.size).toBe(3);
  for (let i = 0; i < skills.length; i++) {
    const name = ['skill-a', 'skill-b', 'skill-c'][i]!;
    expect(Object.keys(manifests[i].files).some(k => k.includes(name))).toBe(true);
  }
});
