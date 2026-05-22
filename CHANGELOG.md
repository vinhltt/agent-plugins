# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.3] - 2026-05-22

### Added

- plugins-toolkit v1.3.0: plugin-bump skill v1.3.0 — multi-format manifest support, auto-create `.codex-plugin/` and `.cursor-plugin/` manifests from `.claude-plugin/` anchor when missing, cascade same semver across all 3 formats; verify check (a) now validates version across every discovered manifest with per-format failure reasons; cascade exposes `manifestsUpdated`; dry-run output and run logs surface per-manifest existence/willCreate/bumped formats

## [1.3.2] - 2026-05-22

### Changed

- gh-community v0.8.0: create-issue skill v0.2.0 — add file-based input mode (parse .md brainstorm/phase/plan docs into structured issues), GitHub MCP detection with gh CLI fallback, repo auto-detect from input file's git context (handles nested repos), adaptive section mapping, priority/status frontmatter → labels, `--auto` and `--dry-run` flags; `--repo` flag now optional

## [1.3.1] - 2026-05-21

### Changed

- plugins-toolkit/plugin-bump 1.2.8: drop per-skill version numbers from changelog bullet format rules (versions now tracked solely in component frontmatter, not duplicated in bullet text)

## [1.3.0] - 2026-05-21

### Added

- efcore: new plugin v0.1.0 shipping linq-ef skill v0.1.0 — Entity Framework Core LINQ best practices with progressive-disclosure references (query-patterns, performance, anti-patterns, change-tracking, bulk-operations, query-translation, advanced-patterns, testing) for EF Core 8/9/10
- Marketplace: register `efcore` plugin under `development` category

## [1.2.6] - 2026-05-19

### Added

- Marketplace: register `csharp-lsp` plugin (git-subdir → claude-plugins-official) — C# language server (OmniSharp/Roslyn) for .NET code intelligence; listed under `development` category in README

## [1.2.5] - 2026-05-19

### Added

- document-converter: new plugin shipping xlsx-to-csv skill v0.1.0 — converts XLSX files to CSV with auto-detect source/target directory naming, multi-sheet support, and UTF-8 BOM encoding

## [1.2.4] - 2026-05-19

### Changed

- plugins-toolkit/plugin-bump v1.2.7: expand Post-run section to numbered checklist with explicit placeholder-check step before staging files

## [1.2.3] - 2026-05-19

### Changed

- plugins-toolkit/plugin-bump 1.2.6: require changelog bullets to include bumped component version; add bad/good format examples

## [1.2.2] - 2026-05-13

### Changed

- plugins-toolkit/plugin-bump: added `expandSkillSubdirPaths()` — any file changed under `skills/<n>/` (scripts/, tests/, references/, etc.) now auto-cascades to `skills/<n>/SKILL.md`; updated `run.ts` to use expansion with cascade logging in dry-run output; added unit tests; updated SKILL.md docs

## [1.2.1] - 2026-05-12

### Changed

- Skills/skill-bump: add `gitDiffStagedNameStatus` to `git-helpers.ts`; merge committed + staged entries in `collectDiff` with severity-based conflict resolution (D > A/R/C > M)

## [1.2.0] - 2026-05-12

### Changed

- Skills/skill-bump: merge committed + staged diff entries (`gitDiffStagedNameStatus` added to `git-helpers.ts`); most-severe-status wins on path collision
- plugins-toolkit/plugin-bump: parity with Skills/skill-bump — staged diff support in `collect-diff-data.ts` and `git-helpers.ts`
- research-toolkit/researcher: added `research`, `context7-cli`, `find-docs` to skills list; migrated version field from `metadata.version` to top-level `version` frontmatter

### Removed

- research-toolkit: removed `manifest.json` snapshot file

## [1.1.0] - 2026-05-11

### Changed

- plugins-toolkit/plugin-bump: consolidated manifest logic into run workflow (parity with v1.0.0 `Skills/skill-bump` refactor); simplified `verify.ts` and `run.ts`; minor updates to `collect-diff-data.ts`, `default-excludes.ts`, and test suite
- plugins-toolkit: bumped plugin version and added plugin-internal CHANGELOG

### Removed

- plugins-toolkit/plugin-bump: removed standalone `scripts/manifest.ts`, `tests/manifest.test.ts`, and stale `manifest.json` snapshot (internal refactor; no marketplace-consumer API affected — bump kept at minor per explicit override of deterministic D=major rule)

## [1.0.0] - 2026-05-11

### Changed

- Skills/skill-bump: consolidated manifest logic into run workflow; simplified `verify.ts` and `run.ts`; minor updates to `collect-diff-data.ts`, `default-excludes.ts`, and test suite

### Removed

- Skills/agent-plugins-changelog: removed stale `manifest.json` snapshot file
- Skills/skill-bump: removed standalone `scripts/manifest.ts` module and `tests/manifest.test.ts` (manifest logic consolidated)

## [0.10.1] - 2026-05-10

### Changed

- research-toolkit/docs-seeker: route library docs via `ctx7` CLI (delegates to `context7-cli` skill) instead of context7 MCP tools; trim verbose example workflows
- research-toolkit: README documents context7-cli dependency and GitHub MCP optional fallback

### Added

- research-toolkit: per-plugin `CHANGELOG.md` and `manifest.json` tracking files

## [0.10.0] - 2026-05-10

### Added

- plugins-toolkit: new plugin - tooling for Claude Code plugin authors; ships `plugin-bump` skill (per-plugin semver bumper; auto-derives bump level from git diff; cascades version to changed skills/agents/commands/hooks; generates CHANGELOG.md + manifest.json; verifies via 5-check DoD)
- General: added `.gitignore`

### Changed

- Marketplace: added `plugins-toolkit` entry

## [0.9.1] - 2026-05-07

### Changed

- Skills/agent-plugins-changelog: updated SKILL.md, changelog.md, manifest.json, and check-skill-versions.ts

## [0.9.0] - 2026-05-07

### Added

- research-toolkit: new plugin - deep research toolkit bundling `docs-seeker` skill (routes doc queries across context7 MCP → GitHub MCP → WebFetch/WebSearch), `research` skill (technical investigation, architecture analysis, solution design), and `researcher` agent (multi-source research reports; Haiku model)

### Changed

- Marketplace: added `research-toolkit` entry

## [0.8.1] - 2026-05-05

### Changed

- Skills/agent-plugins-changelog: updated SKILL.md, changelog.md, and manifest.json
- Marketplace: updated marketplace.json

## [0.8.0] - 2026-05-04

### Added

- cc-toolkit: new plugin - Claude Code utility toolkit; initial skill `cc-ask` routes Claude Code / Agent SDK / Anthropic API questions to the built-in `claude-code-guide` agent; thin router (no pre-processing, verbatim relay); designed to grow with more CC-related skills (settings, hooks, MCP, etc.)

### Changed

- Marketplace: added `cc-toolkit` entry

## [0.7.0] - 2026-05-03

### Added

- gh-community/create-issue: new skill - capture brainstormed ideas as GitHub issues via `gh` CLI on configurable `--repo`; pre-flight `gh auth status` (no token handling); fixed 4-section body template (Summary / Use Case / Proposed Behavior / Open Questions); fail-fast on missing CLI, failed auth, unknown label, or 404 repo

## [0.6.0] - 2026-05-03

### Added

- gh-community: new plugin - topic-organized refactor of gh-cli from `github/awesome-copilot`; slim SKILL.md with decision tree + `references/` split by feature area (auth, repos, issues, PRs, releases, workflows, secrets, api-search, extras)
- gh-official: new internal plugin - upstream mirror of `github/awesome-copilot/skills/gh-cli`; auto-synced staging area (not published to marketplace); reference source for gh-community refactor

### Changed

- Marketplace: added `gh-community` entry
- scripts/ts: updated `sync.config.json` to include gh-official upstream sync

## [0.5.0] - 2026-05-03

### Added

- scripts/ts: new shared plugin sync runner - generic Bun-native sync script (`sync.ts`) with config (`sync.config.json`) that pulls plugin source files from upstream GitHub repos; replaces the plugin-specific sync.ts previously bundled inside context7-cli

### Changed

- context7-cli: extracted `sync.ts` to `scripts/ts/`; updated `.sync-manifest.json`

## [0.4.2] - 2026-05-02

### Added

- Marketplace: added `vercel-labs` plugin - curated skills from Vercel Labs, bundles `find-skills` for discovering and installing agent skills from the open agent-skills ecosystem

## [0.4.1] - 2026-05-02

### Added

- Marketplace: added `langfuse` plugin - LLM observability platform integration for querying traces, scores, sessions, and prompts via CLI; official skill from Langfuse

## [0.4.0] - 2026-05-02

### Added

- Skills/skill-bump: new skill - deterministic per-skill CHANGELOG.md + manifest.json generator; bumps SKILL.md version; includes scripts (bump-rules, changelog-writer, collect-diff-data, manifest, verify, run), lib helpers (changelog-helpers, default-excludes, frontmatter, git-helpers, known-abort), and full test suite (9 test files)
- Marketplace: added `document-skills` plugin - document processing suite for Excel (xlsx), Word (docx), PowerPoint (pptx), and PDF via official Anthropic skills repo

## [0.3.0] - 2026-05-01

### Added

- context7-cli: new plugin - Context7 CLI tooling bundling `ctx7-cli` and `find-docs` skills from upstash/context7
  - `skills/context7-cli`: ctx7 CLI integration for library docs lookup and skill management via the ctx7 CLI
  - `skills/find-docs`: up-to-date documentation retrieval for libraries, frameworks, and SDKs

### Changed

- Marketplace: added `context7-cli` plugin entry

## [0.2.2] - 2026-04-30

### Added

- Marketplace
  - `code-simplifier`, `claude-code-setup`, `skill-creator`, `plugin-dev`, `hookify`, `pyright-lsp`, `typescript-lsp`, `pr-review-toolkit`, `claude-md-management`, `code-review`, `commit-commands`, `security-guidance`, `session-report`: individual `git-subdir` entries from `anthropics/claude-plugins-official`
  - `context7-plugin`: Upstash Context7 MCP via `git-subdir`
  - `chrome-devtools-mcp`: Chrome DevTools MCP via `url` source pinned to SHA `a1612be8`

### Removed

- Marketplace: `claude-plugins-official` aggregate reference (superseded by individual subdir entries)

## [0.2.1] - 2026-04-30

### Changed

- Marketplace: added `$schema`, moved `description` to top level in `.claude-plugin/marketplace.json`

## [0.2.0] - 2026-04-30

### Added

- General: initial repo config (`.agent-plugins.json`, `.claude/settings.json`)
- Marketplace: initial marketplace definition (`.claude-plugin/marketplace.json`)
- Skills/agent-plugins-changelog
  - `SKILL.md`: skill definition for deterministic Keep-a-Changelog generation
  - `scripts/collect-diff-data.ts`: staged diff collection and group classification
  - `scripts/manifest.ts`: checksum-based manifest compute and compare
  - `scripts/verify.ts`: 5-check verification gate for release consistency
  - `scripts/checks/*`: modular check implementations (changelog header, cross-consistency, marketplace version, plugin versions, skill versions)
  - `scripts/tests/*`: test suite covering collect-diff-data, manifest, and verify
