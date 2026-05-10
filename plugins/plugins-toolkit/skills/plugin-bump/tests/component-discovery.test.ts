// New test: component-discovery — tests for scripts/lib/component-discovery.ts

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { discoverComponents } from '../scripts/lib/component-discovery';

let REPO: string;

async function git(args: string[], cwd: string): Promise<void> {
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

beforeEach(async () => {
  REPO = await makeRepo();
});

afterEach(async () => {
  await Bun.spawn(['rm', '-rf', REPO]).exited;
});

describe('discoverComponents', () => {
  test('fake plugin with 1 skill + 1 agent + 1 command + 1 hook → discovers all 4 kinds', async () => {
    const plugin = `${REPO}/my-plugin`;

    // skill
    await Bun.write(`${plugin}/skills/my-skill/SKILL.md`, `---\nmetadata:\n  version: 0.1.0\n---\n`);
    // agent
    await Bun.write(`${plugin}/agents/my-agent.md`, `---\nversion: 0.1.0\n---\n`);
    // command
    await Bun.write(`${plugin}/commands/my-cmd.md`, `---\nversion: 0.1.0\n---\n`);
    // hook
    await Bun.write(`${plugin}/hooks/my-hook.json`, JSON.stringify({ version: '0.1.0' }));
    // plugin manifest
    await Bun.write(`${plugin}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'my-plugin', version: '0.1.0' }));

    await commitAll(REPO, 'init');

    const components = await discoverComponents(plugin);

    expect(components.length).toBe(4);
    const kinds = components.map(c => c.kind).sort();
    expect(kinds).toEqual(['agent', 'command', 'hook', 'skill']);
  });

  test('skills/<name>/scripts/x.ts → NOT classified as component', async () => {
    const plugin = `${REPO}/my-plugin`;

    await Bun.write(`${plugin}/skills/my-skill/SKILL.md`, `---\nmetadata:\n  version: 0.1.0\n---\n`);
    // nested script file — should be ignored
    await Bun.write(`${plugin}/skills/my-skill/scripts/helper.ts`, `export {};`);
    await Bun.write(`${plugin}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'my-plugin', version: '0.1.0' }));

    await commitAll(REPO, 'init');

    const components = await discoverComponents(plugin);
    // Only SKILL.md is a component; scripts/helper.ts is not
    expect(components.length).toBe(1);
    expect(components[0]!.kind).toBe('skill');
    expect(components[0]!.pluginRelPath).toBe('skills/my-skill/SKILL.md');
  });

  test('empty plugin → returns []', async () => {
    const plugin = `${REPO}/empty-plugin`;
    // Only plugin.json — no components
    await Bun.write(`${plugin}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'empty', version: '0.1.0' }));

    await commitAll(REPO, 'init');

    const components = await discoverComponents(plugin);
    expect(components).toEqual([]);
  });

  test('.claude-plugin/ files not classified as components', async () => {
    const plugin = `${REPO}/my-plugin`;

    await Bun.write(`${plugin}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'my-plugin', version: '0.1.0' }));
    // extra file under .claude-plugin
    await Bun.write(`${plugin}/.claude-plugin/config.json`, JSON.stringify({ foo: 'bar' }));

    await commitAll(REPO, 'init');

    const components = await discoverComponents(plugin);
    expect(components).toEqual([]);
  });

  test('output sorted by pluginRelPath', async () => {
    const plugin = `${REPO}/my-plugin`;

    await Bun.write(`${plugin}/skills/zzz-skill/SKILL.md`, `---\nmetadata:\n  version: 0.1.0\n---\n`);
    await Bun.write(`${plugin}/skills/aaa-skill/SKILL.md`, `---\nmetadata:\n  version: 0.1.0\n---\n`);
    await Bun.write(`${plugin}/agents/my-agent.md`, `---\nversion: 0.1.0\n---\n`);
    await Bun.write(`${plugin}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'my-plugin', version: '0.1.0' }));

    await commitAll(REPO, 'init');

    const components = await discoverComponents(plugin);
    const paths = components.map(c => c.pluginRelPath);
    expect(paths).toEqual([...paths].sort());
  });

  test('versionTarget for skill uses metadata.version fmt', async () => {
    const plugin = `${REPO}/my-plugin`;

    await Bun.write(`${plugin}/skills/s/SKILL.md`, `---\nmetadata:\n  version: 0.1.0\n---\n`);
    await Bun.write(`${plugin}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'my-plugin', version: '0.1.0' }));

    await commitAll(REPO, 'init');

    const components = await discoverComponents(plugin);
    expect(components[0]!.versionTarget).toEqual({ fmt: 'yaml-frontmatter', key: 'metadata.version' });
  });

  test('versionTarget for hook uses json-field fmt', async () => {
    const plugin = `${REPO}/my-plugin`;

    await Bun.write(`${plugin}/hooks/h.json`, JSON.stringify({ version: '0.1.0' }));
    await Bun.write(`${plugin}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'my-plugin', version: '0.1.0' }));

    await commitAll(REPO, 'init');

    const components = await discoverComponents(plugin);
    expect(components[0]!.versionTarget).toEqual({ fmt: 'json-field', key: 'version' });
  });

  test('versionTarget for agent uses top-level version fmt', async () => {
    const plugin = `${REPO}/my-plugin`;

    await Bun.write(`${plugin}/agents/a.md`, `---\nversion: 0.1.0\n---\n`);
    await Bun.write(`${plugin}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'my-plugin', version: '0.1.0' }));

    await commitAll(REPO, 'init');

    const components = await discoverComponents(plugin);
    expect(components[0]!.versionTarget).toEqual({ fmt: 'yaml-frontmatter', key: 'version' });
  });
});
