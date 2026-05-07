# Changelog

All notable changes to this skill will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [0.1.2] - 2026-05-07

### Changed
- readAgentVersion now reads metadata.version (block-style frontmatter) with fallback to top-level version field

## [0.1.1] - 2026-05-05

### Changed
- Step 10: preserve plugin.json version on new-plugin additions (status A); only bump on M/R
- Step 11: preserve SKILL.md/agent frontmatter version on new additions (status A); only bump on M/R

## [0.1.0] - 2026-05-02

### Added
- SKILL.md
- scripts/checks/check-changelog-header.ts
- scripts/checks/check-cross-consistency.ts
- scripts/checks/check-marketplace-version.ts
- scripts/checks/check-plugin-versions.ts
- scripts/checks/check-skill-versions.ts
- scripts/checks/fs-helpers.ts
- scripts/checks/types.ts
- scripts/collect-diff-data.ts
- scripts/manifest.ts
- scripts/tests/collect-diff-data.test.ts
- scripts/tests/manifest.test.ts
- scripts/tests/verify.test.ts
- scripts/verify.ts
