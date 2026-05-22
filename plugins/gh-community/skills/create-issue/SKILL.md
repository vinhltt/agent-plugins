---
name: create-issue
description: Capture a brainstormed idea, proposal, or follow-up as a GitHub issue on a configurable `--repo` via the local `gh` CLI. Supports file-based input (brainstorm reports, phase files, plan docs) with adaptive body extraction, GitHub MCP detection with gh CLI fallback, and repo auto-detect from git context. Trigger when the user says "create issue", "capture this idea", "open GitHub issue", "file an issue", "create issue from this file", "turn this brainstorm into an issue", or points at a .md file path.
metadata:
  version: "0.2.0"
  author: VinhLTT
---

# create-issue

Capture an idea — typically the output of a brainstorm — as a GitHub issue on
any repo via `gh`. Supports free-form idea capture and file-based input from
`.md` files. No scripts, no token embedding.

## When to use

- "create an issue", "capture this idea", "open a GitHub issue", "file an issue".
- "create issue from this file", "turn this brainstorm into an issue", user
  points at a `.md` file path.
- End-of-brainstorm hand-off: agent just produced a brainstorm/proposal and
  user wants it tracked.
- Any free-form idea capture where the target is GitHub Issues.

Skip when: user wants a PR, a comment on an existing issue, or a non-GitHub
tracker.

## Inputs

| Param      | Required | Source                                          |
|------------|----------|-------------------------------------------------|
| `file`     | no       | Path to `.md` file — triggers file-based mode   |
| `repo`     | no       | `owner/repo` — overrides auto-detect            |
| `title`    | no       | Derive from brainstorm topic / first sentence    |
| `body`     | no       | Fill template from context or extract from file  |
| `label`    | no       | Only if user names one — do **not** default      |
| `--auto`   | no       | Skip repo confirmation prompt                    |
| `--dry-run`| no       | Preview issue (title + body) without creating    |

## GitHub Tool Detection

At invocation, check which GitHub tool is available (in priority order):

1. **MCP path:** If `mcp__github__create_issue` (or similar `mcp__github__*`
   issue-creation tool) appears in your available tools, use it directly —
   pass `repo`, `title`, `body`, `labels` as parameters.
2. **CLI path:** Otherwise, run pre-flight checks below and use `gh issue create`.
3. **Neither:** Stop. Instruct user to install gh CLI via <https://cli.github.com/>
   or configure a GitHub MCP server.

Today the MCP path is future-proof shape only — gh CLI is the active path.

## Pre-flight (CLI path)

```bash
gh --version       # need 2.85+
gh auth status     # MUST succeed before issue create
```

If `gh auth status` fails → stop. Instruct: `gh auth login` once on this
machine, then retry. Skill never reads or writes tokens.

## Repo Detection

Resolve the target repository in this order:

1. **`--repo owner/name` provided** → use directly, skip detection.
2. **Auto-detect from input file's git context:**
   - Resolve git root from the INPUT FILE directory (not CWD):
     `git -C <dir-of-input-file> rev-parse --show-toplevel`
   - If file is outside any git repo → stop, require `--repo` flag.
   - Query remote: `gh repo view --json nameWithOwner -q .nameWithOwner`
     (run from resolved git root).
   - Nested repos (e.g. `projects/tdk/`) resolve to their OWN remote, not parent.
3. **Free-form mode (no file):** user must provide `--repo` explicitly.

**Confirmation:** Show detected repo and ask user to confirm, unless `--auto`
flag is set.

## Mode: Free-form (existing)

When no `file` param is provided — capture from conversation context.

### Body template (4 sections — fill from context)

```markdown
## Summary
<one-paragraph what + why>

## Use Case
<who needs this, when, what problem it solves>

## Proposed Behavior
<concrete behavior / acceptance signals — bullets ok>

## Open Questions
- <question 1>
```

## Mode: File-based (adaptive extraction)

When a `file` path to a `.md` file is provided, read and extract sections adaptively.

### Section mapping

| Source sections in .md (check in order)                            | Target in GitHub issue     |
|--------------------------------------------------------------------|----------------------------|
| YAML `title:` frontmatter → first H1 heading → first sentence     | **Issue title**            |
| "Problem Statement" / "Summary" / "Overview"                       | **Summary**                |
| "Use Case"                                                         | **Use Case**               |
| "Agreed Design" / "Key Decisions" / "Implementation Steps" / "Requirements" | **Proposed Behavior** |
| "Dependencies" / "Risk" / "Blast Radius" / "Risk Assessment"      | **Context & Risks**        |
| "Open Questions" / "Next Steps" / "Unresolved Questions"          | **Open Questions**         |

- Output body uses sections in the order listed above (skip any not found).
- Title priority: YAML frontmatter `title:` > first H1 > first sentence.
- Condense extracted content to keep the issue body readable.

### Metadata mapping (opt-in)

Map frontmatter fields to GitHub labels when the label exists in the target repo:

| Frontmatter           | GitHub label format   | Condition                        |
|-----------------------|-----------------------|----------------------------------|
| `priority: P0`–`P3`  | `priority:P0`        | Label must exist in target repo  |
| `status: todo`        | `status:todo`        | Label must exist in target repo  |

Check label existence:
```bash
gh label list --repo <owner/repo> --json name -q '.[].name'
```

Labels not found → skip silently, never fail the issue creation.

## Command

### CLI path

```bash
gh issue create \
  --repo <owner/repo> \
  --title "<derived title>" \
  --body "$(cat <<'EOF'
## Summary
...
## Use Case
...
## Proposed Behavior
...
## Open Questions
- ...
EOF
)"
```

Add `--label <name>` only if user explicitly names one or metadata mapping
matched an existing label. Do not default to `proposal` / `enhancement`.

### MCP path (when available)

```
mcp__github__create_issue(
  repo: "owner/repo",
  title: "<derived title>",
  body: "<body content>",
  labels: ["<label>"]  # only if applicable
)
```

### Dry-run

With `--dry-run`: print the title and full body to stdout. Do not execute
`gh issue create` or any MCP tool. Let user review before committing.

## Result + failures

`gh issue create` prints the URL on stdout — echo back to user.

| Failure                       | Action                                       |
|-------------------------------|----------------------------------------------|
| `gh: command not found`       | Install via <https://cli.github.com/>         |
| `gh auth status` fails        | Instruct `gh auth login`                      |
| HTTP 404 on `--repo`          | Verify `owner/repo` spelling + access         |
| `unknown label`               | Re-run without `--label`                      |
| No git repo for input file    | Instruct user to provide `--repo` flag        |
| `gh repo view` fails (no remote) | Instruct user to provide `--repo` flag     |
| MCP tool not found            | Fall through to CLI path (not a failure)       |
| Label not found in repo       | Skip label, proceed with issue creation        |
