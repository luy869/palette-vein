#!/usr/bin/env bash
# PaletteVein 本番スタックを停止する（DBボリュームは保持）。
# 完全撤去（DBも消す）は: COMPOSE_PROJECT_NAME=palettevein docker compose -f docker-compose.prod.yml down -v
set -e
cd "$(dirname "$0")"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "docker compose / docker-compose が見つかりません。" >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME=palettevein
$COMPOSE -f docker-compose.prod.yml down

echo "停止しました（DBボリューム palettevein_pgdata は保持）。"
