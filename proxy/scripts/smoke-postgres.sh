#!/usr/bin/env bash
# Smoke test: vigil-proxy passes psql traffic through to a real Postgres.
#
# Prerequisite (one-off): a Postgres listening on :5432. If you don't have
# one, run it in Docker:
#
#   docker run -d --rm --name vigil-pg -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:16
#
# Tear-down when you're done with the container:
#
#   docker stop vigil-pg
#
# This script:
#   1. Builds vigil-proxy.
#   2. Starts it with --postgres-listen :7432 --postgres-upstream localhost:5432.
#   3. Runs `psql -h localhost -p 7432 -U postgres -c 'SELECT 1, version()'`.
#   4. Asserts psql exit 0 and prints its output.
#   5. Tears the proxy down.

set -euo pipefail

cd "$(dirname "$0")/.."

PG_PORT="${PG_UPSTREAM_PORT:-5432}"
PROXY_PORT="${PROXY_PORT:-7432}"
PASSWORD="${PGPASSWORD:-test}"
TMP_HOME="$(mktemp -d)"
trap 'rm -rf "$TMP_HOME"' EXIT

echo "→ building vigil-proxy..."
go build -o "$TMP_HOME/vigil-proxy" ./cmd/vigil-proxy

# Sanity check: upstream Postgres must be reachable, otherwise the test is
# meaningless. Bail with a clear message if not.
if ! nc -z localhost "$PG_PORT" 2>/dev/null; then
  echo "✗ no Postgres listening on localhost:$PG_PORT" >&2
  echo "  start one with: docker run -d --rm --name vigil-pg -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:16" >&2
  exit 1
fi

echo "→ starting vigil-proxy on :$PROXY_PORT → upstream :$PG_PORT..."
HOME="$TMP_HOME" "$TMP_HOME/vigil-proxy" \
  --addr ":7878" \
  --postgres-listen ":$PROXY_PORT" \
  --postgres-upstream "localhost:$PG_PORT" \
  >"$TMP_HOME/proxy.log" 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true; rm -rf "$TMP_HOME"' EXIT

# Wait for the proxy port to bind. We don't read the log; the port-open
# check is the source of truth.
for _ in $(seq 1 30); do
  if nc -z localhost "$PROXY_PORT" 2>/dev/null; then
    break
  fi
  sleep 0.1
done
if ! nc -z localhost "$PROXY_PORT" 2>/dev/null; then
  echo "✗ vigil-proxy never bound :$PROXY_PORT — log:" >&2
  cat "$TMP_HOME/proxy.log" >&2
  exit 1
fi

echo "→ running psql through the proxy..."
PGPASSWORD="$PASSWORD" psql \
  -h localhost -p "$PROXY_PORT" \
  -U postgres \
  -c 'SELECT 1, version()'
PSQL_RC=$?

if [ "$PSQL_RC" -ne 0 ]; then
  echo "✗ psql exited $PSQL_RC — proxy log:" >&2
  cat "$TMP_HOME/proxy.log" >&2
  exit 1
fi

echo "✓ smoke passed"
