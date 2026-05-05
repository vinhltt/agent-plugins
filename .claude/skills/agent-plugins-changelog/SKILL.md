---
name: agent-plugins-changelog
description: Generate Keep-a-Changelog entries for the agent-plugins repo. Auto-classifies changes by component, bumps versions across marketplace.json + plugin.json + SKILL.md + agent frontmatter + manifest.json. Bun-native, zero dependencies. Use when staging a release or summarizing what changed since last commit.
metadata:
  authors: VinhLTT
  version: 0.1.1
---

# agent-plugins-changelog

Deterministic Keep-a-Changelog generator for the `agent-plugins` repo. Mirrors `specify-changelog-generator` semantics but adapted for the top-level repo layout (`plugins/`, `skills/`, `agents/`, `hooks/`, `commands/`).

> **Requires:** [Bun](https://bun.sh) ≥ 1.0. No `npm install` step. Zero dependencies.
> **Definition of Done:** Step 13 (`verify.ts`) exits 0.

## Modes

| Flag       | Behavior |
|------------|----------|
| `--auto`   | Skip user confirmation between steps; abort on any verify failure. |
| (default)  | Print proposed version + diff summary at step 5; ask user before steps 9–12. |

## When to use this skill

- Preparing a release of the `agent-plugins` marketplace.
- Summarizing what changed in a feature branch before merge.
- Stamping versions consistently across `marketplace.json`, plugin manifests, skill/agent frontmatter, and `manifest.json`.

## Bump rules

| Diff status | Bump   | Reasoning |
|-------------|--------|-----------|
| `D` (delete) of a tracked component file | major | Removal is breaking. |
| `A` (add) of a new plugin / skill / agent | minor | New capability. |
| `M` (modify) or `R` (rename) of an existing file | patch | Internal change. |

If multiple statuses present, take the strongest (D > A > M).

## Workflow (13 steps)

### 1. Parse intent
Read `.agent-plugins.json` (excludes config) and `git status`. Decide between `--auto` and interactive mode based on caller flag.

### 2. Collect diff
```bash
bun .claude/skills/agent-plugins-changelog/scripts/collect-diff-data.ts [--since=<git-ref>]
```
Default: staged changes. Output: JSON `{ version, changes: [{ status, path, group }] }`.

### 3. Classify
Output is already grouped by `collect-diff-data.ts` (Phase 02 logic). Validate group counts; abort if `changes` is empty (nothing to record).

### 4. Infer bump type
Walk `changes`, apply bump-rules table above, take strongest. Persist proposed `bumpType` (major/minor/patch).

### 5. Propose new version
Read current `marketplace.json.metadata.version`, apply bump → `<new-version>`. **Interactive mode:** print proposed version and diff summary, await user confirmation.

### 6. Compute manifest
```bash
bun .claude/skills/agent-plugins-changelog/scripts/manifest.ts compute --root=. --write
```
Captures fresh checksums for current disk state.

### 7. Compare manifest
```bash
bun .claude/skills/agent-plugins-changelog/scripts/manifest.ts compare --root=.
```
Confirms scan reflects the diff. Exits 1 if drift remains after step 6.

### 8. Draft CHANGELOG entry
Write a new section above `[<previous-version>]`:
```md
## [<new-version>] - YYYY-MM-DD

### Added
- <plugin-or-component>: <one-line summary>

### Changed
- <plugin-or-component>: <one-line summary>

### Removed
- <plugin-or-component>: <one-line summary>
```
If two or more entries share a group (e.g., multiple files under `plugins/foo/`), nest them under the group name.

### 9. Update marketplace.json
Set `metadata.version` to `<new-version>` in `.claude-plugin/marketplace.json`.

### 10. Update plugin.json files
For each affected plugin, apply the rule based on diff status:
- **Status `A` (new plugin):** leave `plugin.json.version` as-is — it is the author's initial release version; do not overwrite.
- **Status `M` or `R` (existing plugin modified):** bump `plugins/<name>/.claude-plugin/plugin.json.version` to `<new-version>`.

### 11. Update component frontmatter
For each affected skill/agent, apply the rule based on diff status:
- **Status `A` (new skill/agent):** leave `SKILL.md`/agent frontmatter `version` as-is — it is the author's initial release version; do not overwrite.
- **Status `M` or `R` (existing skill/agent modified):** bump `skills/<name>/SKILL.md` `metadata.version` (or `agents/<name>.md` `version`) to `<new-version>`.
- Hooks (`hooks/<name>.json`) and commands (`commands/<name>.md`) are tracked by checksum only — no frontmatter version per design decision D5.

### 12. Re-compute manifest
```bash
bun .claude/skills/agent-plugins-changelog/scripts/manifest.ts compute --root=. --write
```
Captures the new versions + checksums set in steps 9–11.

### 13. Verify
```bash
bun .claude/skills/agent-plugins-changelog/scripts/verify.ts \
  --expected-version=<new-version> \
  --plugins=<csv> --skills=<csv> --agents=<csv>
```
**MUST exit 0.** This is the Definition of Done. Failure indicates a step 8–12 mismatch — fix and re-run from the failing step.

## Tracked layout

| Path                              | Tracked? | Version source |
|-----------------------------------|----------|----------------|
| `.claude-plugin/marketplace.json` | yes      | `metadata.version` |
| `plugins/<name>/.claude-plugin/plugin.json` | yes | `version` |
| `plugins/<name>/**`               | yes      | (per plugin) |
| `skills/<name>/SKILL.md`          | yes      | frontmatter `metadata.version` |
| `skills/<name>/**`                | yes      | (per skill checksum) |
| `agents/<name>.md`                | yes      | frontmatter `version` |
| `hooks/<name>.json`               | yes      | checksum only |
| `commands/<name>.md`              | yes      | checksum only |
| `.claude/skills/<name>/**`        | yes      | checksum only — grouped as `Skills/<name>` |
| `.claude/agents/<name>.md`        | yes      | checksum only — grouped as `Agents/<name>` |
| `.claude/hooks/<name>.json`       | yes      | checksum only — grouped as `Hooks/<name>` |
| `.claude/commands/<name>.md`      | yes      | checksum only — grouped as `Commands/<name>` |
| `CHANGELOG.md`, `LICENSE`, `manifest.json`, `.git/**` | excluded | — |

Custom excludes go in `.agent-plugins.json` under `changelog.exclude` (array of paths or `path/**` globs).

## Configuration: `.agent-plugins.json`

```json
{
  "version": "1.0",
  "name": "agent-plugins",
  "changelog": {
    "exclude": ["docs/**", "plans/**"]
  }
}
```

## Sync with specify-changelog-generator

Bug fixes that apply to BOTH skills must be cherry-picked manually (no shared package per design decision D1).

When fixing a bug here, add a TODO comment:
```ts
// TODO(sync): consider porting to specify-changelog-generator
```
And vice versa. Revisit shared-package decision if 3+ divergence incidents occur.

## Failure modes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `verify.ts` exit 1 on check 1 | Forgot to write CHANGELOG entry | Re-do step 8 |
| `verify.ts` exit 1 on check 2 | Forgot to update `marketplace.json` | Re-do step 9 |
| `verify.ts` exit 1 on check 3 | Plugin `.version` mismatch | Re-do step 10 |
| `verify.ts` exit 1 on check 4 | Frontmatter not bumped | Re-do step 11 |
| `verify.ts` exit 1 on check 5 | Manifest stale | Re-run step 12 |
| `compare` shows drift after step 12 | File changed between 12 and verify call | Re-run from step 6 |

## Commits land in `agent-plugins.git` only

Per pavkit scope-boundary rules, this skill assumes `cwd` is the `agent-plugins` repo. NEVER mix commits from this skill into the parent `pavkit-builder` repo.
