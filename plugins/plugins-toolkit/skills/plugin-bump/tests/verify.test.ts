// New test: verify — tests for scripts/verify.ts
// Uses real git repos so captureHeadSnapshot (gitShowHead) works correctly.

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { verify, captureHeadSnapshot } from '../scripts/verify';
import { cascadeVersion } from '../scripts/version-cascade';
import { computeManifest } from '../scripts/manifest';
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

// Writes a full valid plugin state at version v and commits it.
// Returns the list of component relative paths tracked.
async function writeAndCommitPlugin(
  pluginRoot: string,
  repo: string,
  version: string,
  components: DiscoveredComponent[],
): Promise<string[]> {
  // plugin.json
  await Bun.write(`${pluginRoot}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'test', version }, null, 2) + '\n');
  // component files
  for (const comp of components) {
    await Bun.write(comp.absPath, `---\nmetadata:\n  version: ${version}\n---\n\nbody\n`);
  }
  // manifest
  const relPaths = components.map(c => c.pluginRelPath);
  const manifest = await computeManifest(pluginRoot, relPaths, version);
  await Bun.write(`${pluginRoot}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  // changelog
  await appendEntry(`${pluginRoot}/CHANGELOG.md`, {
    version, date: '2026-05-09',
    added: ['initial'], changed: [], removed: [],
  });
  await commitAll(repo, `state v${version}`);
  return relPaths;
}

beforeEach(async () => {
  REPO = await makeRepo();
  PLUGIN = `${REPO}/my-plugin`;
});

afterEach(async () => {
  await Bun.spawn(['rm', '-rf', REPO]).exited;
});

describe('verify', () => {
  test('happy path (all 5 checks pass) → ok=true', async () => {
    const skillA = makeSkillComp('skill-a', PLUGIN);
    const skillB = makeSkillComp('skill-b', PLUGIN);
    const components = [skillA, skillB];

    // Write initial state at 0.1.0
    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', components);

    // Modify skillA (it's in the diff)
    await Bun.write(skillA.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n\nbody modified\n`);
    await commitAll(REPO, 'modify skill-a');

    const diffPaths = new Set([skillA.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot(components, PLUGIN, REPO, diffPaths);

    // Now cascade to 0.2.0
    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components, diffPaths });

    // Rewrite manifest + changelog for 0.2.0
    const relPaths = components.map(c => c.pluginRelPath);
    const manifest = await computeManifest(PLUGIN, relPaths, '0.2.0');
    await Bun.write(`${PLUGIN}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-09',
      added: [], changed: ['skill-a'], removed: [],
    });

    const result = await verify({
      pluginRoot: PLUGIN, cwd: REPO,
      expectedVersion: '0.2.0',
      components, diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  test('corrupt plugin.json version → check (b) fails', async () => {
    const comp = makeSkillComp('skill-a', PLUGIN);
    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', [comp]);

    const diffPaths = new Set([comp.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot([comp], PLUGIN, REPO, diffPaths);

    // Cascade + rebuild manifest + changelog for 0.2.0
    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components: [comp], diffPaths });
    const manifest = await computeManifest(PLUGIN, [comp.pluginRelPath], '0.2.0');
    await Bun.write(`${PLUGIN}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-09',
      added: [], changed: ['skill-a'], removed: [],
    });

    // Corrupt plugin.json version
    await Bun.write(`${PLUGIN}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'test', version: '9.9.9' }, null, 2) + '\n');

    const result = await verify({
      pluginRoot: PLUGIN, cwd: REPO,
      expectedVersion: '0.2.0',
      components: [comp], diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(false);
    const bFail = result.failures.find(f => f.check === 'b');
    expect(bFail).toBeDefined();
  });

  test('CHANGELOG.md wrong top version → check (c) fails', async () => {
    const comp = makeSkillComp('skill-a', PLUGIN);
    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', [comp]);

    const diffPaths = new Set([comp.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot([comp], PLUGIN, REPO, diffPaths);

    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components: [comp], diffPaths });
    const manifest = await computeManifest(PLUGIN, [comp.pluginRelPath], '0.2.0');
    await Bun.write(`${PLUGIN}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');

    // Write changelog with wrong top version
    await Bun.write(`${PLUGIN}/CHANGELOG.md`, `# Changelog\n\n## [9.9.9] - 2026-05-09\n\n### Changed\n- skill-a\n`);

    const result = await verify({
      pluginRoot: PLUGIN, cwd: REPO,
      expectedVersion: '0.2.0',
      components: [comp], diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(false);
    const cFail = result.failures.find(f => f.check === 'c');
    expect(cFail).toBeDefined();
  });

  test('component in diff has wrong version on disk → check (d) fails', async () => {
    const comp = makeSkillComp('skill-a', PLUGIN);
    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', [comp]);

    const diffPaths = new Set([comp.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot([comp], PLUGIN, REPO, diffPaths);

    // Cascade
    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components: [comp], diffPaths });
    const manifest = await computeManifest(PLUGIN, [comp.pluginRelPath], '0.2.0');
    await Bun.write(`${PLUGIN}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-09',
      added: [], changed: ['skill-a'], removed: [],
    });

    // Overwrite the component file back to old version (simulating partial write failure)
    await Bun.write(comp.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n\nbody\n`);

    const result = await verify({
      pluginRoot: PLUGIN, cwd: REPO,
      expectedVersion: '0.2.0',
      components: [comp], diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(false);
    const dFail = result.failures.find(f => f.check === 'd');
    expect(dFail).toBeDefined();
  });

  test('component NOT in diff has version changed → check (e) fails', async () => {
    const skillA = makeSkillComp('skill-a', PLUGIN);
    const skillB = makeSkillComp('skill-b', PLUGIN);
    const components = [skillA, skillB];

    await writeAndCommitPlugin(PLUGIN, REPO, '0.1.0', components);

    // Only skillA is in diff
    const diffPaths = new Set([skillA.pluginRelPath]);
    const preRunSnapshot = await captureHeadSnapshot(components, PLUGIN, REPO, diffPaths);

    await cascadeVersion({ pluginRoot: PLUGIN, newVersion: '0.2.0', components, diffPaths });
    const manifest = await computeManifest(PLUGIN, components.map(c => c.pluginRelPath), '0.2.0');
    await Bun.write(`${PLUGIN}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
    await appendEntry(`${PLUGIN}/CHANGELOG.md`, {
      version: '0.2.0', date: '2026-05-09',
      added: [], changed: ['skill-a'], removed: [],
    });

    // skillB was NOT in diff but its version was changed — simulates accidental mutation
    await Bun.write(skillB.absPath, `---\nmetadata:\n  version: 0.2.0\n---\n\nbody\n`);

    const result = await verify({
      pluginRoot: PLUGIN, cwd: REPO,
      expectedVersion: '0.2.0',
      components, diffPaths, preRunSnapshot,
    });

    expect(result.ok).toBe(false);
    const eFail = result.failures.find(f => f.check === 'e');
    expect(eFail).toBeDefined();
  });
});
