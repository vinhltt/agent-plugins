---
description: "Spawn researcher agent for systematic technical investigation. Default output: ./research/{YYMMDD-HHMM}-{slug}.md"
argument-hint: "<topic> [--output <path>]"
---

# /research

Dispatch the `researcher` agent to investigate `<topic>` and write a structured markdown report.

## Arguments

`$ARGUMENTS` contains the topic plus an optional `--output <path>` override.

Parse rules:
1. If `$ARGUMENTS` contains ` --output ` (or ends with `--output <path>`), the trailing `--output <path>` is the override; everything before it is the topic.
2. Otherwise the entire `$ARGUMENTS` is the topic.

## Execution Steps

1. **Resolve `output_path`**:
   - If `--output <path>` was provided → `output_path = <path>` (expand `~` and relative paths against CWD).
   - Else → derive a slug from the topic:
     - Lowercase, replace non-alphanumeric runs with `-`, strip leading/trailing `-`.
     - Take the first 4-6 words; cap total slug length at 60 chars.
   - Compute timestamp via Bash: `date +%y%m%d-%H%M`.
   - `output_path = ./research/<YYMMDD-HHMM>-<slug>.md`.

2. **Ensure parent dir exists** (auto-mkdir, no prompt):
   ```bash
   mkdir -p "$(dirname "<output_path>")"
   ```

3. **Spawn the agent** via the Task tool:
   - `subagent_type`: `"researcher"` (bare). If the loader rejects bare names, retry with `"research-toolkit:researcher"`.
   - `description`: `"Research <topic>"` (≤5 words).
   - `prompt`:
     ```
     Topic: <topic>
     Output path: <output_path> (parent dir already created; write the final report here)

     Conduct structured technical research per your Behavioral Checklist.
     Save the report to the output path. Do not start any implementation —
     research and report only.
     ```

4. **Report back**: when the agent finishes, surface the absolute `output_path` so the user can open it.

## Examples

- `/research React Server Components` → `./research/260507-1034-react-server-components.md`
- `/research API rate limiting --output /tmp/rl.md` → `/tmp/rl.md`
- `/research "OAuth2 PKCE flow security"` → `./research/260507-1034-oauth2-pkce-flow-security.md`
