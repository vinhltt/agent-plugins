# agent-plugins

> A curated [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin marketplace — first-party plugins built in-house plus carefully selected community plugins, all from a single source.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Marketplace](https://img.shields.io/badge/marketplace-v0.8.1-blue.svg)](./.claude-plugin/marketplace.json)

## What is this?

`agent-plugins` is **VinhLTT's personal Claude Code plugin marketplace**. It aggregates two kinds of plugins behind one marketplace endpoint:

- **First-party** — plugins authored and maintained in this repository.
- **Curated community** — third-party plugins (Anthropic official, Vercel Labs, Langfuse, etc.) referenced via Git so you always pull from upstream.

Add the marketplace once, then browse and install any plugin from inside Claude Code — no need to track each upstream repo manually.

## Quick Start

```bash
# 1. Add this marketplace to Claude Code
/plugin marketplace add vinhltt/agent-plugins

# 2. Browse what's available
/plugin

# 3. Install a specific plugin
/plugin install <name>@agent-plugins-marketplace
```

Example:

```bash
/plugin install cc-toolkit@agent-plugins-marketplace
```

> The marketplace identifier is **`agent-plugins-marketplace`**. Always use this suffix when installing plugins from this source.

## Available Plugins

_Last synced: 2026-05-07 — source of truth: [`./.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)_

### First-Party (built & maintained here)

| Plugin | Category | Description |
|---|---|---|
| `cc-toolkit` | productivity | Claude Code utility toolkit. Bundles `cc-ask` to route Claude Code / Agent SDK / Anthropic API questions to the built-in `claude-code-guide` agent. |
| `context7-cli` | development | Context7 CLI tooling — bundles `ctx7` CLI skill and `find-docs` skill for library documentation lookup without the MCP server. |
| `gh-community` | development | Topic-organized refactor of `gh-cli` skill. Slim entry point + `references/` split by GitHub feature area (repos, PRs, issues, releases, Actions, secrets, gists). |

### Curated — Anthropic official (`anthropics/claude-plugins-official`)

| Plugin | Category | Description |
|---|---|---|
| `code-simplifier` | productivity | Agent that simplifies and refines code for clarity and maintainability while preserving functionality. |
| `claude-code-setup` | productivity | Analyze codebases and recommend tailored Claude Code automations (hooks, skills, MCP servers, subagents). |
| `skill-creator` | development | Create new skills, improve existing ones, and measure skill performance. |
| `plugin-dev` | development | Comprehensive toolkit for developing Claude Code plugins (hooks, MCP integration, commands, agents, best practices). |
| `hookify` | productivity | Create custom hooks to prevent unwanted behaviors by analyzing conversation patterns. |
| `pyright-lsp` | development | Python language server (Pyright) for type checking and code intelligence. |
| `typescript-lsp` | development | TypeScript/JavaScript language server for enhanced code intelligence. |
| `pr-review-toolkit` | productivity | PR review agents specialized in comments, tests, error handling, type design, code quality, simplification. |
| `claude-md-management` | productivity | Maintain and improve `CLAUDE.md` files — audit quality, capture session learnings, keep project memory current. |
| `code-review` | productivity | Automated PR code review using specialized agents with confidence-based scoring to filter false positives. |
| `commit-commands` | productivity | Git commit workflow commands — commit, push, PR creation. |
| `security-guidance` | security | Security reminder hook warning about command injection, XSS, and unsafe code patterns when editing files. |
| `session-report` | productivity | Generate an explorable HTML report of Claude Code session usage — tokens, cache, subagents, skills, expensive prompts. |
| `context7-plugin` | development | Upstash Context7 MCP server for up-to-date, version-specific documentation lookup. |

### Curated — Other sources

| Plugin | Category | Description |
|---|---|---|
| `chrome-devtools-mcp` | development | Control and inspect a live Chrome browser — performance traces, network requests, console messages, Puppeteer automation. |
| `document-skills` | productivity | Document processing suite for `xlsx`, `docx`, `pptx`, `pdf` — official Anthropic skills. |
| `langfuse` | development | Langfuse LLM observability — query traces, scores, sessions, prompts via CLI; instrument apps. |
| `vercel-labs` | productivity | Curated skills from Vercel Labs. Bundles `find-skills` to discover and install agent skills from the open ecosystem. |

## How to Add a Plugin to Claude Code

### Prerequisite

A version of Claude Code that supports the `/plugin` command. If `/plugin` is unrecognized, update Claude Code first:

```bash
claude update
```

### Step 1 — Add this marketplace

GitHub shorthand (recommended):

```bash
/plugin marketplace add vinhltt/agent-plugins
```

Or full Git URL:

```bash
/plugin marketplace add https://github.com/vinhltt/agent-plugins.git
```

Claude Code clones the repo, validates `.claude-plugin/marketplace.json`, and registers it under the name **`agent-plugins-marketplace`**.

### Step 2 — Browse plugins

```bash
/plugin
```

This opens the interactive plugin browser. You will see plugins from every marketplace you have added, including this one. Filter by category or name to narrow the list.

### Step 3 — Install a specific plugin

```bash
/plugin install <plugin-name>@agent-plugins-marketplace
```

Concrete example — install the GitHub CLI helper:

```bash
/plugin install gh-community@agent-plugins-marketplace
```

Claude Code fetches the plugin (either from this repo's `plugins/` folder or from its upstream source defined in `marketplace.json`) and activates its skills, agents, hooks, and commands automatically.

### Step 4 — Update or remove

Pull the latest version of every plugin in the marketplace:

```bash
/plugin marketplace update agent-plugins-marketplace
```

Uninstall a plugin you no longer need:

```bash
/plugin uninstall <plugin-name>@agent-plugins-marketplace
```

Remove the marketplace entirely:

```bash
/plugin marketplace remove agent-plugins-marketplace
```

## Categories at a Glance

- **productivity** — `cc-toolkit`, `code-simplifier`, `claude-code-setup`, `hookify`, `pr-review-toolkit`, `claude-md-management`, `code-review`, `commit-commands`, `session-report`, `document-skills`, `vercel-labs`
- **development** — `context7-cli`, `gh-community`, `skill-creator`, `plugin-dev`, `pyright-lsp`, `typescript-lsp`, `context7-plugin`, `chrome-devtools-mcp`, `langfuse`
- **security** — `security-guidance`

## Versioning & Updates

- Each plugin follows **Semantic Versioning** independently. Versions and integrity checksums are tracked in [`manifest.json`](./manifest.json).
- The marketplace itself has its own version (currently `0.8.1`) bumped whenever entries are added, removed, or upgraded.
- See [`CHANGELOG.md`](./CHANGELOG.md) for the full release history.
- Run `/plugin marketplace update agent-plugins-marketplace` periodically to receive new plugins and upstream upgrades.

## License

Released under the [MIT License](./LICENSE).

## Author

**VinhLTT** — <vinhltt.dev@gmail.com>

Issues and feedback: <https://github.com/vinhltt/agent-plugins/issues>
