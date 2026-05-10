# plugins-toolkit

Tooling for Claude Code plugin authors.

## Skills

### [plugin-bump](./skills/plugin-bump/SKILL.md)

Per-plugin version bumper. Targets one plugin folder, auto-derives semver from git diff (max-wins: D=major, A=minor, M/R/C=patch), cascades version to changed components only (skills, agents, commands, hooks), generates per-plugin `CHANGELOG.md` + `manifest.json`, verifies via 5-check DoD.

```bash
bun plugins/plugins-toolkit/skills/plugin-bump/scripts/run.ts \
  --target=<absolute-path-to-plugin-folder> \
  [--since=<git-ref>] [--auto] [--dry-run] \
  [--added=<text>]... [--changed=<text>]... [--removed=<text>]...
```

## Self-bump

See `skills/plugin-bump/SKILL.md` → "Self-bump" section for the 3-tier bootstrap flow used to version this plugin itself.
