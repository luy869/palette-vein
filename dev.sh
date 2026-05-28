#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Ctrl+C で全プロセスをまとめて終了
trap 'echo ""; echo "Stopping all services..."; kill $(jobs -p) 2>/dev/null; wait 2>/dev/null; exit 0' INT TERM

echo "Starting PostgreSQL..."
docker compose up -d

echo "Starting CLIP service..."
(cd "$ROOT/clip_service" && uv run python server.py 2>&1 | sed 's/^/\x1b[35m[clip]\x1b[0m /') &

echo "Starting backend..."
(cd "$ROOT/backend" && JWT_SECRET=dev_secret go run ./cmd/server 2>&1 | sed 's/^/\x1b[36m[backend]\x1b[0m /') &

echo "Starting frontend..."
(cd "$ROOT/frontend" && npm run dev 2>&1 | sed 's/^/\x1b[32m[frontend]\x1b[0m /') &

echo ""
echo "All services started."
echo "  frontend → http://localhost:5173"
echo "  backend  → http://localhost:8080"
echo ""
echo "Press Ctrl+C to stop all."
echo ""

wait
