# Changelog

All notable changes to this skill will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [0.2.0] - 2026-05-22

### Added
- File-based input mode: parse .md files (brainstorm reports, phase files, plan docs) into structured GitHub issues
- GitHub MCP detection with gh CLI fallback
- Repo auto-detect from input file's git context (handles nested repos)
- Adaptive body extraction: maps .md sections to issue template
- Basic metadata mapping: priority/status frontmatter → GitHub labels
- `--auto` flag: skip repo confirmation
- `--dry-run` flag: preview issue without creating
- `--repo` flag now optional: override for auto-detect (was required)

## [0.1.0] - 2026-05-03

### Added
- Initial skill: capture brainstorm output as GitHub issue via gh CLI
- Configurable --repo target (no hardcoded owner/repo)
- Auth via gh auth status pre-flight (no token handling in skill)
- Fixed 4-section body template: Summary / Use Case / Proposed Behavior / Open Questions
- Fail-fast on missing gh CLI, failed auth, unknown label, or 404 repo
