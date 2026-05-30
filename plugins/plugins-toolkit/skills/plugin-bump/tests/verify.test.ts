// Test: verify — tests for scripts/verify.ts (4-check DoD)
// Uses real git repos so captureHeadSnapshot (gitShowHead) works correctly.

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { verify, captureHeadSnapshot } from '../scripts/verify';
import { cascadeVersion } from '../scripts/version-cascade';
import { appendEntry } from '../scripts/changelog-writer';
import type { DiscoveredComponent } from '../scripts/lib/component-discovery';

let REPO: string;
let PLUGIN: string;

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

function makeSkillComp(name: string, pluginRoot: string): DiscoveredComponent {
  return {
    kind: 'skill',
    pluginRelPath: `skills/${name}/SKILL.md`,
    absPath: `${pluginRoot}/skills/${name}/SKILL.md`,
    versionTarget: { fmt: 'yaml-frontmatter', key: 'metadata.version' },
  };
}

function makeAgentComp(name: string, pluginRoot: string): DiscoveredComponent {
  return {
    kind: 'agent',
    pluginRelPath: `agents/${name}.md`,
    absPath: `${pluginRoot}/agents/${name}.md`,
    versionTarget: { fmt: 'yaml-frontmatter', key: 'version' },
  };
}

// Writes initial plugin state at version v and commits it.
async function writeAndCommitPlugin(
  pluginRoot: string,
  repo: string,
  version: string,
  components: DiscoveredComponent[],
): Promise<void> {
  await Bun.write(`${pluginRoot}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'test', version }, null, 2) + '\n');
  for (const comp of components) {
    await Bun.write(comp.absPath, `---\nmetadata:\n  version: ${version}\n---\n\nbody\n`);
  }
  await appendEntry(`${pluginRoot}/CHANGELOG.md`, {
    version, date: '2026-05-09',
    added: ['initial'], changed: [], removed: [],
  });
  await commitAll(repo, `state v${version}`);
}

beforeEach(async () => {
  REPO = await makeRepo();
  PLUGIN = `${REPO}/my-plugin`;
});

afterEach(async () => {
  await Bun.spawn(['rm', '-rf', REPO]).exited;
});

describe('verify', () => {
  test('happy path (all 4 checks pass) → ok=true', async () => {
    const skillA = makeSkillComp('skill-a', PLUGIN);
    const skillB = makeSkillComp('skill-b', PLUGIN);
    const components = [skillA, skillB];

    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', components);

    // Modify skillA (it's in the diff)
    await Bun.write(skillA.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n\nbody modified\n`);
    await commitAll(REPO, 'modify skill-a');

    const diffPaths = new Set([skillA.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot(components, PLUGIN, REPO, diffPaths);

    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components, diffPaths });
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-09',
      added: [], changed: ['skill-a'], removed: [],
    });

    const result = await verify({
      pluginRoot: PLUGIN,
      expectedVersion: '0.2.0',
      components, diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  test('corrupt plugin.json version → check (a) fails', async () => {
    const comp = makeSkillComp('skill-a', PLUGIN);
    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', [comp]);

    const diffPaths = new Set([comp.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot([comp], PLUGIN, REPO, diffPaths);

    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components: [comp], diffPaths });
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-09',
      added: [], changed: ['skill-a'], removed: [],
    });

    // Corrupt plugin.json version (cascade wrote 0.2.0 — overwrite with bad value)
    await Bun.write(`${PLUGIN}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'test', version: '9.9.9' }, null, 2) + '\n');

    const result = await verify({
      pluginRoot: PLUGIN,
      expectedVersion: '0.2.0',
      components: [comp], diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.find(f => f.check === 'a')).toBeDefined();
  });

  test('CHANGELOG.md wrong top version → check (b) fails', async () => {
    const comp = makeSkillComp('skill-a', PLUGIN);
    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', [comp]);

    const diffPaths = new Set([comp.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot([comp], PLUGIN, REPO, diffPaths);

    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components: [comp], diffPaths });

    // Write changelog with wrong top version
    await Bun.write(`${PLUGIN}/CHANGELOG.md`, `# Changelog\n\n## [9.9.9] - 2026-05-09\n\n### Changed\n- skill-a\n`);

    const result = await verify({
      pluginRoot: PLUGIN,
      expectedVersion: '0.2.0',
      components: [comp], diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.find(f => f.check === 'b')).toBeDefined();
  });

  test('component in diff has wrong version on disk → check (c) fails', async () => {
    const comp = makeSkillComp('skill-a', PLUGIN);
    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', [comp]);

    const diffPaths = new Set([comp.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot([comp], PLUGIN, REPO, diffPaths);

    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components: [comp], diffPaths });
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-09',
      added: [], changed: ['skill-a'], removed: [],
    });

    // Overwrite component file back to old version (simulating partial write failure)
    await Bun.write(comp.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n\nbody\n`);

    const result = await verify({
      pluginRoot: PLUGIN,
      expectedVersion: '0.2.0',
      components: [comp], diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.find(f => f.check === 'c')).toBeDefined();
  });

  test('happy path with 3 manifests -> all check (a) pass', async () => {
    const comp = makeSkillComp('skill-a', PLUGIN);
    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', [comp]);

    // Create codex + cursor manifests
    await Bun.write(`${PLUGIN}/.codex-plugin/plugin.json`, JSON.stringify({ name: 'test', version: '0.1.0' }, null, 2) + '\n');
    await Bun.write(`${PLUGIN}/.cursor-plugin/plugin.json`, JSON.stringify({ name: 'test', version: '0.1.0' }, null, 2) + '\n');
    await commitAll(REPO, 'add codex+cursor manifests');

    await Bun.write(comp.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n\nmodified\n`);
    await commitAll(REPO, 'modify skill');

    const diffPaths = new Set([comp.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot([comp], PLUGIN, REPO, diffPaths);

    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components: [comp], diffPaths });
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-22',
      added: [], changed: ['skill-a'], removed: [],
    });

    const result = await verify({
      pluginRoot: PLUGIN, expectedVersion: '0.2.0',
      components: [comp], diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  test('codex manifest has wrong version -> check (a) fails with format in reason', async () => {
    const comp = makeSkillComp('skill-a', PLUGIN);
    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', [comp]);

    await Bun.write(`${PLUGIN}/.codex-plugin/plugin.json`, JSON.stringify({ name: 'test', version: '0.1.0' }, null, 2) + '\n');
    await commitAll(REPO, 'add codex manifest');

    await Bun.write(comp.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n\nmodified\n`);
    await commitAll(REPO, 'modify skill');

    const diffPaths = new Set([comp.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot([comp], PLUGIN, REPO, diffPaths);

    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components: [comp], diffPaths });
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-22',
      added: [], changed: ['skill-a'], removed: [],
    });

    // Corrupt codex manifest
    await Bun.write(`${PLUGIN}/.codex-plugin/plugin.json`, JSON.stringify({ name: 'test', version: '9.9.9' }, null, 2) + '\n');

    const result = await verify({
      pluginRoot: PLUGIN, expectedVersion: '0.2.0',
      components: [comp], diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(false);
    const aFail = result.failures.find(f => f.check === 'a');
    expect(aFail).toBeDefined();
    expect(aFail!.reason).toContain('codex');
  });

  test('claude OK + cursor wrong -> check (a) fails', async () => {
    const comp = makeSkillComp('skill-a', PLUGIN);
    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', [comp]);

    await Bun.write(`${PLUGIN}/.cursor-plugin/plugin.json`, JSON.stringify({ name: 'test', version: '0.1.0' }, null, 2) + '\n');
    await commitAll(REPO, 'add cursor manifest');

    await Bun.write(comp.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n\nmodified\n`);
    await commitAll(REPO, 'modify skill');

    const diffPaths = new Set([comp.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot([comp], PLUGIN, REPO, diffPaths);

    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components: [comp], diffPaths });
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-22',
      added: [], changed: ['skill-a'], removed: [],
    });

    // Corrupt cursor manifest only
    await Bun.write(`${PLUGIN}/.cursor-plugin/plugin.json`, JSON.stringify({ name: 'test', version: '0.0.1' }, null, 2) + '\n');

    const result = await verify({
      pluginRoot: PLUGIN, expectedVersion: '0.2.0',
      components: [comp], diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(false);
    const aFails = result.failures.filter(f => f.check === 'a');
    expect(aFails).toHaveLength(1);
    expect(aFails[0]!.reason).toContain('cursor');
  });

  test('component NOT in diff has version changed → check (d) fails', async () => {
    const skillA = makeSkillComp('skill-a', PLUGIN);
    const skillB = makeSkillComp('skill-b', PLUGIN);
    const components = [skillA, skillB];

    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', components);

    // Only skillA is in diff
    const diffPaths = new Set([skillA.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot(components, PLUGIN, REPO, diffPaths);

    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components, diffPaths });
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-09',
      added: [], changed: ['skill-a'], removed: [],
    });

    // skillB was NOT in diff but its version was changed — simulates accidental mutation
    await Bun.write(skillB.absPath, `---\nmetadata:\n  version: 0.2.0\n---\n\nbody\n`);

    const result = await verify({
      pluginRoot: PLUGIN,
      expectedVersion: '0.2.0',
      components, diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.find(f => f.check === 'd')).toBeDefined();
  });

  // These two are the only coverage of the agent (key='version') verify read path —
  // every other test uses skills (key='metadata.version'), which takes a different branch.
  test('check (c) passes for an agent whose version lives in metadata.version', async () => {
    const agent = makeAgentComp('meta-agent', PLUGIN);

    await Bun.write(`${PLUGIN}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'test', version: '0.1.0' }, null, 2) + '\n');
    await Bun.write(agent.absPath, `---\nname: meta-agent\nmetadata:\n  version: 0.1.0\n---\n\nbody\n`);
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, { version: '0.1.0', date: '2026-05-30', added: ['initial'], changed: [], removed: [] });
    await commitAll(REPO, 'state v0.1.0');

    await Bun.write(agent.absPath, `---\nname: meta-agent\nmetadata:\n  version: 0.1.0\n---\n\nbody modified\n`);
    await commitAll(REPO, 'modify agent');

    const diffPaths = new Set([agent.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot([agent], PLUGIN, REPO, diffPaths);
    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components: [agent], diffPaths });
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, { version: '0.2.0', date: '2026-05-30', added: [], changed: ['meta-agent'], removed: [] });

    const result = await verify({ pluginRoot: PLUGIN, expectedVersion: '0.2.0', components: [agent], diffPaths, preRunSnapshot });

    expect(result.ok).toBe(true);
    expect(result.failures.find(f => f.check === 'c')).toBeUndefined();
  });

  test('check (d) no false-positive for untouched agent carrying both fields at HEAD', async () => {
    const skill = makeSkillComp('skill-a', PLUGIN);
    const agent = makeAgentComp('both-agent', PLUGIN);
    const components = [skill, agent];

    await Bun.write(`${PLUGIN}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'test', version: '0.1.0' }, null, 2) + '\n');
    await Bun.write(skill.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n\nbody\n`);
    // Corrupted-state agent (both fields) committed at HEAD — must NOT trip check (d).
    await Bun.write(agent.absPath, `---\nname: both-agent\nmetadata:\n  version: 0.1.0\nversion: 0.1.0\n---\n\nbody\n`);
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, { version: '0.1.0', date: '2026-05-30', added: ['initial'], changed: [], removed: [] });
    await commitAll(REPO, 'state v0.1.0');

    // Only the skill is modified; the agent stays untouched and out of the diff.
    await Bun.write(skill.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n\nbody modified\n`);
    await commitAll(REPO, 'modify skill');

    const diffPaths = new Set([skill.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot(components, PLUGIN, REPO, diffPaths);
    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components, diffPaths });
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, { version: '0.2.0', date: '2026-05-30', added: [], changed: ['skill-a'], removed: [] });

    const result = await verify({ pluginRoot: PLUGIN, expectedVersion: '0.2.0', components, diffPaths, preRunSnapshot });

    expect(result.ok).toBe(true);
    expect(result.failures.find(f => f.check === 'd')).toBeUndefined();
  });
});
