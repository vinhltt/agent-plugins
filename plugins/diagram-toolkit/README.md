# diagram-toolkit

Diagram creation toolkit for agent workflows.

## Skills

| Skill | Description |
|---|---|
| `excalidraw` | Create Excalidraw diagrams for architecture, data flow, workflows, system design, and codebase maps. Supports MCP canvas mode and file-based rendering. |

## Layout

```text
plugins/diagram-toolkit/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── excalidraw/
│       ├── SKILL.md
│       ├── scripts/
│       │   └── install.sh
│       └── references/
│           ├── auto-diagram-guide.md
│           ├── color-palette.md
│           ├── design-methodology.md
│           ├── element-templates.md
│           ├── file-workflow.md
│           ├── json-schema.md
│           ├── mcp-workflow.md
│           ├── svg-layout-best-practices.md
│           ├── pyproject.toml
│           ├── render_excalidraw.py
│           ├── render_template.html
│           └── uv.lock
├── CHANGELOG.md
└── README.md
```

## Notes

- Source adapted from the local `excalidraw` skill.
- SVG layout review reference adapted from the local `tech-graph` skill.
- Generated environment and cache files are intentionally excluded.
- `excalidraw` remains the skill ID so existing trigger phrasing stays stable.
- File-based rendering setup is one command: `bash scripts/install.sh` from the skill root.

## Roadmap

- Add more diagram skills only when there is a concrete workflow gap.
