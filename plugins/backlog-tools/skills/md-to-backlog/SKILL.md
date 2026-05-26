---
name: md-to-backlog
description: "Converts Markdown to Backlog wiki format via a Python script. Use when: 'md-to-backlog', 'format for Backlog', 'convert to Backlog', 'Backlog format', 'paste into Backlog', 'PR description for Backlog', 'Backlog wiki syntax'. Transforms headers, bold, italic, lists, tables, code blocks, links from Markdown to Backlog's proprietary formatting."
metadata:
  version: 0.1.0
---

# md-to-backlog

Convert Markdown text to Backlog's proprietary wiki/formatting syntax.

## Script Path Resolution

All scripts live in `scripts/` relative to this SKILL.md:

```bash
# SCRIPT_DIR = <directory containing this SKILL.md>/scripts
```

## Usage

```bash
# File input → stdout
python "$SCRIPT_DIR/md2backlog.py" input.md

# File input → file output
python "$SCRIPT_DIR/md2backlog.py" input.md -o output.txt

# Stdin → stdout
cat input.md | python "$SCRIPT_DIR/md2backlog.py"
```

## Backlog Syntax Quick Reference

Source: https://nulab.com/backlog/enterprise/help-guide/users-guide/rules-to-formatting-texts-backlog/

| Element | Markdown | Backlog |
|---------|----------|---------|
| Header 1 | `# Text` | `* Text` |
| Header 2 | `## Text` | `** Text` |
| Header 3 | `### Text` | `*** Text` |
| Bold | `**text**` | `''text''` |
| Italic | `*text*` | `'''text'''` |
| Strikethrough | `~~text~~` | `%%text%%` |
| Bullet list | `- item` | `- item` |
| Nested bullet | `  - item` | `-- item` |
| Numbered list | `1. item` | `+ item` |
| Link | `[label](url)` | `[[label>url]]` |
| Code block | ` ```lang ` | `{code:lang}` |
| Code end | ` ``` ` | `{/code}` |
| Quote | `> text` | `> text` |
| Table header | `\| H1 \| H2 \|` + alignment row | `\|H1\|H2\|h` |
| Table row | `\| C1 \| C2 \|` | `\|C1\|C2\|` |
| Color | N/A | `&color(red) {text}` |
| Break | N/A | `&br;` |
| Issue link | N/A | `[[MRR-1997]]` or just `MRR-1997` |
| Wiki link | N/A | `[[WikiPageName]]` |
| Checkbox | `- [ ] item` | `- [ ] item` |
| Image | `![alt](url)` | `#image(id)` (attached only) |
| Index | N/A | `#contents` |

## Conversion Rules

The script applies these transformations in order:

1. **Code blocks** — fenced ` ``` ` → `{code}`/`{/code}` (content preserved as-is)
2. **Horizontal rules** — `---`, `***`, `___` → empty line
3. **Headers** — `# ` → `* `, `## ` → `** `, `### ` → `*** ` (max 3 levels)
4. **Unordered lists** — indent depth → dash count (`-`, `--`, `---`)
5. **Ordered lists** — `1.` → `+`, nested → `++`
6. **Checkboxes** — `- [ ]`/`- [x]` preserved with dash-level nesting
7. **Tables** — alignment row removed, header row gets `h` suffix
8. **Blockquotes** — `> ` syntax identical, passed through
9. **Inline bold** — `**text**` → `''text''`
10. **Inline italic** — `*text*` → `'''text'''`
11. **Inline strikethrough** — `~~text~~` → `%%text%%`
12. **Links** — `[label](url)` → `[[label>url]]`

## Notes

- Backlog supports max 3 header levels (`*`, `**`, `***`). `####`+ mapped to `***`.
- `*` as Markdown list marker is converted to `-` to avoid Backlog header conflict.
- Inline code (`` `code` ``) kept as-is — Backlog renders backticks literally.
- Images `![alt](url)` converted to link format since Backlog images use `#image(id)` for attachments.
