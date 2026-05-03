# gh-community

Custom topic-organized refactor of the `gh-cli` skill from
[github/awesome-copilot](https://github.com/github/awesome-copilot).

## Purpose

The upstream `skills/gh-cli/SKILL.md` is a single ~40KB monolith. This plugin
splits it into a slim `SKILL.md` + per-topic `references/*.md` per the
skill-creator progressive-disclosure best practice, so agents only load the
chunk relevant to the user's `gh` subcommand.

## Layout

```
plugins/gh-community/skills/gh-cli/
├── SKILL.md              # decision tree + topic index (<300 lines)
├── CHANGELOG.md          # upstream tracking + local change log
└── references/
    ├── auth.md           # gh auth ...
    ├── repos.md          # gh repo ...
    ├── issues.md         # gh issue ...
    ├── pull-requests.md  # gh pr ...
    ├── releases.md       # gh release ...
    ├── workflows.md      # gh workflow / run / cache
    ├── api-search.md     # gh api / gh search
    ├── secrets.md        # gh secret / variable
    └── extras.md         # gist, project, gpg-key, ssh-key, alias, extension, config, codespace
```

## Upstream attribution

Source: [`github/awesome-copilot`](https://github.com/github/awesome-copilot)
under its repository license. Track upstream baseline in
[`skills/gh-cli/CHANGELOG.md`](skills/gh-cli/CHANGELOG.md).

## Updating from upstream

This plugin is a manual fork of the upstream `gh-cli` skill — there is no
auto-sync. The companion internal mirror plugin `gh-official` (not registered
in the marketplace) tracks upstream as source-of-truth.

To check whether upstream `github/awesome-copilot/skills/gh-cli` has new
changes since this fork's baseline:

1. **Refresh the mirror:**

   ```bash
   cd projects/agent-plugins
   bun scripts/ts/sync.ts --plugin=gh-official
   ```

2. **Compare commit SHAs:**

   ```bash
   # Mirror's current upstream
   jq -r .upstream.commit_sha plugins/gh-official/.sync-manifest.json
   # Fork's recorded baseline
   grep -A1 'commit_sha:' plugins/gh-community/skills/gh-cli/CHANGELOG.md | head -1
   ```

3. **If different — port relevant changes:**

   ```bash
   # Diff upstream SKILL.md vs prior version
   git -C projects/agent-plugins log --oneline -- plugins/gh-official/skills/gh-cli/SKILL.md
   git -C projects/agent-plugins diff <prev-sha>..HEAD -- plugins/gh-official/skills/gh-cli/SKILL.md
   ```

   Apply relevant deltas to
   `plugins/gh-community/skills/gh-cli/{SKILL.md, references/*.md}` keeping the
   topic split intact.

4. **Update the baseline:**

   Bump `commit_sha` in `plugins/gh-community/skills/gh-cli/CHANGELOG.md`
   `## Upstream base` to the new SHA, add a `## Local changes` entry
   describing what was ported.

5. **Bump versions + regenerate manifest:**

   Run the `agent-plugins-changelog` skill (or
   `bun .claude/skills/agent-plugins-changelog/scripts/manifest.ts compute --root=. --write`)
   and bump `marketplace.json.metadata.version` accordingly.
