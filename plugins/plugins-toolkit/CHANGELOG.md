# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

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
