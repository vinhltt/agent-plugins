---
name: create-issue
description: Capture a brainstormed idea, proposal, or follow-up as a GitHub issue on a configurable `--repo` via the local `gh` CLI. Trigger when the user says "create issue", "capture this idea", "open GitHub issue", "file an issue", or hands off at the end of a brainstorm. Uses `gh auth` (no token handling), fails fast if unauthenticated, fills a fixed 4-section body template (Summary / Use Case / Proposed Behavior / Open Questions).
metadata:
  version: "0.1.0"
  author: VinhLTT
---

# create-issue

Capture an idea — typically the output of a brainstorm — as a GitHub issue on
any repo via `gh`. No scripts, no token embedding.

## When to use

- "create an issue", "capture this idea", "open a GitHub issue", "file an issue".
- End-of-brainstorm hand-off: agent just produced a brainstorm/proposal and
  user wants it tracked.
- Any free-form idea capture where the target is GitHub Issues.

Skip when: user wants a PR, a comment on an existing issue, or a non-GitHub
tracker.

## Inputs

| Param   | Required | Source                                          |
|---------|----------|-------------------------------------------------|
| `repo`  | yes      | User-provided in `owner/repo` form              |
| `title` | no       | Derive from brainstorm topic / first sentence   |
| `body`  | no       | Fill 4-section template from context            |
| `label` | no       | Only if user names one — do **not** default     |

## Pre-flight

```bash
gh --version       # need 2.85+
gh auth status     # MUST succeed before issue create
```

If `gh auth status` fails → stop. Instruct: `gh auth login` once on this
machine, then retry. Skill never reads or writes tokens.

## Body template (4 sections — fill from context)

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

## Command

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

Add `--label <name>` only if user explicitly names one. Do not default to
`proposal` / `enhancement` — repos vary.

## Result + failures

`gh issue create` prints the URL on stdout — echo back to user.

| Failure              | Action                                       |
|----------------------|----------------------------------------------|
| `gh: command not found` | Install via <https://cli.github.com/>     |
| `gh auth status` fails  | Instruct `gh auth login`                  |
| HTTP 404 on `--repo`    | Verify `owner/repo` spelling + access     |
| `unknown label`         | Re-run without `--label`                  |
