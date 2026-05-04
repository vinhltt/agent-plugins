# cc-toolkit

Claude Code utility toolkit. A growing collection of skills that help you
work *with* Claude Code itself — settings, hooks, slash commands, MCP,
plugins, the Agent SDK, and the Anthropic API.

## Skills

| Skill | Purpose |
|-------|---------|
| [`cc-ask`](skills/cc-ask/SKILL.md) | Route Claude Code / Agent SDK / Anthropic API questions to the built-in `claude-code-guide` agent. |

More skills planned: `cc-settings` (audit `settings.json`),
`cc-hook-scaffold` (generate hook templates), `cc-mcp-setup` (configure
MCP servers).

## Layout

```
plugins/cc-toolkit/
├── README.md
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── cc-ask/
        ├── SKILL.md
        ├── manifest.json
        └── CHANGELOG.md
```

## Install

From the `agent-plugins-marketplace` (this repo):

```text
/plugin marketplace add vinhltt/agent-plugins
/plugin install cc-toolkit@agent-plugins-marketplace
```

Or from a local checkout:

```text
/plugin marketplace add /path/to/agent-plugins
/plugin install cc-toolkit@agent-plugins-marketplace
```

Restart the session after install so skills register.

## How `cc-ask` works

`cc-ask` is a thin router. When the user asks a Claude Code / Agent SDK /
Anthropic API question, the skill delegates to the built-in
`claude-code-guide` agent (`Task` for the first question,
`SendMessage` for follow-ups) and relays the answer verbatim. The agent has
up-to-date docs that training data lacks.

Requires a Claude Code build that ships the `claude-code-guide` agent.

## Author

VinhLTT — <vinhltt.dev@gmail.com>
