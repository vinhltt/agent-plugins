---
name: cc-ask
description: Answer questions about Claude Code (the CLI tool), the Claude Agent SDK, and the Anthropic API by delegating to the built-in `claude-code-guide` agent. Trigger when the user asks about Claude Code features, hooks, slash commands, MCP servers, settings, IDE integrations, plugins, subagents, skills, the Agent SDK, or the Anthropic / Claude API (tool use, prompt caching, streaming, multimodal, batch). Skill is a thin router — it does not pre-process the question; it forwards verbatim to the agent and relays the response. Output language follows the user's language; the skill itself reasons in English.
metadata:
  version: "0.1.0"
  author: VinhLTT
---

# cc-ask

Thin router that forwards Claude Code / Agent SDK / Anthropic API questions to
the built-in `claude-code-guide` agent. No pre-processing, no summarization on
the way back — just relay.

## When to use

Trigger for questions about:

- **Claude Code (CLI):** features, hooks, slash commands, MCP servers,
  settings (`settings.json`), IDE extensions (VS Code / JetBrains), keyboard
  shortcuts, plugins, marketplaces, subagents, skills, output styles.
- **Claude Agent SDK:** building custom agents, tool definitions, lifecycle.
- **Anthropic API / Claude API:** tool use, prompt caching, streaming,
  multimodal, batch, files, citations — anything Anthropic-SDK shaped.

Example phrasings:

- "How do I create a hook in Claude Code?"
- "Does Claude Code support X?"
- "How do I configure MCP in Claude Code?"
- "Does the Anthropic API support prompt caching?"
- "How do I build a subagent with the Agent SDK?"

The skill activates regardless of which language the user writes in —
match on intent (Claude Code / Agent SDK / Anthropic API), not on
language.

## When to skip

- User wants to **write code** that uses the Anthropic SDK (use
  `/ck:claude-api` skill instead — it's eval-driven and writes caching).
- User wants to **build** a Claude Code plugin (use `/ck:plugin-dev`).
- General programming / debugging questions unrelated to Claude Code or
  Anthropic SDKs.

## Delegation pattern

The skill **must** delegate to agent `claude-code-guide` — do not answer
from training data. Reason: Claude Code ships frequent feature updates that
training cuts cannot keep up with; the agent has up-to-date sources.

### Decision: Task vs SendMessage

| Situation | Action |
|-----------|--------|
| First question this session | `Task(subagent_type="claude-code-guide", prompt="<verbatim user question>")` |
| `claude-code-guide` already running or recently completed in this session | `SendMessage({to: "claude-code-guide", message: "<verbatim user question>"})` to continue with full prior context |

Check the running agent list before calling `Task` — reusing an existing
agent preserves its conversation context and is cheaper.

### Forwarding rules

- Forward the user's question **verbatim**. Do not paraphrase, do not add
  context the user did not provide.
- If the question references local files / config, include the relevant path
  in the prompt so the agent can read it.
- Relay the agent's response back to the user without summarizing or
  re-formatting. The agent's output is the answer.

## Inputs

| Param | Required | Source |
|-------|----------|--------|
| `question` | yes | The user's prompt, forwarded verbatim |
| `context_paths` | optional | File paths the user referenced (e.g. `.claude/settings.json`) |

## Result handling

- Agent's response → relay to user as-is.
- If agent returns `BLOCKED` / `NEEDS_CONTEXT`, surface the request to the
  user (e.g. "the guide agent needs to know which Claude Code version you're
  on") and re-dispatch with the answer.
- If `claude-code-guide` agent is unavailable (older Claude Code build),
  fail loudly: tell the user to update Claude Code; do not fall back to
  training-data answers.

## Failures

| Failure | Action |
|---------|--------|
| `claude-code-guide` agent not found | Instruct user to update Claude Code; do not guess from training data |
| Agent returns generic answer ignoring local config | Re-dispatch with explicit config paths in the prompt |
| User question spans Claude Code + unrelated domain | Split: forward CC part to `claude-code-guide`, handle the rest in main agent |
