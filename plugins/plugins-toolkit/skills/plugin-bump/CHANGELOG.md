## [1.3.0] - 2026-05-22

### Added
- Multi-format manifest support: auto-create .codex-plugin and .cursor-plugin from .claude-plugin anchor when missing, cascade same semver to all 3
- manifest-targets unit + integration tests covering discovery, ensure (clone-from-anchor), extra-fields preservation, and dry-run plan output

### Changed
- Cascade version to every discovered manifest format (claude/codex/cursor) instead of only .claude-plugin; CascadeResult exposes manifestsUpdated
- Extend verify check (a) to validate version across every discovered manifest with per-format failure reasons
- run.ts: ensureManifests before cascade; dry-run JSON now reports per-format exists/willCreate; log manifests bumped
- SKILL.md: document multi-format manifest behavior (anchor role, auto-create, version sync) and update What-gets-updated table

## [1.2.7] - 2026-05-19

### Changed
- Expand Post-run section to numbered checklist with explicit placeholder-check step before staging files

## [1.2.6] - 2026-05-19

### Changed
- Require changelog bullets to include bumped component version; add bad/good format examples

## [1.2.5] - 2026-05-19

### Changed
- Add 'Changelog Bullets (REQUIRED)' section to SKILL.md: mandatory pre-run steps forcing Claude to inspect diff and pass semantic --added/--changed/--removed flags
- Refactor buildBullets signature from boolean to string[] for cleaner intent; restore TODO_PLACEHOLDER constant

## [1.2.4] - 2026-05-19

### Changed
- Add mandatory pre-run section requiring Claude to analyze diff and pass semantic changelog bullets via --added/--changed/--removed flags
- Revert diff-paths fallback in buildBullets; keep TODO:describe placeholder as reminder for missing descriptions

## [1.2.3] - 2026-05-19

### Changed
- scripts/run.ts: default changelog bullets now use diff paths instead of TODO placeholder

## [1.1.1] - 2026-05-12

### Changed
- Add Post-run section: stage-only policy after successful run
- Remove Execution Protocol section — staged changes now detected automatically via git diff --cached

## [1.0.0] - 2026-05-11

### Changed
- DoD shrunk to 4 checks; plugin.json.version is single source of truth

### Removed
- manifest.json generation
- 5th DoD check (manifest hash verification)

## [Unreleased]
