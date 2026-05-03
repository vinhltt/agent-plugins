# Changelog

All notable changes to this skill will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [0.1.0] - 2026-05-03

### Added
- Initial skill: capture brainstorm output as GitHub issue via gh CLI
- Configurable --repo target (no hardcoded owner/repo)
- Auth via gh auth status pre-flight (no token handling in skill)
- Fixed 4-section body template: Summary / Use Case / Proposed Behavior / Open Questions
- Fail-fast on missing gh CLI, failed auth, unknown label, or 404 repo
