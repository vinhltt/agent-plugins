// New test: concurrent — 3 sibling plugins in one repo, bumped in parallel.
// Validates --no-optional-locks prevents .git/index.lock contention.

import { test, expect, beforeEach, afterEach } from 'bun:test';

const RUN_TS = `${import.meta.dir}/../scripts/run.ts`;

let REPO: string;

async function sh(
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
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

  // Create 3 sibling plugins, each with 1 skill + 1 unique impl file
  for (const name of ['plugin-a', 'plugin-b', 'plugin-c']) {
    const root = `${REPO}/${name}`;

    await Bun.write(
      `${root}/.claude-plugin/plugin.json`,
      JSON.stringify({ name, version: '0.1.0' }, null, 2) + '\n',
    );
    await Bun.write(
      `${root}/skills/${name}-skill/SKILL.md`,
      `---\nmetadata:\n  version: 0.1.0\n---\n\nbody for ${name}\n`,
    );
    // Unique file per plugin so git diff outputs are disjoint
    await Bun.write(
      `${root}/skills/${name}-skill/${name}-impl.ts`,
      `export const ${name.replace(/-/g, '')} = 1;\n`,
    );
  }

  await git(['add', '-A'], REPO);
  await git(['commit', '-q', '-m', 'init'], REPO);

  // Modify 1 file in each plugin and commit so there is a real diff
  for (const name of ['plugin-a', 'plugin-b', 'plugin-c']) {
    await Bun.write(
      `${REPO}/${name}/skills/${name}-skill/${name}-impl.ts`,
      `export const ${name.replace(/-/g, '')} = 2; // updated\n`,
    );
  }
  await git(['add', '-A'], REPO);
  await git(['commit', '-q', '-m', 'modify impl files'], REPO);
});

afterEach(async () => {
  await sh(['rm', '-rf', REPO]);
});

test('3 parallel runs on sibling plugins produce no conflicts', async () => {
  const pluginNames = ['plugin-a', 'plugin-b', 'plugin-c'];
  const pluginRoots = pluginNames.map(n => `${REPO}/${n}`);

  // Spawn all 3 runs simultaneously
  const procs = pluginRoots.map(root =>
    Bun.spawn(['bun', RUN_TS, `--target=${root}`, '--auto'], {
      cwd: REPO,
      stdout: 'pipe',
      stderr: 'pipe',
    }),
  );

  const results = await Promise.all(
    procs.map(async p => ({
      code: await p.exited,
      stderr: await new Response(p.stderr).text(),
    })),
  );

  // All exit 0
  for (const r of results) {
    expect(r.code).toBe(0);
  }

  // No index.lock errors
  for (const r of results) {
    expect(r.stderr).not.toContain('index.lock');
  }

  // Each plugin has its own manifest with distinct file sets
  const manifests = await Promise.all(
    pluginRoots.map(root =>
      Bun.file(`${root}/manifest.json`).json() as Promise<{ version: string; files: Record<string, string> }>,
    ),
  );

  // All manifests updated (version bumped from 0.1.0)
  for (const m of manifests) {
    expect(m.version).not.toBe('0.1.0');
  }

  // Each manifest's file keys are unique to its plugin (disjoint impl files)
  const fileSets = manifests.map(m => new Set(Object.keys(m.files)));
  for (let i = 0; i < pluginNames.length; i++) {
    const name = pluginNames[i]!;
    // impl file for this plugin appears in its manifest
    expect([...fileSets[i]!].some(k => k.includes(name))).toBe(true);
    // impl file does NOT appear in other plugins' manifests
    for (let j = 0; j < pluginNames.length; j++) {
      if (i === j) continue;
      expect([...fileSets[j]!].some(k => k.includes(name) && k.includes('impl'))).toBe(false);
    }
  }
});
