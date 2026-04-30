// Check 3: Per plugin, plugins/<name>/.claude-plugin/plugin.json.version
// matches manifest.plugins[name].version.

import type { CheckOpts, CheckResult } from "./types";
import { MANIFEST_JSON, readJson, resolvePluginJson } from "./fs-helpers";

interface PluginJson { name?: string; version?: string }
interface ManifestShape {
  plugins?: Record<string, { version?: string }>;
}

export function checkPluginVersions(opts: CheckOpts): CheckResult[] {
  const index = 3;
  const name = "plugin.json vs manifest";

  if (opts.plugins.length === 0) {
    return [{ ok: true, index, name }];
  }

  const manifest = readJson<ManifestShape>(MANIFEST_JSON(opts.root));
  const out: CheckResult[] = [];

  for (const plugin of opts.plugins) {
    const pjPath = resolvePluginJson(opts.root, plugin);
    if (!pjPath) {
      out.push({
        ok: false, index, name: `${name} [${plugin}]`,
        expected: "(plugin.json present)",
        actual: "not found",
        fixHint: `plugin.json missing for "${plugin}" — check plugins/${plugin}/.claude-plugin/`,
      });
      continue;
    }

    let pj: PluginJson;
    try {
      pj = readJson<PluginJson>(pjPath);
    } catch (e) {
      out.push({
        ok: false, index, name: `${name} [${plugin}]`,
        expected: "(valid JSON)",
        actual: `parse error: ${(e as Error).message}`,
        fixHint: `fix JSON syntax in ${pjPath}`,
        path: pjPath,
      });
      continue;
    }

    const manifestVersion = manifest.plugins?.[plugin]?.version ?? "(missing)";
    const pluginVersion = pj.version ?? "(missing)";

    if (pluginVersion === manifestVersion) {
      out.push({ ok: true, index, name: `${name} [${plugin}]`, path: pjPath });
    } else {
      out.push({
        ok: false, index, name: `${name} [${plugin}]`,
        expected: manifestVersion,
        actual: pluginVersion,
        fixHint: `sync versions: manifest.plugins.${plugin}.version=${manifestVersion} vs ${pjPath}.version=${pluginVersion}`,
        path: pjPath,
      });
    }
  }

  return out;
}
