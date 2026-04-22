#!/usr/bin/env bash
# One command to run Vigil in dev mode.
#
# Starts the Rust daemon (watching ~/conductor by default) and the Tauri app
# with hot reload, both labeled so interleaved logs are readable.
#
# Usage:  ./dev.sh [watch_dir]
# Stop:   Ctrl+C (takes down both processes cleanly)

set -eo pipefail
set -m  # job control — each background subshell gets its own process group

WATCH_DIR="${1:-$HOME/conductor}"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -d "$WATCH_DIR" ]]; then
  echo "✘ watch dir not found: $WATCH_DIR" >&2
  echo "  Pass a directory as the first argument, or create $WATCH_DIR." >&2
  exit 1
fi

echo "▸ Vigil dev"
echo "  daemon → watching $WATCH_DIR"
echo "  app    → Tauri window will open; Vite on http://localhost:1420"
echo ""

# Each half runs in its own subshell so it gets its own process group,
# which lets us kill the whole tree (cargo + awk, npm + vite + cargo + awk)
# in one shot on Ctrl+C.
(
  cd "$REPO_ROOT/daemon"
  cargo run --quiet -- watch "$WATCH_DIR" 2>&1 \
    | awk '{ printf "[daemon] %s\n", $0; fflush() }'
) &
DAEMON_PGID=$!

(
  cd "$REPO_ROOT/app"
  npm run --silent tauri:dev 2>&1 \
    | awk '{ printf "[app   ] %s\n", $0; fflush() }'
) &
APP_PGID=$!

cleanup() {
  echo ""
  echo "▸ stopping..."
  kill -TERM -"$DAEMON_PGID" -"$APP_PGID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "✓ stopped"
}
trap cleanup INT TERM

wait
