# Changelog

All notable changes to this skill will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [0.1.0] - 2026-05-04

### Added
- New skill: thin router that forwards Claude Code / Agent SDK / Anthropic API questions to the built-in claude-code-guide agent verbatim
- Supports Task (first question) vs SendMessage (reuse existing agent) delegation pattern to preserve context and reduce cost
- Covers Claude Code CLI (hooks, slash commands, MCP, settings, IDE extensions, plugins, skills), Agent SDK, and Anthropic API (tool use, prompt caching, streaming, multimodal, batch)
- Fail-loud policy: if claude-code-guide agent unavailable, instructs user to update Claude Code rather than falling back to training data
