// New test: end-to-end integration — full pipeline via bun scripts/run.ts subprocess.

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';

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

interface FakePlugin {
  root: string;
  cleanup: () => Promise<void>;
}

async function makeFakePlugin(opts: {
  name?: string;
  skills?: string[];
  agents?: string[];
  commands?: string[];
  hooks?: string[];
  existingRepo?: string; // if provided, plugin is created inside this repo
}): Promise<FakePlugin> {
  let repoRoot: string;
  let isOwnedRepo = false;

  if (opts.existingRepo) {
    repoRoot = opts.existingRepo;
  } else {
    repoRoot = await makeRepo();
    isOwnedRepo = true;
  }

  const name = opts.name ?? `plugin-${Date.now()}`;
  const root = `${repoRoot}/${name}`;

  // .claude-plugin/plugin.json
  await Bun.write(
    `${root}/.claude-plugin/plugin.json`,
    JSON.stringify({ name, version: '0.1.0' }, null, 2) + '\n',
  );

  // skills
  for (const s of opts.skills ?? []) {
    await Bun.write(
      `${root}/skills/${s}/SKILL.md`,
      `---\nmetadata:\n  version: 0.1.0\n---\n\nbody for ${s}\n`,
    );
  }

  // agents
  for (const a of opts.agents ?? []) {
    await Bun.write(
      `${root}/agents/${a}.md`,
      `---\nversion: 0.1.0\n---\n\nagent ${a}\n`,
    );
  }

  // commands
  for (const c of opts.commands ?? []) {
    await Bun.write(
      `${root}/commands/${c}.md`,
      `---\nversion: 0.1.0\n---\n\ncmd ${c}\n`,
    );
  }

  // hooks
  for (const h of opts.hooks ?? []) {
    await Bun.write(
      `${root}/hooks/${h}.json`,
      JSON.stringify({ version: '0.1.0', name: h }, null, 2) + '\n',
    );
  }

  await commitAll(repoRoot, 'initial');

  return {
    root,
    cleanup: isOwnedRepo
      ? async () => { await sh(['rm', '-rf', repoRoot]); }
      : async () => { /* caller owns the repo */ },
  };
}

beforeEach(async () => {
  REPO = await makeRepo();
});

afterEach(async () => {
  await sh(['rm', '-rf', REPO]);
});

describe('integration: basic bump pipeline', () => {
  test('exit 0, plugin.json bumped, modified skill version updated, unmodified skill byte-identical', async () => {
    // Build fake plugin with 2 skills, 1 agent, 1 command
    const plugin = await makeFakePlugin({
      name: 'my-plugin',
      skills: ['skill-a', 'skill-b'],
      agents: ['agent-x'],
      commands: ['cmd-y'],
      existingRepo: REPO,
    });

    // Record original content of skill-b (unmodified)
    const skillBPath = `${plugin.root}/skills/skill-b/SKILL.md`;
    const skillBOriginal = await Bun.file(skillBPath).text();

    // Modify skill-a and commit
    await Bun.write(
      `${plugin.root}/skills/skill-a/SKILL.md`,
      `---\nmetadata:\n  version: 0.1.0\n---\n\n# Modified\n\nsome change\n`,
    );
    await commitAll(REPO, 'modify skill-a');

    // Run plugin-bump
    const r = await sh(['bun', RUN_TS, `--target=${plugin.root}`, '--auto']);
    expect(r.code).toBe(0);

    // plugin.json bumped
    const pluginJson = JSON.parse(
      await Bun.file(`${plugin.root}/.claude-plugin/plugin.json`).text(),
    ) as Record<string, unknown>;
    expect(pluginJson.version).not.toBe('0.1.0');

    // skill-a version updated
    const skillAText = await Bun.file(`${plugin.root}/skills/skill-a/SKILL.md`).text();
    expect(skillAText).toContain(`version: ${pluginJson.version}`);

    // skill-b byte-identical (not in diff)
    const skillBAfter = await Bun.file(skillBPath).text();
    expect(skillBAfter).toBe(skillBOriginal);

    // CHANGELOG.md exists and has new version
    const cl = await Bun.file(`${plugin.root}/CHANGELOG.md`).text();
    expect(cl).toContain(`## [${pluginJson.version}]`);
  });

  test('no changes since last commit → exit non-zero, no-op message', async () => {
    const plugin = await makeFakePlugin({
      name: 'stable-plugin',
      skills: ['skill-a'],
      existingRepo: REPO,
    });

    // Need a second commit so HEAD~1 exists (run.ts falls back to HEAD~1..HEAD)
    await Bun.write(`${plugin.root}/skills/skill-a/SKILL.md`,
      `---\nmetadata:\n  version: 0.1.0\n---\n\nbody v2\n`);
    await commitAll(REPO, 'touch skill-a');

    // Run once to bootstrap (first run creates changelog/manifest)
    const r1 = await sh(['bun', RUN_TS, `--target=${plugin.root}`, '--auto']);
    expect(r1.code).toBe(0);

    // Commit the bootstrap output
    await commitAll(REPO, 'bootstrap output');

    // Run again — no changes since the CHANGELOG.md anchor commit
    const r2 = await sh(['bun', RUN_TS, `--target=${plugin.root}`, '--auto']);
    expect(r2.code).not.toBe(0); // exits 2 for "no changes"
    expect(r2.stdout).toContain('no changes');
  });

  test('target without .claude-plugin/plugin.json → graceful abort', async () => {
    const dir = `${REPO}/not-a-plugin`;
    await Bun.write(`${dir}/README.md`, '# Not a plugin');
    await commitAll(REPO, 'not a plugin dir');

    const r = await sh(['bun', RUN_TS, `--target=${dir}`, '--auto']);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('plugin.json missing');
  });
});
