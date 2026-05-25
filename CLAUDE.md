# PaletteVein — Claude向けプロジェクトガイド

好みを学習し、推薦理由を可視化しながら壁紙イラストを発掘するWebサービス。
設計の背景・動機は `PaletteVein_design.md` を参照。
意思決定の記録・経緯は `DEVLOG.md` を参照。

---

## Dev セットアップ（起動手順）

```bash
# 1. PostgreSQL 起動
cd /home/luy869/works/Palette_Vein
docker compose up -d

# 2. Python CLIPサービス起動（別ターミナル）
cd clip_service
source .venv/bin/activate
python server.py
# → :50051 で待機。初回モデルロードに30〜60秒かかる

# 3. バックエンド起動（migrations は起動時に自動実行される）
cd backend
go run ./cmd/server
# CLIP_ADDR 環境変数で接続先を変更可能（デフォルト: localhost:50051）
# CLIPが起動していなくてもGoサーバーは起動可能（gRPCは遅延接続）

# 4. フロントエンド起動（別ターミナル）
cd frontend
npm run dev
# → http://localhost:5173
```

停止:
```bash
docker compose down          # PostgreSQL 停止（データは保持）
docker compose down -v       # ボリュームごと削除（DBリセット）
```

ポート:
- `:8080` — Go バックエンド
- `:5173` — React フロントエンド（Vite dev server）
- `:5432` — PostgreSQL
- `:50051` — Python CLIPサービス（gRPC）

---

## プロジェクト構成

```
Palette_Vein/
├── CLAUDE.md                      ← このファイル
├── PaletteVein_design.md          ← 設計書（詳細な設計判断はここ）
├── docker-compose.yml             ← pgvector/pgvector:pg16
├── protos/clip.proto              ← gRPC proto 定義
├── clip_service/                  ← Python CLIPサービス
│   ├── server.py                  ← gRPC サーバー（ViT-B/32, CPU）
│   ├── requirements.txt
│   ├── .venv/                     ← Python venv（gitignore）
│   └── generated/                 ← protoc 生成物（gitignore）
├── backend/
│   ├── cmd/server/main.go         ← エントリポイント
│   ├── internal/
│   │   ├── wallhaven/client.go    ← Wallhaven API クライアント
│   │   ├── api/server.go          ← chi ルーター + CORS 設定
│   │   ├── api/handlers.go        ← GET /api/images, POST /api/feedback, GET /api/likes
│   │   ├── api/recommend.go       ← GET /api/recommend
│   │   ├── clip/client.go         ← gRPC クライアント
│   │   ├── clippb/                ← protoc 生成 Go コード
│   │   ├── embedder/queue.go      ← バックグラウンド埋め込みキュー
│   │   ├── recommend/profile.go   ← 好みベクトル算出（時間減衰 + Rocchio）
│   │   ├── recommend/search.go    ← pgvector 類似検索 + ε-greedy
│   │   ├── db/db.go               ← pgx プール + pgvector 型登録 + migrations
│   │   └── models/models.go       ← Image, FeedbackEvent
│   ├── migrations/
│   │   ├── 001_init.sql
│   │   └── 002_add_embedding.sql  ← VECTOR(512) + HNSW index
│   └── go.mod
└── frontend/
    ├── src/
    │   ├── App.tsx                ← タブ切替（発見/おすすめ/いいね）
    │   ├── api/client.ts          ← fetchImages / postFeedback / fetchRecommendations
    │   ├── components/
    │   │   ├── ImageGrid.tsx      ← 発見タブ
    │   │   ├── ImageCard.tsx
    │   │   ├── RecommendGrid.tsx  ← おすすめタブ
    │   │   ├── RecommendCard.tsx  ← 推薦カード + 推薦理由サムネ
    │   │   ├── LikesGrid.tsx      ← いいねタブ
    │   │   └── Tabs.tsx
    │   └── types.ts               ← Image, RecommendItem, RecommendResponse
    └── vite.config.ts
```

---

## 技術スタック

| 層 | 採用 | 備考 |
|----|------|------|
| Backend | Go 1.25 + chi v5 | `go run ./cmd/server` で起動 |
| DB driver | pgx/v5 | AfterConnect で pgvector 型登録必須 |
| DB | PostgreSQL 16 + pgvector | images.embedding VECTOR(512) + HNSW index |
| AI処理 | Python + open_clip ViT-B/32 | gRPC（:50051）でGo連携。CPU環境 |
| Frontend | React + TypeScript + Vite 5 | Node 18 対応のため vite@5 |
| CSS | インラインスタイル | M3 以降でライブラリ検討 |

> **Node バージョン注意**: 現在 Node v18.20.8。`create-vite` 最新版（v9+）は Node 20+ 必須。
> フロントエンド追加パッケージを入れる際もバージョン互換を確認すること。

---

## API エンドポイント

### GET /api/images
```
?page=1        # Wallhaven ページ番号（default: 1）
?sorting=toplist  # Wallhaven ソート（default: toplist）
```
- Wallhaven `/api/v1/search` を呼び、結果を `images` テーブルに upsert して返す
- 匿名アクセス（45 req/min 制限）。APIキーは未設定

Response:
```json
{ "images": [{ "id": 1, "wallhaven_id": "...", "url": "...", "thumb_url": "...", ... }] }
```

### POST /api/feedback
```json
{ "image_id": 1, "kind": "like" }   // kind: "like" | "skip"
```
- `feedback_events` テーブルにログイン中ユーザーのIDで INSERT（ON CONFLICT DO NOTHING）

### GET /api/recommend
```json
{
  "mode": "similar" | "toplist",
  "items": [{ "image": {...}, "score": 0.71, "source": "similar"|"explore", "reason_image_ids": [42, 17] }],
  "reason_images_lookup": [{ "id": 42, ... }]
}
```
- いいね < 10件 → toplist（人気順）
- いいね >= 10件 → similar（pgvector cosine）+ explore（ε-greedy 20%）= 24件

### GET /api/likes
```json
{ "images": [...] }
```
- ログイン中ユーザーのいいね済み画像を新しい順で返す

---

## DB スキーマ（M3）

```sql
users          (id, created_at, email UNIQUE, password_hash)  -- M3追加: email, password_hash
images         (id, wallhaven_id UNIQUE, url, thumb_url, width, height, ratio, views, favorites, fetched_at,
                embedding VECTOR(512))       -- M2追加
feedback_events(id, user_id, image_id, kind CHECK('like'|'skip'), created_at)
               UNIQUE(user_id, image_id, kind)  -- M2追加

-- インデックス
images_pending_embedding_idx  ON images(id) WHERE embedding IS NULL
images_embedding_hnsw_idx     ON images USING hnsw(embedding vector_cosine_ops) m=16 ef_construction=64
feedback_unique_user_image_kind  UNIQUE ON feedback_events(user_id, image_id, kind)
```

migrations は `backend/migrations/*.sql` を起動時に名前順で全実行（冪等）。
`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` ベース。

---

## 設計上の主要な決定事項

| 事項 | 決定 | 理由 |
|------|------|------|
| マルチユーザー | per-user 前提、M1 は user_id=1 固定 | 後付けスキーマ変更を避ける |
| 画像保存 | URL+ベクトルのみ、本体は保存しない | ストレージコスト・著作権 |
| 画像表示 | Wallhaven URL を直リンク | hotlinking 規約は要確認済み（明記なし） |
| Go-Python 連携 | gRPC（:50051） | 型安全・GPU分離を見越して |
| マイグレーション | 起動時に SQL を順次実行 | シンプルさ優先。goose は M3以降で検討 |
| コールドスタート閾値 | いいね10件で類似検索に切替 | profile.go: likes == 0 → nil → toplist |
| 探索/活用バランス | similar 19件 + explore 5件 = 24件 | フィルターバブル回避 |
| pgvector スキャン | `pgvector.Vector` 型でスキャン後 `.Slice()` | `[]float32` への直接スキャン非対応（OID バイナリ形式） |
| 認証 | JWT（HS256）+ httpOnly Cookie（30日） | XSS対策。bcrypt cost=12でパスワードをハッシュ |
| マルチユーザー | メール+パスワード登録。全APIが認証必須 | 埋め込み生成はサーバー側で一元管理 |

---

## マイルストーン

| M | 内容 | 状態 |
|---|------|------|
| M1 | Wallhaven取得 → 一覧表示 → いいね/スキップ記録 | **完了** |
| M2 | CLIP埋め込み + pgvector 類似検索 + gRPC + 推薦理由(b) + いいねタブ | **完了** |
| M3 | メール+パスワード認証 + Docker化（全4サービス） | **完了** |

---

## よく使うコマンド

```bash
# Docker 全サービス起動（本番相当）
JWT_SECRET=xxx ALLOWED_ORIGIN=http://localhost docker compose up --build

# ローカル開発（PostgreSQLのみDocker）
docker compose up -d postgres
JWT_SECRET=dev_secret go run ./cmd/server   # backend
cd frontend && npm run dev                  # frontend

# DB の feedback_events を確認
docker compose exec postgres psql -U palettevein -d palettevein \
  -c "SELECT user_id, image_id, kind, created_at FROM feedback_events ORDER BY created_at DESC LIMIT 10;"

# Go ビルドチェック
cd backend && go build ./...

# TypeScript 型チェック
cd frontend && npx tsc --noEmit

# JWT_SECRET 生成例
openssl rand -hex 32
```
