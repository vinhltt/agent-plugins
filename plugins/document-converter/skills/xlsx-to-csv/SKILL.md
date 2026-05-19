---
name: xlsx-to-csv
description: >
  Convert XLSX files to CSV format. Auto-detects source directory name from
  input path and outputs to a sibling `{source}_CSV_AI` directory, preserving
  internal folder structure. Each sheet becomes a separate CSV. Supports single
  file or recursive directory conversion. Works with any directory name.
metadata:
  version: 0.1.0
---

# XLSX to CSV Converter

Converts XLSX files to CSV. Auto-maps output: `{source}/` → `{source}_CSV_AI/`, preserving nested paths.

## Usage

### Directory (auto-detect — recommended)
```bash
python scripts/xlsx-to-csv-convert.py "/path/to/example/"
# → outputs to /path/to/example_CSV_AI/...
```

### Single file
```bash
python scripts/xlsx-to-csv-convert.py "/path/to/example/a/b/file.xlsx"
# → outputs to /path/to/example_CSV_AI/a/b/file.csv
```

### Custom source/target names (override auto-detect)
```bash
python scripts/xlsx-to-csv-convert.py "/path/to/MyDocs/" --source-dir MyDocs --target-dir MyDocs_Output
```

### Overwrite existing CSVs
```bash
python scripts/xlsx-to-csv-convert.py "/path/to/example/" --overwrite
```

## Behavior

- **Auto-detect**: When no `--source-dir` given, uses input directory name as source, `{name}_CSV_AI` as target.
- **Multi-sheet**: Each sheet → separate CSV (`filename_SheetName.csv`). Single-sheet → `filename.csv`.
- **Path mapping**: Replaces source directory segment with target in output path, preserving all nested subdirectories.
- **Encoding**: UTF-8 with BOM (`utf-8-sig`) for Excel compatibility.
- **Data types**: All cells read as strings (`dtype=str`) to preserve original formatting.
- **Skips**: Temp files (`~$*`) are ignored. Existing CSVs skipped unless `--overwrite`.

## Requirements

- `pandas` and `openpyxl`

## Examples

**Directory mode** (auto-detect):
- Input: `example/a/b/c/report.xlsx` (2 sheets: "Q1", "Q2")
- Output:
  - `example_CSV_AI/a/b/c/report_Q1.csv`
  - `example_CSV_AI/a/b/c/report_Q2.csv`

**Single file** (auto-detect):
- Input: `DevelopmentDocument/screens/login.xlsx` (1 sheet)
- Output: `DevelopmentDocument_CSV_AI/screens/login.csv`
