# Plugin Sync Runner

Generic Bun-native sync runner. Pulls plugin source files from upstream GitHub repos based on `sync.config.json`.

## Usage

Run from agent-plugins repo root:

```bash
bun scripts/ts/sync.ts                       # sync all plugins (write mode)
bun scripts/ts/sync.ts --check               # drift check only, exit 1 if drift
bun scripts/ts/sync.ts --plugin=context7-cli # sync specific plugin (repeatable)
bun scripts/ts/sync.ts --plugin=a --plugin=b # sync multiple
```

## Auth

Optional GitHub token to lift unauthenticated rate limits:

```bash
export GITHUB_TOKEN=ghp_...   # or any token with public_repo scope
bun scripts/ts/sync.ts --check
```

Without `GITHUB_TOKEN`, calls are unauthenticated (60 req/hr per IP).

## Adding a new plugin

Append an entry to `sync.config.json`:

```json
{
  "name": "my-plugin",
  "upstream": {
    "type": "github",
    "owner": "<owner>",
    "repo": "<repo>",
    "ref": "<branch-or-tag>"
  },
  "sources": [
    { "from": "skills/foo", "to": "skills" },
    { "from": "agents/bar", "to": "agents" }
  ]
}
```

### Mapping rules

For each `from`/`to` pair:

- `from` = upstream path prefix (no leading `/`, no `..`)
- `to` = target subdirectory under `plugins/<name>/` (no leading `/`, no `..`)
- Matched upstream blobs land at `plugins/<name>/<to>/<basename(from)>/<rest>`
- Manifest key = path relative to `<to>` directory (preserves backward-compat with the original context7-cli format)

### Validation

Config is rejected on:

- Duplicate plugin name
- Plugin name not matching `^[a-z0-9][a-z0-9-]*$`
- `upstream.type !== "github"` (other source types deferred)
- Empty `sources`
- Path traversal (`..`) or absolute path in `from` / `to`

## Per-plugin manifest

Each plugin owns `plugins/<name>/.sync-manifest.json` recording the last synced commit SHA + per-blob SHAs. `--check` compares stored SHAs against fresh upstream tree without fetching raw content.

## Failure modes

- Per-plugin failures are logged and other plugins continue (fail-soft); exit code = 1 if any failed.
- Tree truncation throws (only matters for very large repos).
- Drift in `--check` lists each diverged file and exits 1.
