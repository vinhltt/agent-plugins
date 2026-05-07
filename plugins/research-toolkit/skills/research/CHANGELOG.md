# Changelog

All notable changes to this skill will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [0.1.0] - 2026-05-07

### Added
- Initial research skill: 4-phase methodology (scope definition, information gathering, analysis, report generation)
- Gemini CLI integration with toggle via .agent-plugins.json and fallback to WebSearch when unavailable
- Multi-source search strategy: parallel WebSearch/Gemini, docs-seeker for GitHub repos, max 5 research calls
- Structured report template: executive summary, current state, best practices, security, performance, references
- Caller-provided output_path resolution with default convention plans/reports/researcher-{YYMMDD-HHMM}-{slug}.md
