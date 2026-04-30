// Shared filesystem helpers for verify checks.
// Adapted for agent-plugins top-level layout:
//   <root>/.claude-plugin/marketplace.json
//   <root>/CHANGELOG.md
//   <root>/manifest.json
//   <root>/plugins/<name>/.claude-plugin/plugin.json
//   <root>/plugins/<name>/skills/<skill>/SKILL.md
//   <root>/skills/<name>/SKILL.md          (top-level)
//   <root>/agents/<name>.md                (top-level)

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const MARKETPLACE_JSON = (root: string) => join(root, ".claude-plugin", "marketplace.json");
export const CHANGELOG_MD    = (root: string) => join(root, "CHANGELOG.md");
export const MANIFEST_JSON   = (root: string) => join(root, "manifest.json");
export const PLUGIN_DIR      = (root: string, plugin: string) => join(root, "plugins", plugin);

export const TOP_SKILL_MD = (root: string, skill: string) =>
  join(root, "skills", skill, "SKILL.md");
export const TOP_AGENT_MD = (root: string, agent: string) =>
  join(root, "agents", `${agent}.md`);

/** Resolve plugins/<plugin>/.claude-plugin/plugin.json. Returns null if absent. */
export function resolvePluginJson(root: string, plugin: string): string | null {
  const p = join(PLUGIN_DIR(root, plugin), ".claude-plugin", "plugin.json");
  return existsSync(p) ? p : null;
}

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/** Find which plugin contains a skill (returns plugin name) — top-level scope returns null. */
export function findSkillPlugin(root: string, skill: string): string | null {
  const pluginsDir = join(root, "plugins");
  if (!existsSync(pluginsDir)) return null;
  for (const entry of readdirSync(pluginsDir)) {
    const skillDir = join(pluginsDir, entry, "skills", skill);
    if (existsSync(skillDir) && statSync(skillDir).isDirectory()) return entry;
  }
  return null;
}

/** Find which plugin contains an agent — top-level scope returns null. */
export function findAgentPlugin(root: string, agent: string): string | null {
  const pluginsDir = join(root, "plugins");
  if (!existsSync(pluginsDir)) return null;
  for (const entry of readdirSync(pluginsDir)) {
    const agentMd = join(pluginsDir, entry, "agents", `${agent}.md`);
    if (existsSync(agentMd) && statSync(agentMd).isFile()) return entry;
  }
  return null;
}

export function PLUGIN_SKILL_MD(root: string, plugin: string, skill: string): string {
  return join(PLUGIN_DIR(root, plugin), "skills", skill, "SKILL.md");
}

export function PLUGIN_AGENT_MD(root: string, plugin: string, agent: string): string {
  return join(PLUGIN_DIR(root, plugin), "agents", `${agent}.md`);
}
