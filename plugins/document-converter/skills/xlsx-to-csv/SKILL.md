---
name: xlsx-to-csv
description: >
  Convert XLSX files to CSV format. Auto-detect writes output to a sibling
  `{dir}_CSV_AI` folder of the input directory (directory input) or of the
  file's parent folder (single-file input), preserving internal folder
  structure. Each sheet becomes a separate CSV. Supports single file or
  recursive directory conversion. Works with any directory name.
metadata:
  version: 0.2.0
---

# XLSX to CSV Converter

Converts XLSX files to CSV. Auto-maps output: `{dir}/` → sibling `{dir}_CSV_AI/`, preserving nested paths. For a single file, `{dir}` is the file's parent folder.

## Usage

### Directory (auto-detect — recommended)
```bash
python scripts/xlsx-to-csv-convert.py "/path/to/example/"
# → outputs to /path/to/example_CSV_AI/...
```

### Single file
```bash
python scripts/xlsx-to-csv-convert.py "/path/to/example/a/b/file.xlsx"
# → outputs to /path/to/example/a/b_CSV_AI/file.csv
```
To mirror a higher folder instead (`/path/to/example_CSV_AI/a/b/file.csv`), pass `--source-dir example`.

### Custom source/target names (override auto-detect)
```bash
python scripts/xlsx-to-csv-convert.py "/path/to/MyDocs/" --source-dir MyDocs --target-dir MyDocs_Output
python scripts/xlsx-to-csv-convert.py "/path/to/MyDocs/" --target-dir MyDocs_Output   # rename auto output only
```
- `--target-dir` alone renames the auto-detected output folder. It must be a single folder name: no path separators, not `.`/`..`, and (in auto mode) not the source folder's own name.
- `--source-dir NAME` replaces the **first** path segment equal to `NAME` (searched from the root). Pick a name that appears only once in the path.

### Overwrite existing CSVs
```bash
python scripts/xlsx-to-csv-convert.py "/path/to/example/" --overwrite
```

## Behavior

- **Auto-detect**: When no `--source-dir` is given, the anchor is the input directory, or the file's parent folder for a single file. Output goes to `{anchor}_CSV_AI` (or `--target-dir`) beside the anchor. Nothing above the input is scanned. An input sitting directly at a filesystem/drive root (e.g. `/f.xlsx`, `D:\f.xlsx`) is rejected — pass `--source-dir` and `--target-dir` explicitly.
- **Path mapping**: Auto mode mirrors paths relative to the anchor, so ancestors or subfolders sharing the anchor's name are unaffected. Explicit `--source-dir` mode replaces the first matching path segment.
- **Paths**: The input path is made absolute without following symlinks; output lands beside the path you gave.
- **Multi-sheet**: Each sheet → separate CSV (`filename_SheetName.csv`). Single-sheet → `filename.csv`.
- **Encoding**: UTF-8 with BOM (`utf-8-sig`) for Excel compatibility.
- **Data types**: All cells read as strings (`dtype=str`) to preserve original formatting.
- **Skips**: Temp files (`~$*`) are ignored. Existing CSVs skipped unless `--overwrite`.
- **Errors**: A workbook that cannot be read, or a CSV that cannot be written (e.g. no permission beside a mount or drive root), is reported and skipped; the batch continues. The summary line counts `created`, `skipped`, and `failed`; the script exits 1 when anything failed.

## Requirements

- Python 3.9+
- `pandas` and `openpyxl`

## Examples

**Directory mode** (auto-detect):
- Input: `example/` containing `a/b/c/report.xlsx` (2 sheets: "Q1", "Q2")
- Output:
  - `example_CSV_AI/a/b/c/report_Q1.csv`
  - `example_CSV_AI/a/b/c/report_Q2.csv`

**Single file** (auto-detect):
- Input: `DevelopmentDocument/screens/login.xlsx` (1 sheet)
- Output: `DevelopmentDocument/screens_CSV_AI/login.csv`

**Single file** (explicit, mirror a higher folder):
- Input: `DevelopmentDocument/screens/login.xlsx --source-dir DevelopmentDocument`
- Output: `DevelopmentDocument_CSV_AI/screens/login.csv`
