// Core version cascade: writes newVersion to plugin.json + only components in diffPaths.
// Components NOT in diffPaths are left byte-identical. Atomic writes via temp+rename.

import { writeFrontmatterVersion } from './lib/frontmatter';
import type { DiscoveredComponent } from './lib/component-discovery';

export interface CascadeInput {
  pluginRoot: string;
  newVersion: string; // semver, no "v" prefix
  components: DiscoveredComponent[];
  diffPaths: Set<string>; // plugin-relative paths from collect-diff-data
}

export interface CascadeResult {
  pluginJsonUpdated: true;
  componentsUpdated: DiscoveredComponent[];
  componentsSkipped: DiscoveredComponent[];
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await Bun.write(tmp, content);
  const mv = Bun.spawn(['mv', tmp, path], { stderr: 'pipe' });
  if ((await mv.exited) !== 0) {
    const err = await new Response(mv.stderr).text();
    throw new Error(`atomic write failed for ${path}: ${err.trim()}`);
  }
}

async function writePluginJson(pluginRoot: string, newVersion: string): Promise<void> {
  const path = `${pluginRoot}/.claude-plugin/plugin.json`;
  const raw = await Bun.file(path).text();
  const parsed = JSON.parse(raw);
  parsed.version = newVersion;
  await atomicWrite(path, JSON.stringify(parsed, null, 2) + '\n');
}

// Handles top-level `version:` field in agent/command frontmatter (NOT metadata.version).
async function writeAgentOrCommandVersion(absPath: string, newVersion: string): Promise<void> {
  const raw = await Bun.file(absPath).text();
  const lines = raw.split('\n');

  if (lines[0]?.trim() !== '---') {
    // No frontmatter — prepend block for commands; agents should always have frontmatter
    const block = `---\nversion: ${newVersion}\n---\n\n`;
    await atomicWrite(absPath, block + raw);
    return;
  }

  // Find frontmatter end
  let fmEnd = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') { fmEnd = i; break; }
  }
  if (fmEnd === -1) throw new Error(`Unterminated frontmatter in ${absPath}`);

  // Patch existing `version:` or insert before closing `---`
  let patched = false;
  const out = lines.map((line, i) => {
    if (i > 0 && i < fmEnd && /^version:\s*/.test(line)) {
      patched = true;
      return `version: ${newVersion}`;
    }
    return line;
  });

  if (!patched) {
    // Insert `version: <v>` before closing ---
    out.splice(fmEnd, 0, `version: ${newVersion}`);
  }

  await atomicWrite(absPath, out.join('\n'));
}

async function writeHookVersion(absPath: string, newVersion: string): Promise<void> {
  const raw = await Bun.file(absPath).text();
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // Place version first, then remaining keys (readability + schema awareness)
  const reordered: Record<string, unknown> = { version: newVersion };
  for (const [k, v] of Object.entries(parsed)) {
    if (k !== 'version') reordered[k] = v;
  }
  await atomicWrite(absPath, JSON.stringify(reordered, null, 2) + '\n');
}

export async function cascadeVersion(input: CascadeInput): Promise<CascadeResult> {
  const { pluginRoot, newVersion, components, diffPaths } = input;

  // plugin.json is always bumped
  await writePluginJson(pluginRoot, newVersion);

  const componentsUpdated: DiscoveredComponent[] = [];
  const componentsSkipped: DiscoveredComponent[] = [];

  for (const comp of components) {
    if (!diffPaths.has(comp.pluginRelPath)) {
      componentsSkipped.push(comp);
      continue;
    }

    switch (comp.kind) {
      case 'skill':
        // Uses ported frontmatter writer (metadata.version block-style)
        await writeFrontmatterVersion(comp.absPath, newVersion);
        break;
      case 'agent':
      case 'command':
        await writeAgentOrCommandVersion(comp.absPath, newVersion);
        break;
      case 'hook':
        await writeHookVersion(comp.absPath, newVersion);
        break;
    }
    componentsUpdated.push(comp);
  }

  return { pluginJsonUpdated: true, componentsUpdated, componentsSkipped };
}
