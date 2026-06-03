#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REFERENCES_DIR="${SKILL_ROOT}/references"

if ! command -v uv >/dev/null 2>&1; then
  echo "ERROR: uv is required for Excalidraw file-based rendering." >&2
  echo "Install uv first: https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi

cd "${REFERENCES_DIR}"
uv sync
uv run playwright install chromium

echo "Excalidraw file-based renderer setup complete."
