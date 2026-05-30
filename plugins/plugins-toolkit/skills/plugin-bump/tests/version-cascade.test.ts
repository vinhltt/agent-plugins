// New test: version-cascade — tests for scripts/version-cascade.ts

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { cascadeVersion } from '../scripts/version-cascade';
import type { DiscoveredComponent } from '../scripts/lib/component-discovery';

let TMP: string;

beforeEach(async () => {
  const proc = Bun.spawn(['mktemp', '-d'], { stdout: 'pipe' });
  await proc.exited;
  TMP = (await new Response(proc.stdout).text()).trim();
  // Every cascade test needs a .claude-plugin/plugin.json
  await Bun.write(`${TMP}/.claude-plugin/plugin.json`, JSON.stringify({ name: 'test-plugin', version: '0.1.0' }, null, 2) + '\n');
});

afterEach(async () => {
  await Bun.spawn(['rm', '-rf', TMP]).exited;
});

function makeSkillComponent(name: string, pluginRoot: string): DiscoveredComponent {
  return {
    kind: 'skill',
    pluginRelPath: `skills/${name}/SKILL.md`,
    absPath: `${pluginRoot}/skills/${name}/SKILL.md`,
    versionTarget: { fmt: 'yaml-frontmatter', key: 'metadata.version' },
  };
}

function makeAgentComponent(name: string, pluginRoot: string): DiscoveredComponent {
  return {
    kind: 'agent',
    pluginRelPath: `agents/${name}.md`,
    absPath: `${pluginRoot}/agents/${name}.md`,
    versionTarget: { fmt: 'yaml-frontmatter', key: 'version' },
  };
}

function makeCommandComponent(name: string, pluginRoot: string): DiscoveredComponent {
  return {
    kind: 'command',
    pluginRelPath: `commands/${name}.md`,
    absPath: `${pluginRoot}/commands/${name}.md`,
    versionTarget: { fmt: 'yaml-frontmatter', key: 'version' },
  };
}

function makeHookComponent(name: string, pluginRoot: string): DiscoveredComponent {
  return {
    kind: 'hook',
    pluginRelPath: `hooks/${name}.json`,
    absPath: `${pluginRoot}/hooks/${name}.json`,
    versionTarget: { fmt: 'json-field', key: 'version' },
  };
}

describe('cascadeVersion', () => {
  test('skill in diff → SKILL.md metadata.version updated', async () => {
    const skillComp = makeSkillComponent('my-skill', TMP);
    await Bun.write(skillComp.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n\nbody\n`);

    const result = await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.2.0',
      components: [skillComp],
      diffPaths: new Set([skillComp.pluginRelPath]),
    });

    expect(result.pluginJsonUpdated).toBe(true);
    expect(result.componentsUpdated).toHaveLength(1);
    expect(result.componentsSkipped).toHaveLength(0);

    const text = await Bun.file(skillComp.absPath).text();
    expect(text).toContain('version: 0.2.0');
    expect(text).toContain('body');
  });

  test('skill NOT in diff → byte-identical', async () => {
    const skillComp = makeSkillComponent('stable-skill', TMP);
    const original = `---\nmetadata:\n  version: 0.1.0\n---\n\nbody\n`;
    await Bun.write(skillComp.absPath, original);

    await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.2.0',
      components: [skillComp],
      diffPaths: new Set(), // not in diff
    });

    const after = await Bun.file(skillComp.absPath).text();
    expect(after).toBe(original);
  });

  test('command without frontmatter → frontmatter block prepended, version set', async () => {
    const cmdComp = makeCommandComponent('my-cmd', TMP);
    await Bun.write(cmdComp.absPath, `# My Command\n\nDoes things.\n`);

    await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.3.0',
      components: [cmdComp],
      diffPaths: new Set([cmdComp.pluginRelPath]),
    });

    const text = await Bun.file(cmdComp.absPath).text();
    expect(text).toContain('---');
    expect(text).toContain('version: 0.3.0');
    expect(text).toContain('# My Command');
  });

  test('hook → version field appears first in JSON output', async () => {
    const hookComp = makeHookComponent('my-hook', TMP);
    await Bun.write(hookComp.absPath, JSON.stringify({ name: 'my-hook', enabled: true, version: '0.1.0' }, null, 2) + '\n');

    await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.5.0',
      components: [hookComp],
      diffPaths: new Set([hookComp.pluginRelPath]),
    });

    const text = await Bun.file(hookComp.absPath).text();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.version).toBe('0.5.0');
    // version must be first key
    expect(Object.keys(parsed)[0]).toBe('version');
  });

  test('plugin.json always updated regardless of diffPaths', async () => {
    const result = await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '1.0.0',
      components: [],
      diffPaths: new Set(), // empty diff
    });

    expect(result.pluginJsonUpdated).toBe(true);
    const pluginJson = JSON.parse(await Bun.file(`${TMP}/.claude-plugin/plugin.json`).text()) as Record<string, unknown>;
    expect(pluginJson.version).toBe('1.0.0');
  });

  test('agent with existing frontmatter → version updated in-place', async () => {
    const agentComp = makeAgentComponent('my-agent', TMP);
    await Bun.write(agentComp.absPath, `---\nname: my-agent\nversion: 0.1.0\n---\n\nbody\n`);

    await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.2.0',
      components: [agentComp],
      diffPaths: new Set([agentComp.pluginRelPath]),
    });

    const text = await Bun.file(agentComp.absPath).text();
    expect(text).toContain('version: 0.2.0');
    expect(text).not.toContain('version: 0.1.0');
    expect(text).toContain('body');
  });

  test('agent with metadata.version only → metadata bumped, no top-level field added', async () => {
    const agentComp = makeAgentComponent('meta-agent', TMP);
    await Bun.write(agentComp.absPath, `---\nname: meta-agent\nmetadata:\n  version: 0.1.0\n---\n\nbody\n`);

    await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.2.0',
      components: [agentComp],
      diffPaths: new Set([agentComp.pluginRelPath]),
    });

    const text = await Bun.file(agentComp.absPath).text();
    expect(text).toContain('  version: 0.2.0'); // nested bumped
    expect(text).not.toMatch(/^version:/m); // no top-level duplicate introduced
    expect(text).toContain('body');
  });

  test('agent with BOTH fields → metadata bumped, top-level removed', async () => {
    const agentComp = makeAgentComponent('dup-agent', TMP);
    // The corrupted state the old writer produced: stale metadata + fresh top-level.
    await Bun.write(agentComp.absPath, `---\nname: dup-agent\nmetadata:\n  version: 0.1.0\nversion: 0.1.5\n---\n\nbody\n`);

    await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.2.0',
      components: [agentComp],
      diffPaths: new Set([agentComp.pluginRelPath]),
    });

    const text = await Bun.file(agentComp.absPath).text();
    expect(text).toContain('  version: 0.2.0'); // metadata holds fresh version
    expect(text).not.toMatch(/^version:/m); // duplicate top-level line gone
    expect(text).not.toContain('0.1.5'); // stale top-level value gone
    expect(text.split('\n').filter(l => /version:/.test(l))).toHaveLength(1); // single field remains
    expect(text).toContain('body');
  });

  test('plugin with .claude-plugin + .codex-plugin -> both get version bumped', async () => {
    await Bun.write(`${TMP}/.codex-plugin/plugin.json`, JSON.stringify({ name: 'test-plugin', version: '0.1.0', interface: { type: 'chat' } }, null, 2) + '\n');

    const result = await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.2.0',
      components: [],
      diffPaths: new Set(),
    });

    expect(result.manifestsUpdated).toContain('claude');
    expect(result.manifestsUpdated).toContain('codex');

    const claudeJson = JSON.parse(await Bun.file(`${TMP}/.claude-plugin/plugin.json`).text());
    const codexJson = JSON.parse(await Bun.file(`${TMP}/.codex-plugin/plugin.json`).text());
    expect(claudeJson.version).toBe('0.2.0');
    expect(codexJson.version).toBe('0.2.0');
  });

  test('plugin with all 3 manifests -> all 3 get version bumped', async () => {
    await Bun.write(`${TMP}/.codex-plugin/plugin.json`, JSON.stringify({ name: 'test-plugin', version: '0.1.0' }, null, 2) + '\n');
    await Bun.write(`${TMP}/.cursor-plugin/plugin.json`, JSON.stringify({ name: 'test-plugin', version: '0.1.0' }, null, 2) + '\n');

    const result = await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.3.0',
      components: [],
      diffPaths: new Set(),
    });

    expect(result.manifestsUpdated).toEqual(['claude', 'codex', 'cursor']);

    for (const dir of ['.claude-plugin', '.codex-plugin', '.cursor-plugin']) {
      const json = JSON.parse(await Bun.file(`${TMP}/${dir}/plugin.json`).text());
      expect(json.version).toBe('0.3.0');
    }
  });

  test('extra fields in .codex-plugin/plugin.json preserved after bump', async () => {
    await Bun.write(`${TMP}/.codex-plugin/plugin.json`, JSON.stringify({
      name: 'test-plugin', version: '0.1.0', interface: { type: 'chat' }, keywords: ['test'],
    }, null, 2) + '\n');

    await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.2.0',
      components: [],
      diffPaths: new Set(),
    });

    const codexJson = JSON.parse(await Bun.file(`${TMP}/.codex-plugin/plugin.json`).text());
    expect(codexJson.version).toBe('0.2.0');
    expect(codexJson.interface).toEqual({ type: 'chat' });
    expect(codexJson.keywords).toEqual(['test']);
  });

  test('plugin with only .claude-plugin -> codex/cursor untouched (dirs dont exist)', async () => {
    const result = await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.2.0',
      components: [],
      diffPaths: new Set(),
    });

    expect(result.manifestsUpdated).toEqual(['claude']);
    expect(await Bun.file(`${TMP}/.codex-plugin/plugin.json`).exists()).toBe(false);
    expect(await Bun.file(`${TMP}/.cursor-plugin/plugin.json`).exists()).toBe(false);
  });

  test('componentsUpdated / componentsSkipped split correctly', async () => {
    const skillA = makeSkillComponent('skill-a', TMP);
    const skillB = makeSkillComponent('skill-b', TMP);
    await Bun.write(skillA.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n`);
    await Bun.write(skillB.absPath, `---\nmetadata:\n  version: 0.1.0\n---\n`);

    const result = await cascadeVersion({
      pluginRoot: TMP,
      newVersion: '0.2.0',
      components: [skillA, skillB],
      diffPaths: new Set([skillA.pluginRelPath]), // only A in diff
    });

    expect(result.componentsUpdated.map(c => c.pluginRelPath)).toEqual([skillA.pluginRelPath]);
    expect(result.componentsSkipped.map(c => c.pluginRelPath)).toEqual([skillB.pluginRelPath]);
  });
});
