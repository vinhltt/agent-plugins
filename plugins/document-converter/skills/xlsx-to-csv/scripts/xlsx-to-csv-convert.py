#!/usr/bin/env python3
"""
XLSX to CSV Converter
Converts XLSX files to CSV with auto-detect: {dir}/ → sibling {dir}_CSV_AI/,
where {dir} is the input directory or, for a single file, its parent folder.
Each sheet becomes a separate CSV file. Preserves nested directory structure.
Explicit --source-dir NAME instead replaces the first path segment equal to NAME.
"""

from __future__ import annotations

import sys
import os
import argparse
from pathlib import Path, PurePath, PureWindowsPath
from typing import Callable

# Windows UTF-8 compatibility
CLAUDE_ROOT = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(CLAUDE_ROOT / 'scripts'))
try:
    from win_compat import ensure_utf8_stdout
    ensure_utf8_stdout()
except ImportError:
    if sys.platform == 'win32':
        import io
        if hasattr(sys.stdout, 'buffer'):
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

CSV_SUFFIX = "_CSV_AI"

OutputMapper = Callable[[PurePath], PurePath]


def build_output_path(input_path: PurePath, source_dir: str, target_dir: str) -> PurePath:
    """Replace the first path segment equal to source_dir with target_dir."""
    parts = list(input_path.parts)
    for i, part in enumerate(parts):
        if part == source_dir:
            parts[i] = target_dir
            return type(input_path)(*parts)
    # Fallback: put output in sibling target_dir folder
    return input_path.parent / target_dir / input_path.name


def compute_anchor(path: PurePath, is_dir: bool) -> PurePath:
    """Directory the auto-detected output mirrors: the input dir, or the file's parent."""
    anchor = path if is_dir else path.parent
    if not anchor.name:  # POSIX '/', drive root 'D:\', or UNC share root
        raise ValueError(
            f"Cannot auto-detect output for '{path}': it is at a filesystem root. "
            "Pass --source-dir and --target-dir explicitly."
        )
    return anchor


def validate_target_name(name: str) -> str:
    """--target-dir is a single folder name, never a path."""
    if name in ("", ".", "..") or "/" in name or "\\" in name or PureWindowsPath(name).drive:
        raise ValueError(f"--target-dir must be a single folder name, got '{name}'")
    return name


def anchored_output(xlsx: PurePath, anchor: PurePath, target_name: str) -> PurePath:
    """Mirror xlsx's path relative to anchor under a sibling folder of anchor."""
    return anchor.parent / target_name / xlsx.relative_to(anchor)


def build_output_mapper(input_path: PurePath, is_dir: bool,
                        source_dir: str | None, target_dir: str | None
                        ) -> tuple[OutputMapper, str, str]:
    """Return (mapper, source label, target label) for auto or explicit mode.

    Pure path math: no filesystem access, so it is safe for any input location
    and testable with PurePosixPath / PureWindowsPath.
    """
    if source_dir is None:
        anchor = compute_anchor(input_path, is_dir)
        name = validate_target_name(target_dir) if target_dir is not None else f"{anchor.name}{CSV_SUFFIX}"
        # Case-insensitive, trailing dots/spaces dropped: Windows/macOS treat 'DOCS' and 'docs.' as 'docs'
        if name.rstrip(" .").casefold() == anchor.name.casefold():
            raise ValueError(
                f"--target-dir '{name}' equals the source folder name; "
                "output would mix into the source tree"
            )
        return (lambda p: anchored_output(p, anchor, name)), str(anchor), str(anchor.parent / name)
    name = validate_target_name(target_dir) if target_dir is not None else f"{source_dir}{CSV_SUFFIX}"
    return (lambda p: build_output_path(p, source_dir, name)), source_dir, name


def convert_xlsx_to_csv(xlsx_path: Path, map_output: OutputMapper, overwrite: bool = False) -> tuple[list[str], int, int]:
    """Convert a single XLSX file to CSV(s). Returns (created list, skipped count, failed count).

    Failures are reported and counted, never raised, so a directory batch keeps going.
    """
    # Lazy import keeps path logic and --help usable without pandas installed
    import pandas as pd

    created = []
    skipped = 0
    try:
        all_sheets = pd.read_excel(str(xlsx_path), sheet_name=None, dtype=str)
    except Exception as e:
        print(f"  ERROR reading {xlsx_path}: {e}")
        return created, skipped, 1

    base_output = Path(map_output(xlsx_path))
    output_dir = base_output.parent
    stem = base_output.stem

    try:
        os.makedirs(output_dir, exist_ok=True)
    except OSError as e:
        print(f"  ERROR writing {output_dir}: {e}")
        return created, skipped, len(all_sheets)

    failed = 0
    sheet_names = list(all_sheets.keys())
    for sheet_name, df in all_sheets.items():
        if len(sheet_names) == 1:
            csv_name = f"{stem}.csv"
        else:
            # Sanitize sheet name for filename
            safe_name = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in sheet_name).strip()
            csv_name = f"{stem}_{safe_name}.csv"

        csv_path = output_dir / csv_name
        if csv_path.exists() and not overwrite:
            skipped += 1
            print(f"  [SKIP] {csv_path}")
            continue
        try:
            df.to_csv(str(csv_path), index=False, encoding='utf-8-sig')
        except OSError as e:
            print(f"  ERROR writing {csv_path}: {e}")
            failed += 1
            continue
        created.append(str(csv_path))
        print(f"  -> {csv_path}")

    return created, skipped, failed


def convert_directory(dir_path: Path, map_output: OutputMapper, overwrite: bool = False) -> tuple[list[str], int, int]:
    """Recursively find and convert all XLSX files in directory."""
    all_created = []
    total_skipped = 0
    total_failed = 0
    xlsx_files = sorted(dir_path.rglob("*.xlsx"))

    if not xlsx_files:
        print(f"No .xlsx files found in {dir_path}")
        return all_created, total_skipped, total_failed

    print(f"Found {len(xlsx_files)} XLSX file(s) in {dir_path}\n")

    for xlsx_file in xlsx_files:
        # Skip temp/hidden files
        if xlsx_file.name.startswith('~$'):
            continue
        print(f"Converting: {xlsx_file}")
        created, skipped, failed = convert_xlsx_to_csv(xlsx_file, map_output, overwrite)
        all_created.extend(created)
        total_skipped += skipped
        total_failed += failed

    return all_created, total_skipped, total_failed


def main():
    parser = argparse.ArgumentParser(
        description="Convert XLSX files to CSV. Auto-detect writes to a sibling {dir}_CSV_AI folder, "
                    "where {dir} is the input directory or the file's parent folder."
    )
    parser.add_argument("path", help="Path to XLSX file or directory containing XLSX files")
    parser.add_argument("--source-dir", default=None,
                        help="Replace the first path segment equal to this name with --target-dir "
                             "(default: auto-detect from path)")
    parser.add_argument("--target-dir", default=None,
                        help="Output folder name, not a path (default: {dir}_CSV_AI or {source-dir}_CSV_AI)")
    parser.add_argument("--overwrite", action="store_true",
                        help="Overwrite existing CSV files (default: skip existing)")
    args = parser.parse_args()

    # abspath (not resolve) keeps symlinked folders as typed, so output lands beside the given path
    target = Path(os.path.abspath(args.path))

    if not target.exists():
        print(f"Error: {target} does not exist")
        sys.exit(1)

    is_dir = target.is_dir()
    if not is_dir and not target.is_file():
        print(f"Error: {target} is not a file or directory")
        sys.exit(1)
    if not is_dir and target.suffix.lower() != '.xlsx':
        print(f"Error: {target} is not an .xlsx file")
        sys.exit(1)

    try:
        map_output, source_label, target_label = build_output_mapper(
            target, is_dir, args.source_dir, args.target_dir)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    if args.source_dir is None:
        print(f"Auto-detected: {source_label} → {target_label}")
    else:
        print(f"Source: {source_label} → Target: {target_label}")

    if is_dir:
        created, skipped, failed = convert_directory(target, map_output, args.overwrite)
    else:
        print(f"Converting: {target}")
        created, skipped, failed = convert_xlsx_to_csv(target, map_output, args.overwrite)

    print(f"\nDone. {len(created)} created, {skipped} skipped, {failed} failed.")
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
