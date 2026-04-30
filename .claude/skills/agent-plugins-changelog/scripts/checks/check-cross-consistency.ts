// Check 5: cross-consistency — orphan drift between manifest, plugin.json,
// SKILL.md / agent.md frontmatter for the requested entity set.

import { existsSync } from "node:fs";
import type { CheckOpts, CheckResult } from "./types";
import {
  MANIFEST_JSON,
  readJson,
  resolvePluginJson,
  findSkillPlugin,
  findAgentPlugin,
  TOP_SKILL_MD,
  TOP_AGENT_MD,
  PLUGIN_SKILL_MD,
  PLUGIN_AGENT_MD,
} from "./fs-helpers";

interface ManifestShape {
  plugins?: Record<string, {
    version?: string;
    components?: {
      skills?: Record<string, unknown>;
      agents?: Record<string, unknown>;
    };
  }>;
  components?: {
    skills?: Record<string, unknown>;
    agents?: Record<string, unknown>;
  };
}

export function checkCrossConsistency(opts: CheckOpts): CheckResult[] {
  const index = 5;
  const baseName = "cross-consistency";
  const out: CheckResult[] = [];

  const manifest = readJson<ManifestShape>(MANIFEST_JSON(opts.root));

  for (const plugin of opts.plugins) {
    const inManifest = !!manifest.plugins?.[plugin];
    const pjPath = resolvePluginJson(opts.root, plugin);
    if (!inManifest && !pjPath) {
      out.push({
        ok: false, index, name: `${baseName} [${plugin}]`,
        expected: "manifest entry + plugin.json",
        actual: "missing in both",
        fixHint: `plugin "${plugin}" does not exist — verify name`,
      });
    } else if (!inManifest) {
      out.push({
        ok: false, index, name: `${baseName} [${plugin}]`,
        expected: "manifest entry",
        actual: "only plugin.json exists",
        fixHint: `re-run \`bun manifest.ts compute --write\``,
      });
    } else if (!pjPath) {
      out.push({
        ok: false, index, name: `${baseName} [${plugin}]`,
        expected: "plugin.json present",
        actual: "only manifest entry",
        fixHint: `create plugins/${plugin}/.claude-plugin/plugin.json or remove stale manifest entry`,
      });
    }
  }

  for (const skill of opts.skills) {
    const owner = findSkillPlugin(opts.root, skill);
    const path = owner ? PLUGIN_SKILL_MD(opts.root, owner, skill) : TOP_SKILL_MD(opts.root, skill);
    const inManifest = owner
      ? !!manifest.plugins?.[owner]?.components?.skills?.[skill]
      : !!manifest.components?.skills?.[skill];

    if (!existsSync(path) && !inManifest) {
      out.push({
        ok: false, index, name: `${baseName} [skill ${skill}]`,
        expected: "manifest + SKILL.md",
        actual: "missing in both",
        fixHint: `verify skill name "${skill}"`,
      });
    } else if (!existsSync(path)) {
      out.push({
        ok: false, index, name: `${baseName} [skill ${skill}]`,
        expected: "SKILL.md present",
        actual: "only manifest entry",
        fixHint: `create ${path} or remove stale manifest entry`,
        path,
      });
    } else if (!inManifest) {
      out.push({
        ok: false, index, name: `${baseName} [skill ${skill}]`,
        expected: "manifest entry",
        actual: "only SKILL.md exists",
        fixHint: `re-run \`bun manifest.ts compute --write\``,
        path,
      });
    }
  }

  for (const agent of opts.agents) {
    const owner = findAgentPlugin(opts.root, agent);
    const path = owner ? PLUGIN_AGENT_MD(opts.root, owner, agent) : TOP_AGENT_MD(opts.root, agent);
    const inManifest = owner
      ? !!manifest.plugins?.[owner]?.components?.agents?.[agent]
      : !!manifest.components?.agents?.[agent];

    if (!existsSync(path) && !inManifest) {
      out.push({
        ok: false, index, name: `${baseName} [agent ${agent}]`,
        expected: "manifest + agent.md",
        actual: "missing in both",
        fixHint: `verify agent name "${agent}"`,
      });
    } else if (!existsSync(path)) {
      out.push({
        ok: false, index, name: `${baseName} [agent ${agent}]`,
        expected: "agent.md present",
        actual: "only manifest entry",
        fixHint: `create ${path} or remove stale manifest entry`,
        path,
      });
    } else if (!inManifest) {
      out.push({
        ok: false, index, name: `${baseName} [agent ${agent}]`,
        expected: "manifest entry",
        actual: "only agent.md exists",
        fixHint: `re-run \`bun manifest.ts compute --write\``,
        path,
      });
    }
  }

  if (out.length === 0) return [{ ok: true, index, name: baseName }];
  return out;
}
