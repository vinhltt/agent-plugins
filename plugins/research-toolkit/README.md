# research-toolkit

Deep research toolkit for Claude Code. Bundles `docs-seeker` + `research`
skills and a `researcher` agent for systematic technical investigation
via ctx7 CLI (context7-cli plugin), GitHub MCP, WebFetch, WebSearch —
with optional Gemini CLI fan-out for large-context synthesis.

Forked from pavkit's `pav-speckit-utils` marketplace, scrubbed of all
pav-stack dependencies. Standalone, no `.specify.json` required.

## Skills & Agents

| Component | Type | Purpose |
|-----------|------|---------|
| [`docs-seeker`](skills/docs-seeker/SKILL.md) | Skill | Pull authoritative docs via ctx7 CLI (context7-cli skill), GitHub MCP, WebFetch, WebSearch with confidence scoring. |
| `research` | Skill (phase 2) | Run a structured research loop and emit a markdown report. Optional Gemini CLI for high-token synthesis. |
| `researcher` | Agent (phase 3) | Autonomous deep-research operator. Caller passes `output_path`; agent investigates and writes the report. |
| `/research` | Command (phase 3) | Thin dispatcher: `/research <topic>` → spawn `researcher` agent with default `output_path`. |

## Layout

```
plugins/research-toolkit/
├── README.md
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── docs-seeker/
        ├── SKILL.md
        ├── manifest.json
        └── CHANGELOG.md
```

`agents/`, `commands/`, and `skills/research/` arrive in subsequent phases.

## Install

From the `agent-plugins-marketplace` (this repo):

```text
/plugin marketplace add vinhltt/agent-plugins
/plugin install research-toolkit@agent-plugins-marketplace
```

Or from a local checkout:

```text
/plugin marketplace add /path/to/agent-plugins
/plugin install research-toolkit@agent-plugins-marketplace
```

Restart the Claude Code session after install so skills, agents, and
commands register.

## Usage

```text
/research <topic>
```

Spawns the `researcher` agent. The agent investigates the topic across
the configured sources and writes a markdown report to the default
`output_path` (auto-created if missing). Pass an explicit path via the
agent invocation when calling `Task` directly:

```text
Task(subagent_type="researcher",
     prompt="Investigate <topic>. Write report to <output_path>.")
```

## Configuration — `.agent-plugins.json`

Lookup order: project root → `~/.agent-plugins.json` (global) → defaults.

```jsonc
{
  "skills": {
    "research": {
      "useGemini": false,         // opt-in Gemini CLI for large-context synthesis
      "defaultOutputDir": "plans/reports"
    }
  },
  "gemini": {
    "model": "gemini-2.5-pro",    // ignored when skills.research.useGemini = false
    "cli": "gemini"               // override binary name/path if needed
  }
}
```

All keys optional. Missing file ⇒ all defaults.

## Plugin Dependencies

`docs-seeker` delegates library docs queries to the `context7-cli` plugin
(skill `context7-cli`). Install it from the same agent-plugins
marketplace:

| Plugin | Purpose | Required |
|--------|---------|----------|
| `context7-cli` | ctx7 CLI for library docs (delegate target) | **Required** |
| `github` (MCP) | Read repo files (README, docs/, llms.txt) | Optional fallback |

If `context7-cli` plugin is unavailable, `docs-seeker` automatically falls
back to WebFetch against `https://context7.com/{org}/{repo}/llms.txt`
(same data source). Skills degrade gracefully when an MCP server is
absent: they fall back to WebFetch + WebSearch with a lower confidence
score in the report.

GitHub MCP server install: https://github.com/github/github-mcp-server

Optional: `gemini` CLI for high-token synthesis. Install via
`npm i -g @google/gemini-cli` and authenticate per Google docs. Only
invoked when `skills.research.useGemini = true`.

## Author

VinhLTT — <vinhltt.dev@gmail.com>
