# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [0.1.3] - 2026-05-12

### Changed
- researcher agent: add research, context7-cli, find-docs skills

### Removed
- manifest.json: removed legacy root-level manifest (superseded by .claude-plugin/plugin.json)

## [0.1.2] - 2026-05-10

### Changed
- docs-seeker: route library docs via ctx7 CLI (context7-cli skill) instead of context7 MCP tools
- README: document context7-cli plugin dependency + GitHub MCP optional fallback
