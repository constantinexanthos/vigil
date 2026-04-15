#!/bin/bash
# Start Vigil daemon and app together
# Usage: ./dev.sh [watch_dir]

WATCH_DIR="${1:-$HOME/vigil}"

echo "Starting Vigil daemon (watching $WATCH_DIR)..."
cd "$(dirname "$0")/daemon" && cargo run -- watch "$WATCH_DIR" &
DAEMON_PID=$!

echo "Starting Vigil app..."
cd "$(dirname "$0")/app" && npm run tauri:dev &
APP_PID=$!

trap "kill $DAEMON_PID $APP_PID 2>/dev/null; exit" INT TERM

echo ""
echo "Vigil running. Press Ctrl+C to stop both."
wait
