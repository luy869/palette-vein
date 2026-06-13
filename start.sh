#!/usr/bin/env bash
# PaletteVein 本番スタック(postgres/backend/frontend)を Docker で起動する。
# CLIP は別途 clip_service/run-clip.sh をホストで起動しておくこと。
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo ".env がありません。.env.example をコピーして値を設定してください。" >&2
  exit 1
fi

docker compose -p palettevein -f docker-compose.prod.yml --env-file .env up -d --build

echo ""
echo "起動完了。frontend → http://127.0.0.1:8090（Cloudflare Tunnel がここに繋ぎます）"
echo "CLIP がホストで動いているか確認: ss -ltn | grep 50051"
