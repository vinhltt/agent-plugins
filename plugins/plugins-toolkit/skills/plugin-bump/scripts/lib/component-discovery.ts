// Enumerates bumpable components inside a plugin folder and classifies each by type.
// Pure git ls-files scan + path classification. No version logic, no writes.

import { gitLsFiles, repoCwdOf, toRepoRelative, stripTargetPrefix } from './git-helpers';

export type ComponentKind = 'skill' | 'agent' | 'command' | 'hook';

export interface DiscoveredComponent {
  kind: ComponentKind;
  pluginRelPath: string; // e.g. "skills/foo/SKILL.md"
  absPath: string;
  versionTarget:
    | { fmt: 'yaml-frontmatter'; key: 'metadata.version' | 'version' }
    | { fmt: 'json-field'; key: 'version' };
}

// Classify a plugin-relative path to a component kind.
// Returns null for non-component paths (scripts, README, etc.).
function classifyPath(pluginRelPath: string): DiscoveredComponent['versionTarget'] & { kind: ComponentKind } | null {
  const parts = pluginRelPath.split('/');

  // skills/<name>/SKILL.md — exactly 3 segments, last must be SKILL.md
  if (parts.length === 3 && parts[0] === 'skills' && parts[2] === 'SKILL.md') {
    return { kind: 'skill', fmt: 'yaml-frontmatter', key: 'metadata.version' };
  }

  // agents/<name>.md — exactly 2 segments, ends with .md
  if (parts.length === 2 && parts[0] === 'agents' && parts[1]!.endsWith('.md')) {
    return { kind: 'agent', fmt: 'yaml-frontmatter', key: 'version' };
  }

  // commands/<name>.md — exactly 2 segments, ends with .md
  if (parts.length === 2 && parts[0] === 'commands' && parts[1]!.endsWith('.md')) {
    return { kind: 'command', fmt: 'yaml-frontmatter', key: 'version' };
  }

  // hooks/<name>.json — exactly 2 segments, ends with .json
  if (parts.length === 2 && parts[0] === 'hooks' && parts[1]!.endsWith('.json')) {
    return { kind: 'hook', fmt: 'json-field', key: 'version' };
  }

  return null;
}

export async function discoverComponents(pluginRoot: string): Promise<DiscoveredComponent[]> {
  const cwd = await repoCwdOf(pluginRoot);
  const repoRelPaths = await gitLsFiles(pluginRoot, cwd);
  const pluginPrefix = toRepoRelative(pluginRoot, cwd);

  const components: DiscoveredComponent[] = [];

  for (const repoRel of repoRelPaths) {
    const pluginRelPath = stripTargetPrefix(repoRel, pluginPrefix);
    if (!pluginRelPath) continue;

    const classification = classifyPath(pluginRelPath);
    if (!classification) continue;

    const { kind, fmt, key } = classification;
    components.push({
      kind,
      pluginRelPath,
      absPath: `${pluginRoot}/${pluginRelPath}`,
      versionTarget: { fmt, key } as DiscoveredComponent['versionTarget'],
    });
  }

  // Deterministic ordering for tests + verify consistency
  components.sort((a, b) => a.pluginRelPath.localeCompare(b.pluginRelPath));
  return components;
}
