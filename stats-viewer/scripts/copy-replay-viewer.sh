#!/usr/bin/env bash
# Copies static assets from vox-deorum-replay into stats-viewer/public/replay/
# Skips: src/, node_modules/, examples/, config files, source maps, .git

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$SCRIPT_DIR/../public/replay"

# Allow override via REPLAY_SOURCE_DIR env var.
# Default: walk up from stats-viewer/scripts/ to find the AgenticAI parent that
# contains vox-deorum-replay (works regardless of worktree nesting).
if [ -z "${REPLAY_SOURCE_DIR:-}" ]; then
  dir="$(cd "$SCRIPT_DIR" && pwd)"
  while [ "$dir" != "/" ]; do
    if [ -d "$dir/vox-deorum-replay" ]; then
      SOURCE_DIR="$dir/vox-deorum-replay"
      break
    fi
    dir="$(dirname "$dir")"
  done
  SOURCE_DIR="${SOURCE_DIR:-}"
else
  SOURCE_DIR="$REPLAY_SOURCE_DIR"
fi

# Validate source exists
if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERROR: Source directory not found: $SOURCE_DIR"
  exit 1
fi

# Clean and recreate destination
if [ -d "$DEST_DIR" ]; then
  echo "Removing old $DEST_DIR ..."
  rm -rf "$DEST_DIR"
fi
mkdir -p "$DEST_DIR"

copied=()

# 1. index.html
if [ -f "$SOURCE_DIR/index.html" ]; then
  cp "$SOURCE_DIR/index.html" "$DEST_DIR/index.html"
  copied+=("index.html")
else
  echo "WARNING: index.html not found in source"
fi

# 2. dist/bundle.js
if [ -f "$SOURCE_DIR/dist/bundle.js" ]; then
  mkdir -p "$DEST_DIR/dist"
  cp "$SOURCE_DIR/dist/bundle.js" "$DEST_DIR/dist/bundle.js"
  copied+=("dist/bundle.js")
else
  echo "WARNING: dist/bundle.js not found in source (may need to build first)"
fi

# 3. vendor/ directory (recursive)
if [ -d "$SOURCE_DIR/vendor" ]; then
  cp -r "$SOURCE_DIR/vendor" "$DEST_DIR/vendor"
  copied+=("vendor/")
else
  echo "WARNING: vendor/ directory not found in source"
fi

# 4. assets/ directory (recursive)
if [ -d "$SOURCE_DIR/assets" ]; then
  cp -r "$SOURCE_DIR/assets" "$DEST_DIR/assets"
  copied+=("assets/")
else
  echo "WARNING: assets/ directory not found in source"
fi

# Summary
echo ""
echo "=== Copy Summary ==="
echo "Source: $SOURCE_DIR"
echo "Dest:   $DEST_DIR"
echo ""
if [ ${#copied[@]} -gt 0 ]; then
  echo "Copied:"
  for item in "${copied[@]}"; do
    echo "  - $item"
  done
else
  echo "Nothing was copied."
fi
echo ""
echo "Skipped: src/, node_modules/, examples/, config files, source maps, .git"
echo "Done."
