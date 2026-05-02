---
name: skill-bump
description: Generate per-skill CHANGELOG.md + manifest.json, bump SKILL.md version. Run on a single skill folder; orchestrate N skills via Task tool fan-out.
metadata:
  version: 0.1.0
  author: vinhltt
  scope: per-skill
---

# skill-bump

Per-skill changelog generator. One run = one skill.

## When to use

- Author touched files inside `<plugin>/.claude/skills/<skill>/` and wants version + changelog updated.
- CI/release pipeline needs deterministic semver bump per skill.
- Caller (Claude/agent) wants to bump N skills in parallel without coordination.

## CLI

```bash
bun .claude/skills/skill-bump/scripts/run.ts \
  --target=<absolute-path-to-skill-folder> \
  [--since=<git-ref>] \
  [--auto] \
  [--dry-run] \
  [--added=<text>]... \
  [--changed=<text>]... \
  [--removed=<text>]...
```

`--added`, `--changed`, `--removed` are repeatable. Each occurrence becomes one bullet under the matching Keep-a-Changelog section.

## Describing changes (CRITICAL for callers)

This skill is meant to be invoked by an agent (Claude/subagent) that just edited the target skill. **You — the agent — are the one with full context of what changed and why.** Pass that meaning into the changelog via `--added`, `--changed`, `--removed`.

The split is deliberate:
- **`manifest.json`** is the file ledger — every tracked file + content hash. Source of truth for "what files exist at this version".
- **`CHANGELOG.md`** is the meaning ledger — semantic prose describing what shipped. Source of truth for "what a human/AI reader needs to know".

If you don't pass any descriptions, the skill still bumps the version + writes the changelog, but each section that has diff entries gets a single `- TODO: describe` placeholder so the human editor sees there is unfinished work. Never leave `TODO: describe` in a committed changelog.

**Example (the agent calls):**

```bash
bun .../run.ts --target=/path/to/some-skill --auto \
  --changed="Switch frontmatter parser to block-style validation, reject flow form" \
  --changed="Tighten dirty-tree gate so --auto only bypasses with WARN" \
  --added="New verify step (c): top-of-file changelog version === manifest.version"
```

What appears in `CHANGELOG.md`:

```markdown
## [0.2.0] - 2026-05-02

### Added
- New verify step (c): top-of-file changelog version === manifest.version

### Changed
- Switch frontmatter parser to block-style validation, reject flow form
- Tighten dirty-tree gate so --auto only bypasses with WARN
```

Note: bump type (major/minor/patch) is still derived mechanically from git diff status — descriptions only fill the prose. If your "feat" only modifies existing files, the bump rule will still call it patch. That's intentional and keeps orchestration deterministic.

## Modes

| Mode | Use case | Dirty-tree | Writes |
|------|----------|------------|--------|
| default | manual single-skill bump | fail-fast (exit 2) | yes |
| `--auto` | parallel orchestration, CI | bypass with WARN | yes, abort on first error |
| `--dry-run` | preview before commit | bypass | no, prints JSON plan |

No interactive prompts — non-interactive by design for parallel orchestration.

## Parallel orchestration (caller-side)

```
Claude / agent:
  spawn N subagents via Task tool, one per target skill
  each subagent: bun run.ts --target=<skill-N> --auto
  zero file overlap → zero conflict
```

`--no-optional-locks` on every read-only git op prevents `.git/index.lock` contention with concurrent runs.

## Bump rules

| Diff status | Bump |
|-------------|------|
| A (added)   | minor |
| M (modified) | patch |
| R (renamed) | patch |
| C (copied) | patch |
| D (deleted) | **major** (conservative — see limitations) |

Max-wins across all changed files.

## Verify (DoD)

After write, 3 checks must pass for exit 0:
- (a) on-disk `manifest.json` matches expected AND recompute hashes match expected
- (b) `manifest.version` === SKILL.md frontmatter `metadata.version`
- (c) changelog top header version === `manifest.version`

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | OK |
| 2 | Missing files / dirty tree (no `--auto`) / `metadata.version` missing on incremental |
| 4 | Verify failed (a/b/c) |
| 5 | `manifest.json` schema corruption |
| 99 | Unexpected error |

## Recovery from partial state

Writes are non-atomic (only `SKILL.md` uses temp+rename). On verify failure:

```bash
git checkout <target>
```

## What ends up in the manifest

`manifest.files` hashes ALL `git ls-files <target>` entries except `DEFAULT_EXCLUDES` (`CHANGELOG.md`, `manifest.json`, `.git/**`, `node_modules/**`). Test files ARE part of the release surface — modifying a test triggers a patch bump.

The changelog NEVER lists file paths — that would duplicate the manifest. Use the `--added`/`--changed`/`--removed` flags to describe meaning instead.

## YAML frontmatter constraints

Block-style only, single `version:` under `metadata:`:

```yaml
metadata:
  version: 0.1.0
```

Rejected: flow-style `metadata: {version: ...}`, top-level `version:`, same-line `metadata: version: ...`.

## Limitations

- **D→major conservative**: deleting an internal helper triggers major bump. Will revisit if ≥3 spurious majors observed.
- **Single target per run**: orchestration is caller's job.
- **Requires git repo**: `--target` must be inside a git working tree.
- **POSIX-only**: tests use `mktemp` / `cp` / `realpath`. Devs use WSL on Windows.
