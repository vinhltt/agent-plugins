---
name: skill-bump
description: Generate per-skill CHANGELOG.md and bump SKILL.md frontmatter version. Run on a single skill folder; orchestrate N skills via Task tool fan-out.
metadata:
  version: 1.0.1
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

The single source of truth is `SKILL.md` frontmatter `metadata.version`; `CHANGELOG.md` is the human-readable history of what shipped.

If you don't pass any descriptions, the skill still bumps the version + writes the changelog, but each section that has diff entries gets a single `- TODO: describe` placeholder so the human editor sees there is unfinished work. Never leave `TODO: describe` in a committed changelog.

**Example (the agent calls):**

```bash
bun .../run.ts --target=/path/to/some-skill --auto \
  --changed="Switch frontmatter parser to block-style validation, reject flow form" \
  --changed="Tighten dirty-tree gate so --auto only bypasses with WARN" \
  --added="New verify step: frontmatter version === changelog top header"
```

What appears in `CHANGELOG.md`:

```markdown
## [0.2.0] - 2026-05-11

### Added
- New verify step: frontmatter version === changelog top header

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

After write, a single check must pass for exit 0:

- SKILL.md frontmatter `metadata.version` === CHANGELOG.md top header version (`## [x.y.z]`)

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | OK |
| 2 | Missing files / dirty tree (no `--auto`) / `metadata.version` missing on incremental |
| 4 | Verify failed (frontmatter ≠ changelog top) |
| 99 | Unexpected error |

## Recovery from partial state

`SKILL.md` uses temp+rename (atomic). `CHANGELOG.md` append is non-atomic. On verify failure:

```bash
git checkout <target>
```

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
