#!/usr/bin/env python3
"""Convert Markdown to Backlog wiki format.

Backlog formatting reference:
https://nulab.com/backlog/enterprise/help-guide/users-guide/rules-to-formatting-texts-backlog/
"""

import argparse
import re
import sys
from pathlib import Path


def convert_inline(text: str) -> str:
    """Convert inline Markdown formatting to Backlog format."""
    # Bold: **text** or __text__ → ''text''
    text = re.sub(r'\*\*(.+?)\*\*', r"''\1''", text)
    text = re.sub(r'__(.+?)__', r"''\1''", text)

    # Italic: *text* or _text_ → '''text'''
    # Negative lookbehind/ahead to avoid matching inside words or list markers
    text = re.sub(r'(?<![\'*\w])\*([^\s*](?:.*?[^\s*])?)\*(?![\'*\w])', r"'''\1'''", text)
    text = re.sub(r'(?<![\'_\w])_([^\s_](?:.*?[^\s_])?)_(?![\'_\w])', r"'''\1'''", text)

    # Strikethrough: ~~text~~ → %%text%%
    text = re.sub(r'~~(.+?)~~', r'%%\1%%', text)

    # Links: [text](url) → [[text>url]]
    # Also handles images ![alt](url) → [[alt>url]]
    text = re.sub(r'!?\[([^\]]+)\]\(([^)]+)\)', r'[[\1>\2]]', text)

    return text


def convert_table_row(line: str, is_header: bool = False) -> str:
    """Convert Markdown table row to Backlog format."""
    cells = line.strip().split('|')
    cells = [c.strip() for c in cells]
    # Remove empty strings from leading/trailing pipes
    if cells and cells[0] == '':
        cells = cells[1:]
    if cells and cells[-1] == '':
        cells = cells[:-1]

    row = '|' + '|'.join(cells) + '|'
    if is_header:
        row += 'h'
    return row


def is_table_alignment_row(line: str) -> bool:
    """Check if a line is a Markdown table alignment row like |---|---|."""
    return bool(re.match(r'^\|[\s:|-]+\|$', line.strip()))


def get_list_level(indent: int) -> int:
    """Calculate list nesting level from indentation."""
    return (indent // 2) + 1


def convert_md_to_backlog(text: str) -> str:
    """Convert Markdown text to Backlog wiki format."""
    lines = text.split('\n')
    result = []
    in_code_block = False
    i = 0

    while i < len(lines):
        line = lines[i]

        # --- Code blocks ---
        code_fence_match = re.match(r'^(`{3,})(.*)', line.strip())
        if code_fence_match:
            if not in_code_block:
                lang = code_fence_match.group(2).strip()
                result.append(f'{{code:{lang}}}' if lang else '{code}')
                in_code_block = True
            else:
                result.append('{/code}')
                in_code_block = False
            i += 1
            continue

        if in_code_block:
            result.append(line)
            i += 1
            continue

        # --- Horizontal rule (---, ***, ___) ---
        if re.match(r'^[\s]*([-]{3,}|[*]{3,}|[_]{3,})[\s]*$', line):
            result.append('')
            i += 1
            continue

        # --- Headers ---
        header_match = re.match(r'^(#{1,6})\s+(.*)', line)
        if header_match:
            level = min(len(header_match.group(1)), 3)
            content = convert_inline(header_match.group(2).rstrip())
            result.append(f'{"*" * level} {content}')
            i += 1
            continue

        # --- Unordered lists (-, *, +) ---
        list_match = re.match(r'^(\s*)[-*+]\s+(.*)', line)
        if list_match:
            indent = len(list_match.group(1))
            content = list_match.group(2)

            level = get_list_level(indent)
            dashes = '-' * level

            # Checkbox: - [ ] or - [x]
            cb_match = re.match(r'^\[([ xX])\]\s+(.*)', content)
            if cb_match:
                check = cb_match.group(1)
                content = convert_inline(cb_match.group(2))
                result.append(f'{dashes} [{check}] {content}')
            else:
                content = convert_inline(content)
                result.append(f'{dashes} {content}')
            i += 1
            continue

        # --- Ordered lists ---
        num_match = re.match(r'^(\s*)\d+\.\s+(.*)', line)
        if num_match:
            indent = len(num_match.group(1))
            content = convert_inline(num_match.group(2))
            level = get_list_level(indent)
            result.append(f'{"+" * level} {content}')
            i += 1
            continue

        # --- Tables ---
        if line.strip().startswith('|') and '|' in line.strip()[1:]:
            # Check if next line is alignment row → current is header
            next_is_align = (
                i + 1 < len(lines) and is_table_alignment_row(lines[i + 1])
            )
            if next_is_align:
                result.append(convert_table_row(line, is_header=True))
                i += 2  # skip alignment row
            else:
                result.append(convert_table_row(line, is_header=False))
                i += 1
            continue

        # --- Blockquotes ---
        quote_match = re.match(r'^>\s?(.*)', line)
        if quote_match:
            content = convert_inline(quote_match.group(1))
            result.append(f'> {content}')
            i += 1
            continue

        # --- Regular line ---
        result.append(convert_inline(line))
        i += 1

    return '\n'.join(result)


def main():
    parser = argparse.ArgumentParser(
        description='Convert Markdown to Backlog wiki format'
    )
    parser.add_argument(
        'input', nargs='?',
        help='Input Markdown file (reads stdin if omitted)'
    )
    parser.add_argument(
        '-o', '--output',
        help='Output file (prints to stdout if omitted)'
    )

    args = parser.parse_args()

    # Read input
    if args.input:
        input_path = Path(args.input)
        if not input_path.exists():
            print(f'Error: file not found: {args.input}', file=sys.stderr)
            sys.exit(1)
        text = input_path.read_text(encoding='utf-8')
    else:
        text = sys.stdin.read()

    # Convert
    result = convert_md_to_backlog(text)

    # Output
    if args.output:
        Path(args.output).write_text(result, encoding='utf-8')
        print(f'Written to {args.output}', file=sys.stderr)
    else:
        print(result)


if __name__ == '__main__':
    main()
