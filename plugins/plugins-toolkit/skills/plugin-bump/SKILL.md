---
name: plugin-bump
description: Per-plugin version bumper. Targets 1 plugin folder, auto-derives semver from git diff (max-wins D=major A=minor M/R/C=patch), cascades version to changed components only (skills/agents/commands/hooks), generates CHANGELOG.md, verifies via 4-check DoD.
metadata:
  version: 1.2.5
  author: vinhltt
  scope: per-plugin
---

# plugin-bump

Per-plugin changelog + version cascader. One run = one plugin.

## When to use

- Author touched files inside `<repo>/plugins/<plugin>/` and wants plugin.json + component versions + changelog updated.
- CI/release pipeline needs deterministic semver bump per plugin.
- Caller (Claude/agent) wants to bump N plugins in parallel without coordination (each is an independent run).

## Changelog Bullets (REQUIRED — Claude must do this before running)

The script cannot generate semantic descriptions. If `--added`/`--changed`/`--removed` are not passed, the changelog gets a `TODO: describe` placeholder.

**Before running the script, Claude MUST:**

1. Inspect the diff: `git diff <since>..HEAD -- <plugin-folder>` + `git diff --cached -- <plugin-folder>`
2. For each logical change, derive a semantic bullet describing WHAT changed and WHY
3. Pass the bullets as `--added=...`, `--changed=...`, or `--removed=...` flags

**Format rules:**
- Describe the intent/effect, NOT the file name
- ❌ Bad: `scripts/run.ts`
- ✅ Good: `Fix changelog bullets to use semantic descriptions instead of file paths`
- One bullet per logical change (not per file)

## CLI

```bash
bun plugins/plugins-toolkit/skills/plugin-bump/scripts/run.ts \
  --target=<absolute-path-to-plugin-folder> \
  [--since=<git-ref>] \
  [--auto] \
  [--dry-run] \
  [--added=<text>]... \
  [--changed=<text>]... \
  [--removed=<text>]...
```

`--added`, `--changed`, `--removed` are repeatable. Each becomes one bullet in the matching CHANGELOG section.

## Modes

| Flag | Effect |
|---|---|
| (none) | Fail on dirty working tree, prompt to commit/stash |
| `--auto` | Bypass dirty-tree check (WARN only), proceed non-interactively |
| `--dry-run` | Print JSON plan to stdout; no writes |

## Bump rules

| Status | Bump |
|---|---|
| D (deleted) | major |
| A (added) | minor |
| M / R / C | patch |

Max-wins across all changed files in the plugin diff. A single deleted file → major, even if 10 other files were only modified.

## What gets updated

| File | Always? | Condition |
|---|---|---|
| `.claude-plugin/plugin.json` `.version` | Yes | Every run |
| `skills/<n>/SKILL.md` `metadata.version` | Only if in diff | Component in diff |
| `agents/<n>.md` `version` | Only if in diff | Component in diff |
| `commands/<n>.md` `version` | Only if in diff | Component in diff |
| `hooks/<n>.json` `version` | Only if in diff | Component in diff |
| `CHANGELOG.md` | Yes | Every run |

Components NOT in the diff are left byte-identical.

## Verify (4-check DoD)

After every write, the skill auto-verifies:

- **(a)** `plugin.json.version` matches the new expected version
- **(b)** `CHANGELOG.md` top entry version === expected version
- **(c)** Every component in diff has new version
- **(d)** Every component NOT in diff has version unchanged from HEAD snapshot

Any failure → exit 4 + detailed message per failing check.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | OK — all writes + verify passed |
| 2 | Precondition failed (dirty tree without --auto, missing SKILL.md, empty diff, invalid ref) |
| 4 | Verify failed (one or more of a/b/c/d) |
| 99 | Unexpected error |

## Post-run

After a successful run (exit 0), the script leaves modified files unstaged. `git add` only the files plugin-bump wrote (`plugin.json`, `CHANGELOG.md`, changed components). **NEVER run `git commit`** — leave that to the user.

## Self-bump

When `plugins-toolkit` itself is updated, use the 3-tier flow:

```
1. Edit skill files in plugins-toolkit/skills/plugin-bump/
2. skill-bump  --target=plugins/plugins-toolkit/skills/plugin-bump --auto   # per-skill CHANGELOG + manifest
3. plugin-bump --target=plugins/plugins-toolkit --auto                        # per-plugin CHANGELOG + plugin.json cascade
4. agent-plugins-changelog (separate run)                                     # marketplace.json bump
```

Step 2 uses `skill-bump` (different scope). Step 3 uses this skill. They don't recurse — different targets.

## Limitations

- One plugin per run. Fan-out across plugins is the caller's job (parallel Task tool spawns).
- Components must follow standard layout: `skills/<n>/SKILL.md`, `agents/<n>.md`, `commands/<n>.md`, `hooks/<n>.json`.
- Skill folder = ownership unit. Any file change in `skills/<n>/` (scripts/, references/, tests/, etc.) cascades to `skills/<n>/SKILL.md metadata.version` automatically (subdir cascade).
- Hooks `version` field: written to top-level JSON key. If Claude Code schema rejects it, fallback is checksum-only (see Limitations note in scripts/version-cascade.ts).
