# Changelog

All notable changes to this plugin will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), Semver.

## [0.2.0] - 2026-10-22

### Added
- xlsx-to-csv: regression tests for auto-detect path mapping and CLI wiring (POSIX + Windows path math)

### Changed
- xlsx-to-csv: auto-detect anchors output beside the input folder (file input -> sibling `{parent}_CSV_AI`) instead of scanning from the filesystem root
- xlsx-to-csv: --target-dir is honored without --source-dir and must be a single folder name
- xlsx-to-csv: input paths are no longer resolved through symlinks; output lands beside the path given
- xlsx-to-csv: read/write failures are counted in the summary (`Z failed`) and the script exits 1 when any conversion failed
- xlsx-to-csv: auto mode prints the absolute anchor and output folder; explicit --source-dir now matches the path as typed (no symlink resolution); --target-dir equal to the source folder name (case-insensitive) is rejected
- xlsx-to-csv: earlier versions could write converted CSV copies under `<drive>:\_CSV_AI` (Windows) or `/_CSV_AI` (POSIX when run as root); delete those folders, they contain copies of your spreadsheet data

## [0.1.0] - 2026-05-19

### Added
- Add xlsx-to-csv skill v0.1.0: converts XLSX files to CSV with auto-detect source/target directory naming, multi-sheet support, and UTF-8 BOM encoding for Excel compatibility
