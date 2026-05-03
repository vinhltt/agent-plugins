---
name: gh-cli
description: GitHub CLI (gh) automation for repos, issues, pull requests, releases, Actions workflows, secrets, gists, codespaces. Topic-organized progressive disclosure — SKILL.md = decision tree + top patterns; references/ = deep details per command group. Trigger when user runs any `gh ...` command, manages GitHub repos via CLI, automates PRs/issues/releases, debugs Actions, or works with GitHub from terminal.
metadata:
  version: "0.1.0"
---

# GitHub CLI (gh)

Topic-organized reference for `gh` (GitHub CLI v2.85+). Slim overview here;
load the relevant `references/*.md` when going deep.

**Upstream baseline:** `github/awesome-copilot@90921cc` (see `CHANGELOG.md`).

## Decision tree — pick the right reference

| User intent | Load |
|---|---|
| Login, token, account switch, setup-git | `references/auth.md` |
| Create/clone/fork/list/edit/delete repo, browse repo URL, sync fork, deploy keys | `references/repos.md` |
| Create/list/view/edit/close/comment/lock/transfer/pin/develop issue | `references/issues.md` |
| Create/list/view/checkout/diff/merge/edit/review/comment/checks/revert PR | `references/pull-requests.md` |
| Create/list/view/edit/delete release, upload/download assets | `references/releases.md` |
| Run workflow, view logs, list workflows, manage Actions caches | `references/workflows.md` |
| Set/list/delete Actions/Codespaces/Dependabot secrets and variables | `references/secrets.md` |
| Raw REST/GraphQL via `gh api`; cross-repo `gh search` | `references/api-search.md` |
| Project, gist, codespace, org, label, ssh-key, gpg-key, status, config, extension, alias, ruleset, attestation, completion, agent-task; full CLI tree; env vars | `references/extras.md` |

## Pre-flight checks

```bash
gh --version            # confirm install (need 2.85+ for current refs)
gh auth status          # confirm token + scopes; fail fast if no auth
gh repo set-default     # ensure repo context for cwd
```

If `gh` missing → install per `references/extras.md` "CLI Structure" or
[cli.github.com](https://cli.github.com/). If unauthenticated → `gh auth login`.

## Top inline patterns

These five recipes cover ~80% of agent use-cases. Anything deeper → load reference.

### 1. Auth status check (always run before any state-changing op)

```bash
gh auth status
# If "not logged in" → gh auth login --web
# If wrong scopes → gh auth refresh -s repo,workflow,admin:org
```

### 2. Create PR with body + labels + reviewer

```bash
gh pr create \
  --title "feat: add user search" \
  --body "$(cat <<'EOF'
## Summary
- Adds /api/users/search endpoint
- Indexes name + email

## Test plan
- [ ] Unit tests pass
- [ ] Manual smoke against staging
EOF
)" \
  --label feature --reviewer alice,bob --base main
```

### 3. Issue triage (list + bulk-comment + close)

```bash
# Stale issues — no activity 90+ days
gh issue list --state open --json number,updatedAt --jq \
  '.[] | select(.updatedAt < (now - 90*86400 | strftime("%Y-%m-%dT%H:%M:%SZ"))) | .number' \
  | xargs -I{} gh issue comment {} --body "Closing as stale; please reopen if still relevant."
```

### 4. Release with assets

```bash
gh release create v1.2.0 \
  --title "v1.2.0" --notes-file CHANGELOG.md \
  ./dist/app-linux-x64.tar.gz ./dist/app-macos-arm64.tar.gz#"macOS arm64 build"
```

### 5. Watch latest workflow run + grab logs on failure

```bash
gh run watch                                # interactive
gh run view --log-failed                    # last failed run logs
gh run list --workflow=ci.yml --limit 5 --json databaseId,conclusion
```

## Cross-cutting essentials

### JSON output + jq filtering (vital for agent consumption)

Every list/view command supports `--json field1,field2` and `--jq <expr>`:

```bash
gh pr list --state open --json number,title,headRefName --jq '.[] | "\(.number)\t\(.title)"'
gh repo view --json name,defaultBranchRef --jq '.defaultBranchRef.name'
gh api repos/{owner}/{repo}/issues --jq '.[].number'
```

### Authentication via env

```bash
export GH_TOKEN=ghp_xxx                # CI / non-interactive
export GH_HOST=ghe.example.com         # GitHub Enterprise
export GH_REPO=owner/repo              # override default repo for current shell
```

### Common global flags

| Flag | Purpose |
|---|---|
| `-R owner/repo`, `--repo owner/repo` | Override repo context |
| `--json <fields>` | Structured output |
| `--jq <expr>` | jq filter on `--json` output |
| `--template <go-tmpl>` | Go-template formatting |
| `--paginate` (`gh api`) | Auto-follow `Link: rel="next"` |
| `--hostname <host>` | Target GHE / non-default host |

### Rate limits

- Unauthenticated: 60 req/hr → almost always authenticate.
- Authenticated personal token: 5,000 req/hr.
- GitHub App: 15,000 req/hr.
- Check: `gh api rate_limit --jq .rate`.

## Best practices (short list)

- **Always** check `gh auth status` before destructive ops in scripts.
- Prefer `--json` + `--jq` over text scraping — output is stable contract.
- Use `gh api --paginate` for any list endpoint that may exceed 30 items.
- Set `GH_REPO` once per shell session instead of `-R` on every command.
- For CI: pass `GH_TOKEN` via secret; never hardcode.
- For destructive ops (`gh repo delete`, `gh release delete`), expect interactive confirm — pass `--yes` only when scripted.

## Common workflow recipes (cross-cutting)

### Bulk operations on issues/PRs

```bash
# Bulk-close stale issues
gh issue list --label stale --json number --jq '.[].number' \
  | xargs -I{} gh issue close {} --comment "Closing per stale policy"

# Bulk-add label to PRs touching specific path
gh pr list --json number,files --jq '.[] | select(.files[].path | startswith("docs/")) | .number' \
  | xargs -I{} gh pr edit {} --add-label documentation
```

For specific workflow recipes, see:

- **PR-from-Issue:** `references/pull-requests.md` → "Workflow: Create PR from Issue"
- **Repo Setup / Fork Sync:** `references/repos.md` → "Workflow: ..."
- **CI/CD setup:** `references/workflows.md` → "Workflow: CI/CD"

## Getting help

```bash
gh help                          # top-level command list
gh <command> --help              # any command's flags + examples
gh api --help                    # raw API request guide
```

Online: <https://cli.github.com/manual/>

## What's not in SKILL.md

Anything not in the decision tree or top patterns above lives in
`references/`. Don't guess — load the reference. The split is by `gh`
subcommand-namespace, not arbitrary chunks.
