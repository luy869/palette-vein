# PaletteVein

好みを学習しながら壁紙イラストを発掘するWebサービス。いいね・スキップを重ねるほど推薦精度が上がり、自分の「色の好み」が可視化されていく。

---

## 機能一覧

| タブ | 機能 |
|------|------|
| 発見 | Wallhaven から横長壁紙をランダム表示。いいね/スキップで好みを登録 |
| おすすめ | いいね 10 件以上で CLIP 類似検索が起動。推薦理由の画像を並表示 |
| 検索 | テキスト・画像ファイル・色の 3 モードで類似画像を検索 |
| いいね | いいね済み画像の一覧。無限スクロール対応 |
| パレット | いいねから抽出した好みカラーパレットをドット可視化 |
| 管理 | 統計・ユーザー管理・クロール手動実行（管理者のみ） |

---

## セットアップ

### 前提条件

- Go 1.21+
- Node.js 18+
- Docker / Docker Compose
- Python 3.10+

### ローカル開発（推奨）

PostgreSQL のみ Docker で動かし、残りはローカルで起動する。

```bash
# 1. PostgreSQL 起動
cd /path/to/Palette_Vein
docker compose up -d

# 2. Python CLIP サービス（別ターミナル）
cd clip_service
uv sync          # 初回のみ（依存パッケージのインストール）
uv run python server.py
# → :50051 で待機。初回モデルロードに 30〜60 秒かかる

# 3. Go バックエンド（別ターミナル）
cd backend
JWT_SECRET=dev_secret go run ./cmd/server
# → :8080 で待機。マイグレーションは起動時に自動実行

# 4. フロントエンド（別ターミナル）
cd frontend
npm run dev
# → http://localhost:5173
```

CLIP サービスを省略してもバックエンドは起動できる（埋め込み生成・類似検索が無効になるだけ）。

### Docker 全サービス起動（本番相当）

```bash
JWT_SECRET=your_secret ALLOWED_ORIGIN=http://localhost docker compose up --build
```

フロントエンドが `:80`、バックエンドが `:8081` で起動する。

### 停止

```bash
docker compose down       # データ保持
docker compose down -v    # DB ごとリセット
```

---

## 環境変数

| 変数名 | デフォルト | 必須 | 説明 |
|--------|----------|:----:|------|
| `JWT_SECRET` | — | ✅ | JWT 署名鍵。`openssl rand -hex 32` で生成 |
| `DATABASE_URL` | `postgres://palettevein:palettevein@localhost:5433/palettevein` | | PostgreSQL 接続文字列 |
| `CLIP_ADDR` | `localhost:50051` | | Python CLIP サービスの gRPC アドレス |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | | CORS 許可オリジン |
| `MIGRATIONS_DIR` | `migrations` | | マイグレーション SQL ファイルのディレクトリ |

---

## ポート一覧

| ポート | サービス |
|--------|---------|
| `:5173` | フロントエンド（Vite dev server） |
| `:8080` | Go バックエンド |
| `:5433` | PostgreSQL（Docker ホスト側マッピング） |
| `:50051` | Python CLIP サービス（gRPC） |

---

## 使い方ガイド

### 発見タブ

横長壁紙が 24 枚ランダムに表示される。

- **いいね**（❤️）: 好みとして登録。おすすめ・パレットの学習データになる
- **スキップ**（👋）: 次回以降に表示されなくなる
- **画像クリック**: 元画像をフルサイズでモーダル表示
- **もっと見る**: 既表示の画像を除いた新しい 24 枚を追加読み込み

### おすすめタブ

いいねした画像をもとに、好みに近い画像を推薦する。

- いいね **10 件未満**: 人気順（toplist）で表示
- いいね **10 件以上**: CLIP ベクトルを使った類似検索が起動
- 各カードの右下に**推薦理由の画像**（いいねした画像のうち、この推薦の根拠になったもの）が小さく表示される
- 一部は意図的に「探索」として表示され、フィルターバブルを防ぐ

### 検索タブ

3 つのモードを切り替えて使う。

#### テキスト検索
自然言語でキーワードを入力すると、CLIP が意味を理解して類似画像を返す。

```
例: "dark forest night"  "anime girl with sword"  "pastel color sunset"
```

#### 画像ファイル検索
手元の画像をアップロードすると、見た目が似た画像を検索できる。ファイル形式は JPEG/PNG/WebP。

#### 色検索
カラーピッカーで色を選ぶか、下部のプリセット（紫・青・緑・橙・赤）をクリックすると、同系色の画像が表示される。

### いいねタブ

いいねした画像が新しい順に並ぶ。スクロールすると自動で次のページを読み込む（無限スクロール）。

- **× ボタン**: いいねを取り消す

### パレットタブ

いいねした画像（最新 100 件）に含まれる色を集計して、好みのカラーパレットを表示する。

- 円のサイズが頻度を表す（大きいほどよく現れる色）
- 上位 10 色を表示

---

## 管理画面ガイド

「管理」タブは管理者権限を持つアカウントでログインすると表示される。

### 管理者アカウントの作成

DB を直接操作して権限を付与する（初回のみ）。

```bash
docker compose exec postgres psql -U palettevein -d palettevein \
  -c "UPDATE users SET is_admin = true WHERE email = 'your@email.com';"
```

ログアウト → 再ログインすると「管理」タブが表示される。

---

### 統計カード

ページ読み込み時に最新の数値を取得して表示する。

| カード | 内容 |
|--------|------|
| ユーザー数 | メール登録済みのユーザー総数 |
| 画像数 | DB に保存された画像の総数 |
| 埋め込み済み | CLIP による特徴量生成が完了した画像数。`(件数 / 総数)%` も表示 |
| 埋め込み待ち | まだ CLIP 処理が終わっていない画像数。サーバーが自動で 5 分ごとに処理する |
| 総いいね / 総スキップ | 全ユーザーの累計フィードバック数 |
| DB 合計 | PostgreSQL データベース全体のサイズ |
| images テーブル | images テーブル本体のサイズ + ベクトルインデックスのサイズ |

**「埋め込み待ち」について**: サーバー起動時に自動で処理が始まり、5 分ごとに未処理画像を再スキャンして続きを処理する。Wallhaven のレート制限（45 req/min）があるため、大量にある場合は完了まで時間がかかる。

---

### クロール実行

Wallhaven からキーワード検索して画像を手動で取得する。

1. テキスト欄にキーワードを入力する（例: `anime landscape`、`dark fantasy`）
2. ページ数を設定する（1〜20。1 ページ ≒ 24 枚）
3. 「開始」ボタンを押す

バックグラウンドで実行が始まり、画面にはすぐ「クロール開始」のトーストが表示される。取得完了はサーバーのログで確認できる。

```
admin crawl: upserted 72 images for query="anime landscape" pages=3
```

**ページ数の目安**:

| ページ数 | 取得枚数（目安） | 所要時間 |
|---------|--------------|---------|
| 1〜3 | 〜72 枚 | 数秒 |
| 5 | 〜120 枚 | 〜10 秒 |
| 10 | 〜240 枚 | 〜20 秒 |
| 20 | 〜480 枚 | 〜40 秒 |

Wallhaven のレート制限（45 req/min）により、多すぎると 429 エラーになる場合がある。まず 3〜5 ページで試すことを推奨。

取得した画像は自動的に埋め込みキューに追加され、CLIP 処理が順次実行される。

---

### ユーザー一覧

登録済み全ユーザーのメール・いいね数・スキップ数・登録日を確認できる。

- `admin` バッジ付きが管理者アカウント

---

## API リファレンス

### 認証（レート制限: 10 req/min）

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/auth/register` | アカウント登録 |
| POST | `/api/auth/login` | ログイン |
| POST | `/api/auth/logout` | ログアウト |
| GET | `/api/auth/me` | 現在のユーザー情報取得 |

**POST /api/auth/register**
```json
// リクエスト
{ "email": "user@example.com", "password": "min8chars" }

// レスポンス 201
{ "id": 1, "email": "user@example.com", "is_admin": false, "created_at": "2025-01-01T00:00:00Z" }
```

**POST /api/auth/login**
```json
// リクエスト
{ "email": "user@example.com", "password": "yourpassword" }

// レスポンス 200（JWT を httpOnly Cookie で発行）
{ "id": 1, "email": "user@example.com", "is_admin": false, "created_at": "..." }
```

---

### 画像・フィードバック（認証必須）

**GET /api/images**

Wallhaven から画像を取得して DB に保存し返す。

| パラメータ | デフォルト | 説明 |
|----------|----------|------|
| `page` | 1 | Wallhaven ページ番号 |
| `sorting` | toplist | ソート（toplist / latest / random） |
| `q` | — | 検索キーワード（オプション） |

**GET /api/discover**

未フィードバックの横長画像をランダムに 24 件返す。

| パラメータ | 説明 |
|----------|------|
| `exclude` | 除外する画像 ID（カンマ区切り）例: `exclude=1,2,3` |

**POST /api/feedback**
```json
// リクエスト
{ "image_id": 42, "kind": "like" }   // kind: "like" | "skip"

// レスポンス
{ "ok": true }
```

**DELETE /api/feedback**
```json
// リクエスト
{ "image_id": 42 }

// レスポンス
{ "ok": true }
```

**GET /api/likes**

いいね済み画像をカーソルページングで返す。

| パラメータ | 説明 |
|----------|------|
| `cursor` | 前ページの `next_cursor` 値。省略で先頭から |

```json
// レスポンス
{
  "images": [...],
  "next_cursor": 123    // null なら終端
}
```

---

### 推薦（認証必須）

**GET /api/recommend**

```json
// レスポンス
{
  "mode": "similar",    // "similar" | "toplist"
  "items": [
    {
      "image": { "id": 1, ... },
      "score": 0.82,
      "source": "similar",    // "similar" | "explore"
      "reason_image_ids": [42, 17]
    }
  ],
  "reason_images_lookup": [
    { "id": 42, ... }
  ]
}
```

`reason_image_ids` は推薦の根拠になったいいね画像の ID。`reason_images_lookup` に詳細情報が含まれる。

---

### 検索（認証必須）

**GET /api/search** — テキスト検索

| パラメータ | 説明 |
|----------|------|
| `q` | 検索キーワード（必須） |

```json
// レスポンス
{ "images": [...], "query": "dark forest" }
```

**POST /api/search/image** — 画像ファイル検索

`multipart/form-data` で `file` フィールドに画像を送信（最大 10MB）。

**GET /api/search/color** — 色検索

| パラメータ | 説明 |
|----------|------|
| `hex` | 色の hex 値（`ff8800` または `#ff8800`）（必須） |

---

### プロフィール（認証必須）

**GET /api/profile/palette**

```json
// レスポンス
{
  "palette": [
    { "hex": "#3366cc", "count": 18 },
    { "hex": "#ff8800", "count": 12 }
  ],
  "total_likes": 47
}
```

---

### 管理者専用（管理者権限必須）

**GET /api/admin/stats**

```json
// レスポンス
{
  "total_users": 5,
  "total_images": 4662,
  "images_with_embedding": 4401,
  "total_likes": 320,
  "total_skips": 150,
  "embedder_queue": 261,
  "db_size_bytes": 1073741824,
  "images_table_bytes": 536870912,
  "images_index_bytes": 268435456
}
```

**GET /api/admin/users**

```json
// レスポンス
{
  "users": [
    {
      "id": 1,
      "email": "admin@example.com",
      "is_admin": true,
      "created_at": "2025-01-01T00:00:00Z",
      "likes": 120,
      "skips": 45
    }
  ]
}
```

**POST /api/admin/crawl**

```json
// リクエスト
{ "query": "anime landscape", "pages": 5 }

// レスポンス 202（バックグラウンドで実行開始）
{ "status": "started", "query": "anime landscape", "pages": 5 }
```

---

## アーキテクチャ

```
ブラウザ
  │
  ├─ Vite dev server (:5173)
  │       ↓ /api/* をプロキシ
  │
  └─ Go バックエンド (:8080)
          ├─ PostgreSQL (:5433)  ← 画像メタデータ + ベクトル
          ├─ Python CLIP (:50051) ← 画像/テキスト埋め込み生成
          └─ Wallhaven API       ← 画像一覧・検索
```

### 技術スタック

| 層 | 採用技術 |
|----|---------|
| バックエンド | Go 1.21 + chi v5 |
| データベース | PostgreSQL 16 + pgvector |
| DB ドライバ | pgx/v5 |
| AI 処理 | Python + open_clip ViT-B/32（CPU）|
| Go-Python 連携 | gRPC（proto: `protos/clip.proto`）|
| フロントエンド | React 19 + TypeScript + Vite 5 |
| ルーティング | React Router v6 |

### 埋め込みキューの仕組み

新規画像が DB に追加されると、バックグラウンドの埋め込みキューに ID が入る。ワーカーが順次 CLIP サービスに画像 URL を渡してベクトルを生成し、DB に保存する。

- Wallhaven のレート制限（45 req/min）を守るため、1 件ごとに 1.4 秒待機
- 起動時・5 分ごとに未処理画像を全スキャンして取りこぼしを防ぐ
- バッファサイズ: 4096 件

---

## DB スキーマ

```sql
-- ユーザー
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  email         TEXT UNIQUE,
  password_hash TEXT,
  is_admin      BOOLEAN DEFAULT FALSE
);

-- 画像
CREATE TABLE images (
  id           BIGSERIAL PRIMARY KEY,
  wallhaven_id TEXT UNIQUE NOT NULL,
  url          TEXT NOT NULL,          -- 元画像 URL（Wallhaven）
  thumb_url    TEXT NOT NULL,          -- サムネ URL（large, ~700px）
  width        INT NOT NULL,
  height       INT NOT NULL,
  ratio        NUMERIC(6,3),
  views        INT,
  favorites    INT,
  fetched_at   TIMESTAMPTZ DEFAULT NOW(),
  embedding    VECTOR(512),            -- CLIP ViT-B/32 特徴量
  colors       TEXT[]                  -- Wallhaven が返す主要色（hex × 最大5色）
);

-- フィードバック
CREATE TABLE feedback_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id),
  image_id   BIGINT REFERENCES images(id),
  kind       TEXT CHECK (kind IN ('like', 'skip')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, image_id, kind)
);
```

マイグレーションは `backend/migrations/*.sql` を起動時に名前順で自動実行する（冪等）。

---

## 開発者向け情報

### よく使うコマンド

```bash
# Go ビルド確認
cd backend && go build ./...

# TypeScript 型チェック
cd frontend && npx tsc --noEmit

# JWT_SECRET 生成
openssl rand -hex 32

# DB の内容確認
docker compose exec postgres psql -U palettevein -d palettevein \
  -c "SELECT COUNT(*), COUNT(embedding) FROM images;"

# 最新フィードバック確認
docker compose exec postgres psql -U palettevein -d palettevein \
  -c "SELECT user_id, image_id, kind, created_at FROM feedback_events ORDER BY created_at DESC LIMIT 10;"

# 管理者権限付与
docker compose exec postgres psql -U palettevein -d palettevein \
  -c "UPDATE users SET is_admin = true WHERE email = 'your@email.com';"
```

### マイグレーション

`backend/migrations/` 以下の `.sql` ファイルをサーバー起動時に昇順で実行する。`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` ベースで冪等に設計されているため、複数回実行しても安全。

新しいマイグレーションを追加する場合は `007_xxxx.sql` のように連番で作成する。

### レート制限

| 対象 | 上限 |
|------|------|
| 全 API（IP 単位） | 300 req/min |
| 認証エンドポイント（IP 単位） | 10 req/min |
