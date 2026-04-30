// E2E synthetic-diff validation for verify.ts. Each scenario:
//   1. Build a temp repo with baseline + scenario-specific files.
//   2. Compute + write manifest.
//   3. Author CHANGELOG section.
//   4. Run verify.ts (as a child process to exercise the full CLI exit code).
//   5. Assert exit 0.
//
// Critical: no mocks. Real filesystem, real scripts.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { inferAffected } from "../verify";
import { buildManifest } from "../manifest";

const SCRIPTS_DIR = resolve(__dirname, "..");
const VERIFY_SCRIPT = join(SCRIPTS_DIR, "verify.ts");

interface RepoOpts {
  marketplaceVersion: string;
  changelogVersion: string;
  changelogBody?: string;
  files?: Record<string, string>;       // path → content
  pluginJsons?: Record<string, string>; // plugin name → version
  topSkills?: Record<string, string>;   // skill name → version
  topAgents?: Record<string, string>;   // agent name → version
}

function makeRepo(opts: RepoOpts): string {
  const root = mkdtempSync(join(tmpdir(), "ap-verify-"));
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(root, ".claude-plugin/marketplace.json"),
    JSON.stringify({ name: "test", metadata: { version: opts.marketplaceVersion } }, null, 2),
  );
  writeFileSync(join(root, "LICENSE"), "MIT\n");
  writeFileSync(
    join(root, ".agent-plugins.json"),
    JSON.stringify({ version: "1.0", name: "test", changelog: { exclude: [] } }),
  );

  const cl = `# Changelog\n\n## [${opts.changelogVersion}] - 2026-04-30\n\n${opts.changelogBody ?? "### Added\n- baseline\n"}\n`;
  writeFileSync(join(root, "CHANGELOG.md"), cl);

  for (const [path, content] of Object.entries(opts.files ?? {})) {
    const abs = join(root, path);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }

  for (const [name, version] of Object.entries(opts.pluginJsons ?? {})) {
    const dir = join(root, "plugins", name, ".claude-plugin");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "plugin.json"), JSON.stringify({ name, version }));
  }
  for (const [name, version] of Object.entries(opts.topSkills ?? {})) {
    const dir = join(root, "skills", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "SKILL.md"),
      `---\nname: ${name}\nmetadata:\n  version: ${version}\n---\nbody\n`,
    );
  }
  for (const [name, version] of Object.entries(opts.topAgents ?? {})) {
    const dir = join(root, "agents");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${name}.md`),
      `---\nname: ${name}\nversion: ${version}\n---\nbody\n`,
    );
  }

  // Compute + write manifest using the real builder.
  const m = buildManifest(root);
  writeFileSync(join(root, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  return root;
}

function runVerify(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync("bun", [VERIFY_SCRIPT, ...args], { encoding: "utf-8" });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

describe("inferAffected", () => {
  test("plugin path → plugins bucket", () => {
    const r = inferAffected(["plugins/foo/SKILL.md", "plugins/foo/agents/bot.md"]);
    expect(r.plugins).toEqual(["foo"]);
  });

  test("top-level skill → skills bucket", () => {
    const r = inferAffected(["skills/bar/SKILL.md"]);
    expect(r.skills).toEqual(["bar"]);
    expect(r.plugins).toEqual([]);
  });

  test("top-level agent → agents bucket", () => {
    const r = inferAffected(["agents/baz.md"]);
    expect(r.agents).toEqual(["baz"]);
  });

  test("hook + command", () => {
    const r = inferAffected(["hooks/pre.json", "commands/release.md"]);
    expect(r.hooks).toEqual(["pre"]);
    expect(r.commands).toEqual(["release"]);
  });
});

describe("Scenario A: add plugin (minor bump)", () => {
  test("verify exits 0 with --plugins=foo at 0.2.0", () => {
    const root = makeRepo({
      marketplaceVersion: "0.2.0",
      changelogVersion: "0.2.0",
      changelogBody: "### Added\n- foo: new plugin\n",
      pluginJsons: { foo: "0.2.0" },
    });
    try {
      const { code, stdout, stderr } = runVerify([
        "--expected-version=0.2.0",
        "--plugins=foo",
        `--root=${root}`,
      ]);
      expect(stdout + stderr).toContain("ALL CHECKS PASSED");
      expect(code).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Scenario B: change skill (patch bump)", () => {
  test("verify exits 0 with --skills=bar at 0.1.1", () => {
    const root = makeRepo({
      marketplaceVersion: "0.1.1",
      changelogVersion: "0.1.1",
      changelogBody: "### Changed\n- Skills/bar: tweak\n",
      topSkills: { bar: "0.1.1" },
    });
    try {
      const { code, stdout, stderr } = runVerify([
        "--expected-version=0.1.1",
        "--skills=bar",
        `--root=${root}`,
      ]);
      expect(stdout + stderr).toContain("ALL CHECKS PASSED");
      expect(code).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Scenario C: agent present (major-context)", () => {
  test("verify exits 0 with --agents=baz at 1.0.0", () => {
    const root = makeRepo({
      marketplaceVersion: "1.0.0",
      changelogVersion: "1.0.0",
      changelogBody: "### Removed\n- Agents/old\n\n### Added\n- Agents/baz\n",
      topAgents: { baz: "1.0.0" },
    });
    try {
      const { code, stdout, stderr } = runVerify([
        "--expected-version=1.0.0",
        "--agents=baz",
        `--root=${root}`,
      ]);
      expect(stdout + stderr).toContain("ALL CHECKS PASSED");
      expect(code).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Scenario D: marketplace-only bump", () => {
  test("verify exits 0 at 0.1.1 with no affected components", () => {
    const root = makeRepo({
      marketplaceVersion: "0.1.1",
      changelogVersion: "0.1.1",
      changelogBody: "### Changed\n- Marketplace: description tweak\n",
    });
    try {
      const { code, stdout, stderr } = runVerify([
        "--expected-version=0.1.1",
        `--root=${root}`,
      ]);
      expect(stdout + stderr).toContain("ALL CHECKS PASSED");
      expect(code).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Mutation: wrong expected-version fails", () => {
  test("exits 1 when marketplace.json version mismatches", () => {
    const root = makeRepo({
      marketplaceVersion: "0.1.0",
      changelogVersion: "0.1.0",
    });
    try {
      const { code, stdout } = runVerify([
        "--expected-version=0.9.9",
        `--root=${root}`,
      ]);
      expect(code).toBe(1);
      expect(stdout).toContain("marketplace.json version");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
