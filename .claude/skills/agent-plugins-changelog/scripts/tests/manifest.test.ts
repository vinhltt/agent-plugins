// Unit tests for manifest helpers (frontmatter parser, build round-trip).

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, parseFrontmatter } from "../manifest";

describe("parseFrontmatter", () => {
  test("returns null without leading ---", () => {
    expect(parseFrontmatter("hello world")).toBeNull();
  });

  test("top-level scalars", () => {
    const raw = `---\nversion: 1.2.3\nname: foo\n---\nbody`;
    expect(parseFrontmatter(raw)).toEqual({ version: "1.2.3", name: "foo" });
  });

  test("nested metadata.version", () => {
    const raw = `---\nname: skill-x\nmetadata:\n  version: 0.1.0\n  author: vinh\n---\n`;
    expect(parseFrontmatter(raw)).toEqual({
      name: "skill-x",
      metadata: { version: "0.1.0", author: "vinh" },
    });
  });

  test("strips quotes", () => {
    const raw = `---\nversion: "0.1.0"\nname: 'agent-x'\n---\n`;
    expect(parseFrontmatter(raw)).toEqual({ version: "0.1.0", name: "agent-x" });
  });

  test("ignores comments and blank lines", () => {
    const raw = `---\n# comment\nversion: 1.0.0\n\nname: x\n---\n`;
    expect(parseFrontmatter(raw)).toEqual({ version: "1.0.0", name: "x" });
  });
});

describe("buildManifest E2E", () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "ap-manifest-"));
    mkdirSync(join(root, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, ".claude-plugin/marketplace.json"),
      JSON.stringify({ name: "test", metadata: { version: "0.5.0" } }, null, 2),
    );
    writeFileSync(join(root, "LICENSE"), "MIT\n");
    writeFileSync(join(root, ".agent-plugins.json"), JSON.stringify({ version: "1.0", name: "test", changelog: { exclude: [] } }));

    // Top-level skill
    mkdirSync(join(root, "skills/alpha"), { recursive: true });
    writeFileSync(
      join(root, "skills/alpha/SKILL.md"),
      `---\nname: alpha\nmetadata:\n  version: 0.2.0\n---\nbody\n`,
    );

    // Top-level agent
    mkdirSync(join(root, "agents"), { recursive: true });
    writeFileSync(
      join(root, "agents/bot.md"),
      `---\nname: bot\nversion: 0.3.0\n---\nbody\n`,
    );

    // Plugin with skill
    mkdirSync(join(root, "plugins/myplug/.claude-plugin"), { recursive: true });
    writeFileSync(
      join(root, "plugins/myplug/.claude-plugin/plugin.json"),
      JSON.stringify({ name: "myplug", version: "1.1.0" }),
    );
    mkdirSync(join(root, "plugins/myplug/skills/inner"), { recursive: true });
    writeFileSync(
      join(root, "plugins/myplug/skills/inner/SKILL.md"),
      `---\nmetadata:\n  version: 1.1.5\n---\n`,
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("captures marketplace version + checksum", () => {
    const m = buildManifest(root);
    expect(m.marketplace.version).toBe("0.5.0");
    expect(m.marketplace.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  test("identifies top-level skill with frontmatter version", () => {
    const m = buildManifest(root);
    expect(m.components.skills?.alpha?.version).toBe("0.2.0");
    expect(m.components.skills?.alpha?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  test("identifies top-level agent with frontmatter version", () => {
    const m = buildManifest(root);
    expect(m.components.agents?.bot?.version).toBe("0.3.0");
  });

  test("identifies plugin with version + nested skill", () => {
    const m = buildManifest(root);
    expect(m.plugins.myplug?.version).toBe("1.1.0");
    expect(m.plugins.myplug?.components?.skills?.inner?.version).toBe("1.1.5");
  });

  test("files map includes top-level files only when not under plugins", () => {
    const m = buildManifest(root);
    expect(m.files["LICENSE"]).toBeTruthy();
    expect(m.files[".claude-plugin/marketplace.json"]).toBeTruthy();
  });
});
