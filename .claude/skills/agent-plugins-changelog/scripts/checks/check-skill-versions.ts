// Check 4: Per skill/agent, frontmatter version matches manifest entry.
// Top-level components → manifest.components.{skills,agents}[name].version.
// Plugin-scoped components → manifest.plugins[plugin].components.{skills,agents}[name].version.

import { existsSync, readFileSync } from "node:fs";
import type { CheckOpts, CheckResult } from "./types";
import {
  MANIFEST_JSON,
  readJson,
  TOP_SKILL_MD,
  TOP_AGENT_MD,
  PLUGIN_SKILL_MD,
  PLUGIN_AGENT_MD,
  findSkillPlugin,
  findAgentPlugin,
} from "./fs-helpers";
import { parseFrontmatter } from "../manifest";

interface ManifestShape {
  plugins?: Record<string, {
    components?: {
      skills?: Record<string, { version?: string }>;
      agents?: Record<string, { version?: string }>;
    };
  }>;
  components?: {
    skills?: Record<string, { version?: string }>;
    agents?: Record<string, { version?: string }>;
  };
}

function readSkillVersion(absPath: string): string | null {
  const fm = parseFrontmatter(readFileSync(absPath, "utf-8"));
  if (!fm) return null;
  const meta = fm.metadata as Record<string, unknown> | undefined;
  return (meta?.version as string | undefined) ?? (fm.version as string | undefined) ?? null;
}

function readAgentVersion(absPath: string): string | null {
  const fm = parseFrontmatter(readFileSync(absPath, "utf-8"));
  return (fm?.version as string | undefined) ?? null;
}

export function checkSkillVersions(opts: CheckOpts): CheckResult[] {
  const index = 4;
  const baseName = "frontmatter vs manifest";

  if (opts.skills.length === 0 && opts.agents.length === 0) {
    return [{ ok: true, index, name: baseName }];
  }

  const manifest = readJson<ManifestShape>(MANIFEST_JSON(opts.root));
  const out: CheckResult[] = [];

  // Skills
  for (const skill of opts.skills) {
    const owningPlugin = findSkillPlugin(opts.root, skill);
    const path = owningPlugin
      ? PLUGIN_SKILL_MD(opts.root, owningPlugin, skill)
      : TOP_SKILL_MD(opts.root, skill);
    const label = owningPlugin ? `${baseName} [skill ${owningPlugin}/${skill}]` : `${baseName} [skill ${skill}]`;

    if (!existsSync(path)) {
      out.push({
        ok: false, index, name: label,
        expected: "(SKILL.md present)",
        actual: "missing",
        fixHint: `create ${path}`,
        path,
      });
      continue;
    }

    let fmVersion: string | null;
    try { fmVersion = readSkillVersion(path); }
    catch (e) {
      out.push({
        ok: false, index, name: label,
        expected: "(parseable YAML frontmatter)",
        actual: `parse error: ${(e as Error).message}`,
        fixHint: `fix frontmatter YAML in ${path}`,
        path,
      });
      continue;
    }

    const expected = owningPlugin
      ? manifest.plugins?.[owningPlugin]?.components?.skills?.[skill]?.version
      : manifest.components?.skills?.[skill]?.version;
    const expectedStr = expected ?? "(missing)";
    const actualStr = fmVersion ?? "(no version in frontmatter)";

    if (actualStr === expectedStr) {
      out.push({ ok: true, index, name: label, path });
    } else {
      out.push({
        ok: false, index, name: label,
        expected: expectedStr, actual: actualStr,
        fixHint: `sync version in ${path} to match manifest entry (${expectedStr})`,
        path,
      });
    }
  }

  // Agents
  for (const agent of opts.agents) {
    const owningPlugin = findAgentPlugin(opts.root, agent);
    const path = owningPlugin
      ? PLUGIN_AGENT_MD(opts.root, owningPlugin, agent)
      : TOP_AGENT_MD(opts.root, agent);
    const label = owningPlugin ? `${baseName} [agent ${owningPlugin}/${agent}]` : `${baseName} [agent ${agent}]`;

    if (!existsSync(path)) {
      out.push({
        ok: false, index, name: label,
        expected: "(agent .md present)",
        actual: "missing",
        fixHint: `create ${path}`,
        path,
      });
      continue;
    }

    let fmVersion: string | null;
    try { fmVersion = readAgentVersion(path); }
    catch (e) {
      out.push({
        ok: false, index, name: label,
        expected: "(parseable YAML frontmatter)",
        actual: `parse error: ${(e as Error).message}`,
        fixHint: `fix frontmatter YAML in ${path}`,
        path,
      });
      continue;
    }

    const expected = owningPlugin
      ? manifest.plugins?.[owningPlugin]?.components?.agents?.[agent]?.version
      : manifest.components?.agents?.[agent]?.version;
    const expectedStr = expected ?? "(missing)";
    const actualStr = fmVersion ?? "(no version in frontmatter)";

    if (actualStr === expectedStr) {
      out.push({ ok: true, index, name: label, path });
    } else {
      out.push({
        ok: false, index, name: label,
        expected: expectedStr, actual: actualStr,
        fixHint: `sync version in ${path} to match manifest entry (${expectedStr})`,
        path,
      });
    }
  }

  return out;
}
