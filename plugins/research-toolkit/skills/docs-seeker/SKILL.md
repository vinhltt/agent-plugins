---
name: docs-seeker
description: Route library/framework docs queries (context7 docs) via ctx7 CLI — delegates to context7-cli skill. Falls back to GitHub MCP for repo files, WebFetch/WebSearch for last resort. Use for API docs, GitHub repository analysis, technical documentation lookup.
metadata:
  version: 0.1.2
---

# Documentation Seeker — Routing Guide

Route docs queries to the **best available tool** based on context.

## Tool Priority Chain

```
1. ctx7 CLI (via context7-cli skill) — Library/framework docs
   ↓ no library indexed / network fail
2. GitHub MCP                         — README, docs/, llms.txt from public repo
   ↓ MCP not configured
3. WebFetch                           — Direct URL (llms.txt, docs sites, registries)
   ↓ no URL known
4. WebSearch                          — Last resort
```

## 1. ctx7 CLI (Primary, via context7-cli skill)

Delegate to the `context7-cli` skill (invoke via `Skill` tool with `skill="context7-cli"`). It exposes the `ctx7` CLI:
- `ctx7 library <name> <query>` — resolve library ID
- `ctx7 docs <libraryId> <query>` — fetch docs (add `--research` for deep retry)

Fallback: `npx ctx7@latest <cmd>` if CLI not installed globally. If `context7-cli` plugin unavailable, skip to step 3 (WebFetch `https://context7.com/{org}/{repo}/llms.txt` — same data source).

## 2. GitHub MCP (Secondary)

Read specific files from a GitHub repo (README, docs/, llms.txt, source) that ctx7 doesn't index. Tools (read-only): `GetFileContents`, `SearchRepositories`, `SearchCode`, `GetRepositoryTree`, `ListCommits`, `ListBranches`, `ListTags`, `GetLatestRelease`.

## 3. WebFetch (Fallback) / 4. WebSearch (Last Resort)

WebFetch direct URLs: `https://context7.com/{org}/{repo}/llms.txt?topic=<keyword>`, `https://nextjs.org/llms.txt`, `https://www.nuget.org/packages/<pkg>`, `https://www.npmjs.com/package/<pkg>`. If URL unknown, `WebSearch(query: "<library> documentation <topic>")`.

## Decision Matrix

| Scenario | Tool |
|----------|------|
| Library/framework docs | ctx7 CLI (context7-cli skill) |
| Specific file from GitHub repo | GitHub MCP `GetFileContents` |
| Known doc URL or llms.txt | WebFetch |
| Version/release check | WebFetch (NuGet, npm, PyPI) |
| ctx7 rate limited | WebFetch `context7.com/{org}/{repo}/llms.txt` |
| Unknown library, no URL | WebSearch |

## Error Handling

| Error | Action |
|-------|--------|
| ctx7 returns empty | Try alt names, then GitHub MCP `SearchRepositories` |
| ctx7 rate limit (429) | Set `CONTEXT7_API_KEY` or run `ctx7 login`; else WebFetch llms.txt |
| GitHub MCP not configured | Skip to WebFetch |
| WebFetch 404 | Try WebSearch |
| All tools fail | Report to user, suggest manual URL |
