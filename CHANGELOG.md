# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
