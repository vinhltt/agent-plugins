#!/usr/bin/env python3
"""
XLSX to CSV Converter
Converts XLSX files to CSV with auto-detect: {source}/ → {source}_CSV_AI/.
Each sheet becomes a separate CSV file. Preserves nested directory structure.
"""

import sys
import os
import argparse
from pathlib import Path

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

import pandas as pd


def build_output_path(input_path: Path, source_dir: str, target_dir: str) -> Path:
    """Replace source_dir segment with target_dir in the path."""
    parts = list(input_path.parts)
    for i, part in enumerate(parts):
        if part == source_dir:
            parts[i] = target_dir
            return Path(*parts)
    # Fallback: put output in sibling target_dir folder
    return input_path.parent / target_dir / input_path.name


def convert_xlsx_to_csv(xlsx_path: Path, source_dir: str, target_dir: str, overwrite: bool = False) -> tuple[list[str], int]:
    """Convert a single XLSX file to CSV(s). Returns (created list, skipped count)."""
    created = []
    skipped = 0
    try:
        all_sheets = pd.read_excel(str(xlsx_path), sheet_name=None, dtype=str)
    except Exception as e:
        print(f"  ERROR reading {xlsx_path}: {e}")
        return created, skipped

    base_output = build_output_path(xlsx_path, source_dir, target_dir)
    output_dir = base_output.parent
    stem = base_output.stem

    os.makedirs(output_dir, exist_ok=True)

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
        df.to_csv(str(csv_path), index=False, encoding='utf-8-sig')
        created.append(str(csv_path))
        print(f"  -> {csv_path}")

    return created, skipped


def convert_directory(dir_path: Path, source_dir: str, target_dir: str, overwrite: bool = False) -> tuple[list[str], int]:
    """Recursively find and convert all XLSX files in directory."""
    all_created = []
    total_skipped = 0
    xlsx_files = sorted(dir_path.rglob("*.xlsx"))

    if not xlsx_files:
        print(f"No .xlsx files found in {dir_path}")
        return all_created, total_skipped

    print(f"Found {len(xlsx_files)} XLSX file(s) in {dir_path}")
    print(f"Source: {source_dir} → Target: {target_dir}\n")

    for xlsx_file in xlsx_files:
        # Skip temp/hidden files
        if xlsx_file.name.startswith('~$'):
            continue
        print(f"Converting: {xlsx_file}")
        created, skipped = convert_xlsx_to_csv(xlsx_file, source_dir, target_dir, overwrite)
        all_created.extend(created)
        total_skipped += skipped

    return all_created, total_skipped


def auto_detect_dirs(target_path: Path) -> tuple[str, str]:
    """Auto-detect source and target directory names from input path.

    For directory input: uses directory name → {name}_CSV_AI
    For file input: walks up path to find a meaningful directory name
    """
    if target_path.is_dir():
        source = target_path.name
    else:
        # For file: find the top-level project directory
        # Walk up from file to find a directory that's a direct child of the file's "root"
        # Use the first directory component after drive/root
        parts = target_path.resolve().parts
        # Skip drive letter (e.g., 'D:\\') and find first meaningful dir
        # Heuristic: use the directory that's the immediate container of the nested structure
        # E.g., /workspace/example/a/b/file.xlsx → source = "example"
        # Find the part that matches any directory in the path
        source = target_path.parent.name  # fallback to immediate parent

        # Try to find a better source: walk up and look for the dir that
        # contains the file's relative path structure
        for i, part in enumerate(parts):
            check_path = Path(*parts[:i+1])
            if check_path.is_dir() and any(
                f.suffix.lower() == '.xlsx'
                for f in check_path.rglob('*.xlsx')
            ):
                source = part
                break

    target = f"{source}_CSV_AI"
    return source, target


def main():
    parser = argparse.ArgumentParser(
        description="Convert XLSX files to CSV. Auto-detects output directory: {source} → {source}_CSV_AI"
    )
    parser.add_argument("path", help="Path to XLSX file or directory containing XLSX files")
    parser.add_argument("--source-dir", default=None,
                        help="Source directory name to replace (default: auto-detect from path)")
    parser.add_argument("--target-dir", default=None,
                        help="Target directory name (default: {source-dir}_CSV_AI)")
    parser.add_argument("--overwrite", action="store_true",
                        help="Overwrite existing CSV files (default: skip existing)")
    args = parser.parse_args()

    target = Path(args.path).resolve()

    if not target.exists():
        print(f"Error: {target} does not exist")
        sys.exit(1)

    # Auto-detect source/target dirs if not provided
    if args.source_dir is None:
        args.source_dir, args.target_dir = auto_detect_dirs(target)
        print(f"Auto-detected: {args.source_dir} → {args.target_dir}")
    elif args.target_dir is None:
        args.target_dir = f"{args.source_dir}_CSV_AI"

    if target.is_file():
        if not target.suffix.lower() == '.xlsx':
            print(f"Error: {target} is not an .xlsx file")
            sys.exit(1)
        print(f"Converting: {target}")
        created, skipped = convert_xlsx_to_csv(target, args.source_dir, args.target_dir, args.overwrite)
    elif target.is_dir():
        created, skipped = convert_directory(target, args.source_dir, args.target_dir, args.overwrite)
    else:
        print(f"Error: {target} is not a file or directory")
        sys.exit(1)

    print(f"\nDone. {len(created)} created, {skipped} skipped.")


if __name__ == '__main__':
    main()
