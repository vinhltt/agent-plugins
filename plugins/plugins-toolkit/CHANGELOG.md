# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [1.4.0] - 2026-05-30

### Added
- agent-frontmatter: add lib/agent-frontmatter.ts with pure reconcileAgentVersion + readAgentVersion, extracted from the cascade writer so frontmatter version logic is unit-testable without a filesystem

### Changed
- Consolidate agent/command frontmatter to a single metadata-first version field, removing the stale top-level line plugin-bump previously injected
- verify reads agent/command version through the shared reconcile precedence, so the verifier can never drift from what the writer produced
- Annotate malformed/unterminated-frontmatter errors with the offending file path during multi-component bumps

## [1.3.0] - 2026-05-22

### Added
- plugin-bump: multi-format manifest support — auto-create .codex-plugin and .cursor-plugin manifests from .claude-plugin anchor, cascade same semver across all 3

### Changed
- plugin-bump: verify (a) now validates version across every discovered manifest with per-format failure reasons; cascade emits manifestsUpdated list
- plugin-bump: dry-run output and run logs surface per-manifest existence, willCreate, and bumped formats

## [1.2.8] - 2026-05-21

### Changed
- plugin-bump: remove per-skill version numbers from changelog bullet format rules

## [1.2.7] - 2026-05-19

### Changed
- plugin-bump skill v1.2.7: expand Post-run section to numbered checklist with explicit placeholder-check step before staging files

## [1.2.6] - 2026-05-19

### Changed
- plugin-bump 1.2.6: require changelog bullets to include bumped component version; add bad/good format examples

## [1.2.5] - 2026-05-19

### Changed
- plugin-bump 1.2.5: add mandatory pre-run changelog instructions; refactor buildBullets and restore TODO_PLACEHOLDER constant

## [1.2.4] - 2026-05-19

### Changed
- plugin-bump 1.2.4: enforce semantic changelog descriptions with mandatory pre-run diff analysis step

## [1.1.1] - 2026-05-12

### Changed
- skill-bump + plugin-bump: include staged (git index) changes via git diff --cached alongside committed diff — no more require-commit-first gate

## [0.1.1] - 2026-05-11

### Changed
- plugin-bump skill: dropped manifest.json + simplified DoD
