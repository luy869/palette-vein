#!/usr/bin/env bash
# PaletteVein 本番スタックを停止する（DBボリュームは保持）。
# 完全撤去（DBも消す）は: COMPOSE_PROJECT_NAME=palettevein docker compose -f docker-compose.prod.yml down -v
set -e
cd "$(dirname "$0")"

export COMPOSE_PROJECT_NAME=palettevein
docker compose -f docker-compose.prod.yml down

echo "停止しました（DBボリューム palettevein_pgdata は保持）。"
