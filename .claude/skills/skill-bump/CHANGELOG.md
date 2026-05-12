# Changelog

All notable changes to this skill will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [1.0.1] - 2026-05-12

### Changed
- Add gitDiffStagedNameStatus to git-helpers to detect staged (--cached) changes
- Merge committed + staged diff entries in collectDiff; severity-based conflict resolution (D > A/R/C > M)

## [1.0.0] - 2026-05-11

### Changed
- Verify reduced 3 checks → 1: frontmatter version === changelog top
- Exit code 5 (manifest schema corruption) removed

### Removed
- Drop manifest.json artifact and manifest computation

## [0.1.0] - 2026-05-02

### Added
- Initial release: per-skill changelog and manifest generator with semver bump rules
- Scripts: bump-rules, changelog-writer, collect-diff-data, manifest, run, verify
- Lib modules: changelog-helpers, default-excludes, frontmatter, git-helpers, known-abort
- Test suite covering bump rules, changelog writer, diff collection, manifest, frontmatter, git helpers, verify, concurrency, and integration
