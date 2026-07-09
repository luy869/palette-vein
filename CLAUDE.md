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
uv sync          # 初回のみ
uv run python server.py
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
│   ├── server.py                  ← gRPC サーバー（EVA02-L/14・768次元, GPU自動選択/CPUフォールバック）
│   ├── requirements.txt
│   ├── .venv/                     ← Python venv（gitignore）
│   └── generated/                 ← protoc 生成物（gitignore）
├── backend/
│   ├── cmd/server/main.go         ← エントリポイント
│   ├── internal/
│   │   ├── wallhaven/client.go    ← Wallhaven API クライアント
│   │   ├── api/server.go          ← chi ルーター + CORS 設定
│   │   ├── api/handlers.go        ← GET /api/images, POST /api/feedback, GET /api/likes, GET /api/discover
│   │   ├── api/recommend.go       ← GET /api/recommend
│   │   ├── api/search.go          ← GET /api/search, POST /api/search/image, GET /api/search/color
│   │   ├── api/profile.go         ← GET /api/profile/palette
│   │   ├── api/concepts.go        ← GET /api/profile/tags（概念タグ翻訳）
│   │   ├── api/admin.go           ← GET /api/admin/stats, GET /api/admin/users, POST /api/admin/crawl
│   │   ├── crawler/crawler.go     ← バックグラウンドクローラー（起動時 3×50ページ + FetchQuery）
│   │   ├── clip/client.go         ← gRPC クライアント（EmbedText + EmbedBytes）
│   │   ├── clippb/                ← protoc 生成 Go コード
│   │   ├── concepts/vocab.go      ← 概念語彙 95語（{En,Ja}ペア・curated）
│   │   ├── concepts/tagger.go     ← 好みベクトル→概念タグ翻訳（Warmup/Top/Reason, mean減算+L2正規化）
│   │   ├── embedder/queue.go      ← バックグラウンド埋め込みキュー（thumb_urlをCLIPへ、DL間隔=EMBED_DELAY_MS既定300ms）
│   │   ├── recommend/profile.go   ← 好みベクトル算出（時間減衰 + Rocchio + クラスタ分割）
│   │   ├── recommend/kmeans.go    ← 好みの複峰性対応（スフェリカルk-means）
│   │   ├── recommend/cache.go     ← 好みベクトルのオンメモリTTLキャッシュ
│   │   ├── recommend/search.go    ← pgvector 類似検索（クラスタ別）+ ε-greedy
│   │   ├── db/db.go               ← pgx プール + pgvector 型登録 + migrations
│   │   └── models/models.go       ← Image（colors フィールド含む）, FeedbackEvent, User
│   ├── migrations/
│   │   ├── 001_init.sql
│   │   ├── 002_add_embedding.sql  ← VECTOR(512) + HNSW index
│   │   ├── 003_add_auth.sql       ← users: email, password_hash
│   │   ├── 004_add_admin.sql      ← users: is_admin
│   │   ├── 005_thumb_large_backfill.sql ← thumb_url を /small/ → /lg/ に置換
│   │   ├── 006_add_colors.sql     ← images: colors TEXT[] + GIN index
│   │   ├── 007_add_embed_errors.sql ← images: embed_errors SMALLINT（埋め込み失敗回数）
│   │   └── 008_change_embedding_dim_768.sql ← embedding を VECTOR(512)→VECTOR(768)（EVA02-L/14・冪等）
│   └── go.mod
└── frontend/
    ├── src/
    │   ├── App.tsx                ← タブ切替（発見/おすすめ/検索/いいね/パレット/管理）
    │   ├── api/client.ts          ← fetchDiscover / fetchImages / postFeedback / fetchRecommendations / fetchSearch / searchByColor / fetchLikes / ...
    │   ├── lib/
    │   │   ├── toast.tsx          ← ToastProvider + useToast（右下 3秒 自動消去）
    │   │   ├── grid.ts            ← GRID_COLUMNS 定数（全グリッド幅統一）
    │   │   └── useImageModal.ts   ← 拡大モーダルの状態管理（前後ナビ・グリッド単位）
    │   ├── components/
    │   │   ├── ImageGrid.tsx      ← 発見タブ（もっと見る・exclude対応）
    │   │   ├── ImageCard.tsx
    │   │   ├── RecommendGrid.tsx  ← おすすめタブ（もっと見る・dedup）
    │   │   ├── RecommendCard.tsx  ← 推薦カード + 推薦理由サムネ + 概念タグ pill
    │   │   ├── LikesGrid.tsx      ← いいねタブ（cursor無限スクロール）
    │   │   ├── SearchGrid.tsx     ← 検索タブ（CLIP/Wallhaven/色 3モード）
    │   │   ├── ColorPicker.tsx    ← <input type="color"> + プリセット5色
    │   │   ├── ProfilePalette.tsx ← パレットタブ（概念タグ pill + 好みの色ドット可視化）
    │   │   ├── AdminDashboard.tsx ← 管理タブ（統計+クロール起動）
    │   │   ├── SkeletonCard.tsx   ← animate-pulse ローディングカード
    │   │   ├── ImageModal.tsx     ← モーダル（元画像表示、前後ナビ ‹›/←→、ESCで閉じる）
    │   │   ├── ErrorBoundary.tsx  ← タブ描画エラー時のフォールバック表示
    │   │   ├── LoginPage.tsx
    │   │   └── Tabs.tsx
    │   └── types.ts               ← Image（colors?）, RecommendItem（reason_tags?）, RecommendResponse, ConceptTag, ProfileTagsResponse, User
    └── vite.config.ts
```

---

## 技術スタック

| 層 | 採用 | 備考 |
|----|------|------|
| Backend | Go 1.25 + chi v5 | `go run ./cmd/server` で起動 |
| DB driver | pgx/v5 | AfterConnect で pgvector 型登録必須 |
| DB | PostgreSQL 16 + pgvector | images.embedding VECTOR(768) + HNSW index |
| AI処理 | Python + open_clip EVA02-L/14 | 768次元。gRPC（:50051）でGo連携。GPU自動選択（空きVRAM最大）、無ければCPU。torchはcu128 |
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
- いいね >= 30件 → 好みを k-means で系統分割し、系統ごとに類似検索（複峰性対応）。
  推薦枠を系統のいいねシェアに比例配分
- 好みベクトルは5分TTLのオンメモリキャッシュ（フィードバック時に無効化）

### GET /api/search
```
?q=text description   # 自然言語クエリ（必須）
```
- CLIPでテキストをベクトル化 → pgvector cosine検索（embedding IS NOT NULL、未反応のみ）
- 24件返す

Response:
```json
{ "images": [...], "query": "text description" }
```

### GET /api/likes
```
?cursor=<feedback_event_id>  # カーソルページング（省略で先頭）
```
- ログイン中ユーザーのいいね済み画像を新しい順で返す（24件単位）
- レスポンスに `next_cursor` を含む（null なら終端）

### GET /api/discover
```
?exclude=1,2,3  # 除外する画像ID（カンマ区切り）
```
- 未フィードバックの横長画像をランダム 24件

### GET /api/search/color
```
?hex=ff8800  # 色の hex（# 除いた 6文字 or # 付き）
```
- colors カラムが存在する画像から RGB 二乗距離で上位 24件（SQL内 `unnest` + hex→int 変換でDB側ソート）

### GET /api/profile/palette
- ログイン中ユーザーのいいね最新100件の colors を集計
- レスポンス: `{ palette: [{hex, count}], total_likes }`

### GET /api/profile/tags
- ログイン中ユーザーの好みベクトルを CLIP 概念タグ（95語固定語彙）に翻訳
- レスポンス:
  ```json
  {
    "tags": [{ "en": "fantasy landscape", "ja": "幻想的な風景", "weight": 0.87 }],
    "clusters": [{ "share": 0.62, "tags": [...] }],
    "cold_start": true,   // いいね不足（省略可）
    "warming_up": true    // tagger Warmup 未完了（省略可）
  }
  ```
- `tags`: 全体の好みに近い上位8件。`weight` は [0,1] でセット内の相対強度。
- `clusters`: いいね30件以上で k-means 系統分割時のみ。各系統の上位6件。
- 表示=日本語ラベル（`ja`）、タグクリック検索=英語句（`en`）で CLIP 意味検索へ遷移。
- Tagger は起動時にバックグラウンド Warmup（全語彙 EmbedText × 95回）を実行。未完了中は `warming_up:true`。

### POST /api/admin/crawl
```json
{ "query": "anime landscape", "pages": 3 }
```
- crawler.FetchQuery を goroutine で起動 → 即時 202 返す（最大 20ページ）

---

## DB スキーマ（M5）

```sql
users          (id, created_at, email UNIQUE, password_hash, is_admin)
images         (id, wallhaven_id UNIQUE, url, thumb_url, width, height, ratio, views, favorites, fetched_at,
                embedding VECTOR(768), colors TEXT[], embed_errors SMALLINT)    -- M5: colors / 埋め込みは768次元(EVA02-L/14)
feedback_events(id, user_id, image_id, kind CHECK('like'|'skip'), created_at)
               UNIQUE(user_id, image_id, kind)

-- インデックス
images_pending_embedding_idx  ON images(id) WHERE embedding IS NULL
images_embedding_hnsw_idx     ON images USING hnsw(embedding vector_cosine_ops) m=16 ef_construction=64
images_colors_gin_idx         ON images USING gin(colors)   -- M5追加
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
| 複峰性対応 | いいね30件以上で k-means 系統分割（最大3系統） | 平均ベクトル1本では複数の好みの中間を指す問題を解消 |
| 好みベクトルキャッシュ | オンメモリTTL 5分 + フィードバック時無効化 | 毎リクエストのDB集計を削減。単一プロセス前提 |
| タブ状態保持 | KeepAlive（display:none）方式 | 探索系タブのスクロール/データ維持。パレット/管理は鮮度優先で除外 |
| pgvector スキャン | `pgvector.Vector` 型でスキャン後 `.Slice()` | `[]float32` への直接スキャン非対応（OID バイナリ形式） |
| Wallhaven レート制限 | `wallhaven.Client` 内部で1.5秒間隔を中央管理 | 定期クロールと管理画面クロールの同時実行で超過しないように |
| ログ | `log/slog`。`LOG_FORMAT=json` でJSON出力 | デフォルトはテキスト（開発時の可読性優先） |
| CORS | `ALLOWED_ORIGIN` はカンマ区切りで複数指定可 | 本番+ローカルの併用を想定 |
| 認証 | JWT（HS256）+ httpOnly Cookie（30日） | XSS対策。bcrypt cost=12でパスワードをハッシュ |
| マルチユーザー | メール+パスワード登録。全APIが認証必須 | 埋め込み生成はサーバー側で一元管理 |
| 概念タグ語彙 | 固定 curated リスト（95語・機械翻訳なし） | En=CLIP埋め込み用、Ja=表示用。翻訳は{En,Ja}ペアで手作業管理 |
| 概念タグ埋め込み | 起動時Warmupで全語彙をEmbedTextしてグローバルキャッシュ | ユーザー共通なので1回計算すれば全ユーザーで使い回せる |
| 概念タグ精度向上 | mean減算（全タグ正規化ベクトルの平均を除去）後にL2再正規化 | 「万人に共通する方向」を除き、ユーザー固有の好みに近い概念を際立たせる |
| reason_tags生成 | 好み側スコアが正のタグに絞り、画像側スコアで順位付け（Reason関数） | min(cos_img, cos_prof) は好み側スコアが上限になり、全画像で同じタグに縮退した（実測で確認）。好みは多数のいいねの平均でスコアが小さく、画像側と同尺度で比較できない |

---

## マイルストーン

| M | 内容 | 状態 |
|---|------|------|
| M1 | Wallhaven取得 → 一覧表示 → いいね/スキップ記録 | **完了** |
| M2 | CLIP埋め込み + pgvector 類似検索 + gRPC + 推薦理由(b) + いいねタブ | **完了** |
| M3 | メール+パスワード認証 + Docker化（全4サービス） | **完了** |
| M4 | バックグラウンドクローラー + キーワード/CLIP検索 | **完了** |
| M5 | 画質改善・スケルトン・Toast・無限スクロール・色テーマ機能・管理強化 | **完了** |
| M6 | 信頼性改善・k-means複峰性対応・プロフィールキャッシュ・タブ保持・モーダル前後ナビ | **完了** |
| M7 | 推薦理由の高度化: 好みベクトル→概念タグ翻訳（パレットタブ+推薦カード）、タグクリック検索 | **完了** |

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

# Go テスト（recommend + concepts パッケージ）
cd backend && go test ./internal/recommend/ ./internal/concepts/

# TypeScript 型チェック
cd frontend && npx tsc --noEmit

# JWT_SECRET 生成例
openssl rand -hex 32
```

---

## ドキュメント更新履歴

CLAUDE.md は「現在の最新状態」を維持する参照ドキュメント（過去版は git に残す）。
マイルストーン単位の経緯は上のマイルストーン表と `DEVLOG.md` を、
コミット単位の詳細は `docs/changes-YYYY-MM-DD.md` を参照。

- 2026-07-10 推薦カードの概念タグが全画像で同一になるバグを修正（Reason の min 方式を廃止）（→ changes-2026-07-10.md）
- 2026-06-23 M7: 好みベクトル→概念タグ翻訳（パレットタブ + 推薦カード）、タグクリック検索（→ changes-2026-06-23.md）
- 2026-06-15 本番デプロイ（自宅サーバー・限定公開）＋埋め込みモデルを EVA02-L/14（768次元）へ引き上げ（→ changes-2026-06-15.md）
- 2026-06-14 埋め込みモデルを EVA02-B/16 に変更（512次元のまま品質向上）（→ changes-2026-06-14.md）
- 2026-06-13 M6反映: k-means複峰性対応・プロフィールキャッシュ・タブ保持・モーダル前後ナビ・拡大画像403修正（→ changes-2026-06-13.md）
- 2026-06-11 信頼性・スケーラビリティ・UI/UX改修を反映（→ changes-2026-06-11.md）
- 〜2026-05-27 M1〜M5 構築（→ DEVLOG.md）
