// Unit tests for collect-diff-data helpers (group classification, exclude logic, diff parsing).
// No git or filesystem IO — pure-function checks.

import { describe, expect, test } from "bun:test";
import {
  classifyGroup,
  isExcluded,
  parseDiffLines,
  prefixToRegex,
} from "../collect-diff-data";

describe("classifyGroup", () => {
  test("plugin file → plugin name", () => {
    expect(classifyGroup("plugins/foo/SKILL.md")).toBe("foo");
    expect(classifyGroup("plugins/bar-baz/.claude-plugin/plugin.json")).toBe("bar-baz");
  });

  test("top-level skill → Skills/<name>", () => {
    expect(classifyGroup("skills/my-skill/SKILL.md")).toBe("Skills/my-skill");
  });

  test(".claude/skills/<name> → Skills/<name>", () => {
    expect(classifyGroup(".claude/skills/agent-plugins-changelog/SKILL.md"))
      .toBe("Skills/agent-plugins-changelog");
    expect(classifyGroup(".claude/skills/foo/scripts/bar.ts"))
      .toBe("Skills/foo");
  });

  test(".claude/<kind>/<name> mirrors top-level grouping", () => {
    expect(classifyGroup(".claude/agents/reviewer.md")).toBe("Agents/reviewer");
    expect(classifyGroup(".claude/hooks/pre-commit.json")).toBe("Hooks/pre-commit");
    expect(classifyGroup(".claude/commands/release.md")).toBe("Commands/release");
  });

  test("agent .md → Agents/<name>", () => {
    expect(classifyGroup("agents/reviewer.md")).toBe("Agents/reviewer");
  });

  test("hook .json → Hooks/<name>", () => {
    expect(classifyGroup("hooks/pre-commit.json")).toBe("Hooks/pre-commit");
  });

  test("command .md → Commands/<name>", () => {
    expect(classifyGroup("commands/release.md")).toBe("Commands/release");
  });

  test("marketplace.json → Marketplace", () => {
    expect(classifyGroup(".claude-plugin/marketplace.json")).toBe("Marketplace");
  });

  test("uncategorized → General", () => {
    expect(classifyGroup("README.md")).toBe("General");
    expect(classifyGroup("docs/intro.md")).toBe("General");
  });
});

describe("isExcluded", () => {
  test("exact match", () => {
    expect(isExcluded("CHANGELOG.md", ["CHANGELOG.md"])).toBe(true);
    expect(isExcluded("LICENSE", ["CHANGELOG.md"])).toBe(false);
  });

  test("trailing slash prefix", () => {
    expect(isExcluded(".git/HEAD", [".git/"])).toBe(true);
    expect(isExcluded("git/HEAD", [".git/"])).toBe(false);
  });

  test("** glob", () => {
    expect(isExcluded(".git/refs/heads/main", [".git/**"])).toBe(true);
    expect(isExcluded("docs/foo/bar.md", ["docs/**"])).toBe(true);
    expect(isExcluded("docs", ["docs/**"])).toBe(false);
  });
});

describe("parseDiffLines", () => {
  test("modify and add", () => {
    const lines = ["M\tskills/foo/SKILL.md", "A\tagents/bar.md"];
    expect(parseDiffLines(lines)).toEqual([
      { status: "M", path: "skills/foo/SKILL.md" },
      { status: "A", path: "agents/bar.md" },
    ]);
  });

  test("rename normalizes R100 → R, captures old_path", () => {
    const lines = ["R100\tagents/old.md\tagents/new.md"];
    expect(parseDiffLines(lines)).toEqual([
      { status: "R", old_path: "agents/old.md", path: "agents/new.md" },
    ]);
  });

  test("delete", () => {
    expect(parseDiffLines(["D\thooks/dead.json"])).toEqual([
      { status: "D", path: "hooks/dead.json" },
    ]);
  });
});

describe("prefixToRegex", () => {
  test("escapes regex specials", () => {
    expect(prefixToRegex(".git/").test(".git/HEAD")).toBe(true);
    expect(prefixToRegex(".git/").test("xgit/HEAD")).toBe(false);
  });
});
