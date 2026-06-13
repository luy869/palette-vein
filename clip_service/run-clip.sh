#!/usr/bin/env bash
# CLIP gRPC サービスをホストで起動する（GPU直接利用・systemd 無し）。
# ゲーム併用環境のため常駐させず、使いたい時だけ実行し、不要時は Ctrl+C で停止する。
#
# 使うGPUを固定してチャットボット/ゲームと住み分ける（環境変数で上書き可）:
#   CUDA_VISIBLE_DEVICES=1 ./run-clip.sh
set -e
cd "$(dirname "$0")"

export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-0}"
echo "Starting CLIP on GPU index ${CUDA_VISIBLE_DEVICES} (Ctrl+C to stop)..."
exec uv run python server.py
