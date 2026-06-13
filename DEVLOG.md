# PaletteVein 開発ログ

意思決定・設計判断・トラブルシューティングを時系列で記録する。

---

## 2026-05-15 — 設計フェーズ + M1 実装

### プロジェクト概要の確定

- **コンセプト**: 好みを学習し「なぜおすすめされているか」を可視化しながら壁紙を発掘する
- **データソース**: Wallhaven API（公式APIあり、pixivはスクレイピング規約違反リスクで除外）
- **画像保存方針**: URL + ベクトルのみ。本体は取得後削除（ストレージコスト・著作権対策）

### 技術選定

| 技術 | 選定理由 |
|------|---------|
| Go（バックエンド） | 並列処理性能、実装現場での実績 |
| Python（AI処理） | CLIPなどのAIライブラリはPythonが圧倒的 |
| gRPC（Go-Python連携） | 型安全（Protobuf）、高速、将来的にGPUサーバー分離可能。HTTPやサブプロセスより優位 |
| React + Vite（フロントエンド） | 既存の使用経験あり、エコシステム成熟 |
| PostgreSQL + pgvector | RDBとベクトルストアを統合管理、運用負荷が低い |
| CLIP（特徴量） | タグ情報に偏らず雰囲気・構図などを包括的に捉えられる |

### 設計書レビューで確定した判断

**マルチユーザー対応**
- `per-user` 前提でDBスキーマを設計（最初から `user_id` カラムを持つ）
- 理由: 後付けでスキーマ変更すると手戻りが大きい
- M1〜M2は `user_id=1` 固定で動作させ、認証はM3以降に実装

**好みベクトル算出方針**（M2実装時の方針）
- 基本: いいね画像のCLIP埋め込みを時間減衰重み付き平均
- スキップはRocchio法の負例として軽い負の係数で差し引く
- 複峰性対応: 反応が増えたらk-means 2〜3クラスタに分割
- 更新: いいね/スキップごとにインクリメンタル更新

**探索と活用のバランス**（M2以降）
- 推薦結果の20%を「好みから離れた画像」「人気上位の未提示画像」で埋める（ε-greedy風）
- 理由: 類似検索のみだとフィルターバブル化する

**コールドスタート戦略**（M2実装時）
- 閾値: いいね10件 OR 総反応30件で好みベクトル算出開始
- 初期表示: Wallhaven `sorting=toplist`（人気順）とランダムを半々

**推薦理由の可視化**
- M2: まず「推薦元のいいね画像を併記」(b) を実装（最低限の透明性）
- M3: CLIPテキスト類似度によるタグ提示 (a)、系統クラスタリング (c) を評価して確定

**評価指標**（M1からfeedback_eventsを記録して後で集計）
- いいね率: いいね数 / 提示数
- 多様性スコア: 提示画像群のCLIP埋め込みの平均ペアワイズ距離
- 発掘率: いいね画像のうちWallhaven人気順下位に属する割合

### M1 実装での判断

**HTTPルータ: chi v5**
- 理由: 標準 `net/http` 互換、軽量、ミドルウェアが豊富
- Gin/Echo も候補だったが chi の方が標準ライブラリとの摩擦が少ない

**DBマイグレーション: 起動時にSQL直接実行（gooseなし）**
- 理由: M1段階でツール導入は過剰。`CREATE TABLE IF NOT EXISTS` で冪等にする
- M2以降でデータ変更が伴う migration が増えたら goose への切り替えを検討

**Wallhaven画像の直リンク表示**
- 規約に hotlinking の明示的な禁止記述なし → 直リンクで進める
- 問題が生じたらいいね済み画像のみサムネをオブジェクトストレージに保存する代替案に切り替え

**Vite: v5（v9ではなく）**
- 理由: Node v18.20.8 を使用中。create-vite v9+ は Node 20+ 必須でエラー
- `npm create vite@5 frontend -- --template react-ts` で作成
- Node をアップグレードするまで vite@5 系で固定

**CSSフレームワーク: M1はインラインスタイル**
- 理由: M1のスコープはUI動作確認のみ。デザイン整備はM2以降
- M2でTailwindやCSS Modulesの導入を検討

### トラブルシューティング

**Dockerコマンドが最初に "not found" と表示された**
- WSL2 + Docker Desktop 環境で `&&` チェーンのタイミングによって誤検知
- 再実行で正常動作を確認。Docker 28.3.2 が利用可能

---

**M1 動作確認（ブラウザ）**
- `http://localhost:5173` で画像一覧が表示されることを確認
- いいね/スキップボタンが動作し、カードがフェードアウトすることを確認
- M1 完了

---

---

## 2026-05-25 — M2 実装

### アーキテクチャ決定

**パーソナルユース前提に確定**
- 当初「複数ユーザー向けサービス」として設計したが、CPUでの推論コストを考慮して個人用に絞ることを確認
- 実態として既に `user_id=1` 固定・認証なしで設計されており、変更不要だった
- CPU推論（1枚2〜5秒）はバックグラウンドキューで非同期処理するため、UIはブロックされない

**CLIPライブラリ: `open_clip_torch`**
- pip install時にバージョンピンを付けると `torch==2.2.2+cpu` と `open-clip-torch==2.24.0` が依存競合で `ResolutionImpossible`
- バージョンピンを外して `pip install open-clip-torch pillow requests` で解決
- 結果: open_clip_torch 3.3.0 + torch 2.12.0 が入った

**Python gRPC サービス（:50051）**
- `server.py` のパス解決: `from generated import clip_pb2, clip_pb2_grpc` としていたが、`clip_pb2_grpc.py` 内で `import clip_pb2` が絶対インポートされるため `ModuleNotFoundError`
- 解決: `sys.path.insert(0, "./generated")` を追加し、`import clip_pb2 / import clip_pb2_grpc` に変更

### pgvector スキャンの落とし穴

`pgxvec.RegisterTypes` で pgvector 型を登録しても、`rows.Scan` のターゲットとして `*[]float32` は非対応。

```
cannot scan vector (OID 16386) in binary format into *[]float32
```

**解決策**: `pgvector.Vector` 型でスキャンしてから `.Slice()` で `[]float32` に変換する。

```go
// NG
var vec []float32
rows.Scan(&vec)

// OK
var vec pgvector.Vector
rows.Scan(&vec)
slice := vec.Slice()  // []float32
```

`profile.go`・`search.go` の全スキャン箇所を修正。

### 推薦ロジック実装まとめ

| コンポーネント | 実装 |
|---|---|
| 好みベクトル | 過去90日のいいねを時間減衰（半減期9.7日）で重み付き平均 + Rocchio負例（β=0.2） |
| 類似検索 | pgvector cosine（HNSW, ef_search デフォルト）、上位40件から19件選択 |
| 探索枠 | popularity順 × RANDOM() で3倍候補を取りシャッフル、5件選択 |
| 推薦理由 | いいね画像ベクトルをメモリロード → cosine で top-2 を算出（DB往復なし） |
| コールドスタート | いいね0件 → profile=nil → toplist（popularity順24件） |

### M2 完了確認

- CLIP埋め込みがバックグラウンドで自動生成されることを確認（ログ: `embedded image_id=N dim=512`）
- `/api/recommend` が toplist モードで200を返すことを確認
- 「おすすめ」タブに推薦理由サムネが表示されることを確認
- 「いいね」タブでいいね済み画像を参照できることを確認

---

## 2026-05-25 — M3 実装

### 認証設計の決定

**JWT + httpOnly Cookie**
- JWTをhttpOnly Cookieに保存（localStorage より XSS に強い）
- SameSite=Lax でCSRF対策
- 有効期限30日（個人向けアプリとして利便性優先、リフレッシュトークンなし）
- bcrypt cost=12（強度と速度のバランス）

**CORS with credentials**
- `AllowCredentials: true` にする場合、`AllowedOrigins` に `*` は使えない
- `ALLOWED_ORIGIN` 環境変数で制御（デフォルト: `http://localhost:5173`）

**user_id=1 の撤廃**
- 全ハンドラで `const userID int64 = 1` を削除し、`r.Context().Value(ctxUserID).(int64)` に置き換え
- AuthMiddleware が JWT を検証してコンテキストに userID をセット

### Docker化

- backend: Go マルチステージビルド（golang:1.25-alpine → alpine:3.20）
- clip: python:3.11-slim + CPU版torch + open-clip-torch
- frontend: node:18-alpine でビルド → nginx:alpine で静的配信
- docker-compose.yml に全4サービスを統合。ローカル開発は `docker compose up -d postgres` のみでOK
- `clip_service/.dockerignore` で `.venv/` と `__pycache__` を除外しつつ `generated/` はDocker buildに含める（`.gitignore` とは別管理）

### M3 完了確認

- ユーザー登録・ログインが動作することを確認
- ユーザーごとにフィードバックデータが分離されていることを確認
- Dockerfile・docker-compose.yml 作成済み（docker compose up --build で全サービス起動可能）

---

## 2026-05-25 — M4 実装（クローラー + 検索）

### 課題：レコメンド候補が少ない

おすすめ機能はユーザーがブラウズした画像のみをDBに持つため、数百件規模では多様性が不足していた。

### バックグラウンドクローラー

- `crawler.New(pool, wh, eq).Run(ctx)` をサーバー起動時に goroutine で実行
- 3ソート（toplist / views / favorites）× 10ページ = 最大720件を非同期取得
- 各リクエスト間1.5秒の遅延（Wallhaven 45 req/min 制限対策）
- 取得後即 `embedder.Enqueue(id)` → CLIPベクトル生成もバックグラウンドで進む

### 検索機能

**Wallhaven タグ/キーワード検索（既存APIを拡張）**
- `GET /api/images?q=keyword&sorting=relevance` で Wallhaven 検索
- `fetchImages` の第3引数にクエリを追加

**CLIPテキスト→画像検索（新規）**
- `GET /api/search?q=text description`
- Go: `clip.EmbedText(text)` → pgvector cosine ORDER BY → 24件返す
- Python: `open_clip.tokenize` + `model.encode_text` + L2正規化
- proto: `EmbedText(EmbedTextRequest)` RPC追加 (`EmbedTextRequest { string text = 1; }`)

**フロントエンド SearchGrid.tsx**
- CLIP（意味検索）/ Wallhaven（タグ）をボタンで切替
- Wallhaven モードはページネーション対応
- CLIP モードは24件一括表示（ページなし）
- いいね/スキップボタンは他タブと同じ挙動（押したら画面から消える）

### クローラー改善

- `pagesPerSorting` 10 → 50、`latest` ソートは除外（無限増殖防止）
- 24時間ごとの定期再クロールに変更（起動時1回きり → 無限ループ）
- **50,000件キャップ + 自動プルーニング**: クロール前に件数チェックし、超過分を `fetched_at` 昇順（古い順）で削除。フィードバックあり画像は削除対象外。

### M4 完了確認

- `go build ./...` 通過
- `npx tsc --noEmit` 通過

---

## 2026-05-27 — M5: 画質・UX・色テーマ・管理機能

### サムネ画質改善

- Wallhaven API の `thumbs.large`（〜700px）が API レスポンスに含まれることを確認し切り替え
- 既存 DB 行は migration 005 で `UPDATE images SET thumb_url = REPLACE(thumb_url, '/small/', '/lg/')` 一括書き換え
- crawler/handlers の ON CONFLICT に `thumb_url = EXCLUDED.thumb_url` を追加（再クロール時も更新）
- ImageModal は既に `image.url`（元画像）を使っていたため変更不要

### スケルトン・Toast 共通化

- `SkeletonGrid` を共通コンポーネント化（`animate-pulse` カード）
- `ToastProvider + useToast` を `src/lib/toast.tsx` に実装（右下固定、3秒 auto-dismiss）
- 全コンポーネントの `console.error` を `toast('...', 'error')` に置換

### 無限スクロール・もっと見る

- `GET /api/likes?cursor=<fe_id>` cursor ベースページングで無限スクロール実装
- 発見: `?exclude=1,2,3` で既表示 ID を除外し「もっと見る」ボタンで追加ロード
- おすすめ: 同エンドポイントを再リクエスト + フロントで dedup

### 色テーマ機能（D1/D2/D3）

- Wallhaven API はレスポンスに `colors: [hex×5]` を含む → 色抽出ロジック不要
- migration 006 で `images.colors TEXT[]` + GIN インデックス追加
- `GET /api/search/color?hex=ff8800`: Go 側で全件 RGB ユークリッド距離計算 → 上位 24件
- `GET /api/profile/palette`: いいね最新100件の colors を集計 → 頻度上位10色
- フロント: 検索に「色で検索」タブ追加（ColorPicker + プリセット5色）
- フロント: 「パレット」タブ追加（ProfilePalette.tsx で色ドット可視化）

### 管理機能強化

- `embedder.Queue.Len()` を追加し `/api/admin/stats` に `embedder_queue` フィールドを追加
- `POST /api/admin/crawl` で crawler.FetchQuery をバックグラウンド実行（即時 202 返す）
- Server struct に `crawler` フィールドを追加、NewServer の引数に追加

### 設計判断

- 色検索は CLIP に投げず RGB ユークリッド距離のみ: 50,000件なら Go 側ソートで十分（< 100ms）
- おすすめの「もっと見る」はサーバー側 exclude 不要: 推薦は毎回異なる結果が返るため dedup で十分
- プロフィールのパレット可視化は集計のみ（動的アクセントカラーはスコープ外）

---

## 2026-06-11 — 信頼性・スケーラビリティ改善（自律改善セッション）

コミット単位の詳細（背景・コードレベルの変更点・検証結果・レビュー指摘）は `docs/changes-2026-06-11.md` を参照。

### 信頼性

- Wallhaven HTTP クライアントに 30秒タイムアウトを設定（無限待ちによる goroutine 滞留を防止）
- frontend の全 API 呼び出しに 30秒タイムアウト追加（`withTimeout` ヘルパー。タイムアウトは `TimeoutError` になり、`AbortError` 無視ロジックに引っかからずエラー表示される）
- 管理画面クロールの goroutine を `context.Background()` からサーバーライフサイクルの context に変更（shutdown 時に中断される）
- embedder キュー満杯時の silent drop をログ出力に変更（catchup が後で回収する設計は維持）
- React Error Boundary を追加（タブ描画エラーでの白画面を防止。`main.tsx` ではなく `App.tsx` の `<Routes>` をラップ）

### スケーラビリティ

- 色検索を全件 Go ソートから SQL 内ソートに変更: `unnest(colors)` + `('x' || hex)::bit(24)::int` で hex→int 変換し、最小 RGB 二乗距離で `ORDER BY`。12.6千件で 32ms（EXPLAIN ANALYZE 実測）
- Wallhaven API のレート制限を `wallhaven.Client` 内部に中央集約（1.5秒間隔の予約方式）。定期クローラーと管理画面クロールが同時に走っても合計が 45 req/min を超えない
- CORS の `ALLOWED_ORIGIN` をカンマ区切りの複数オリジン対応に変更

### 運用・品質

- `log.Printf` を `log/slog` に全面移行（29箇所）。`LOG_FORMAT=json` で JSON 出力、デフォルトはテキスト
- recommend パッケージのプロファイル計算を純粋関数 `computeProfileVector` に抽出し、table-driven テストを追加（13テスト: l2normalize / computeProfileVector / cosineSim / topNReasons）
- ビルド成果物 `backend/server` を .gitignore に追加

### 見送り（要ユーザー判断）

- JWT TTL 短縮（30日→7日）: CLAUDE.md に 30日が設計決定として明記されているため変更せず
- Wallhaven API キー設定: 外部キーの取得が必要なため見送り

### UI/UX改善（同日追加）

- いいね/スキップを楽観的UI化: 即座にカードが消え（200msフェード+縮小）、成功Toastの「取り消す」でundo可能（5秒）。失敗時は自動復元。undoのため `DELETE /api/feedback` に optional な `kind` を追加（省略時 like で後方互換）
- おすすめタブはフィードバックのたびに全リスト再取得していたのを楽観的削除に変更
- グリッド幅を全タブ `minmax(280px, 1fr)` に統一（`src/lib/grid.ts` の定数）
- focus-visible リング標準化、alt テキスト改善（`壁紙 幅×高さ`）
- パレットタブの色ドットをクリックすると `/search?hex=...` で色検索に飛ぶ連携を追加
- 画像モーダルにフォーカストラップ + `role="dialog"` / `aria-modal` を追加
- 見送り: タブ状態の保持（データ/スクロール位置）とモーダルの前後ナビゲーションは規模が大きいため次回候補

---

## 2026-06-13 — 信頼性改善 第2回（自律改善セッション）

コミット単位の詳細は `docs/changes-2026-06-13.md` を参照。

### 実施した改善

- admin統計を9クエリ→1クエリに統合（3秒ポーリングのDB負荷削減）
- 認証Cookie生成失敗を黙殺せず500で返却（Cookieなし200が返るバグの修正）
- パレット集計のバブルソートを sort.Slice に置換
- ログなしの「db error」18箇所に slog.Error を追加（Sonnetサブエージェントに委任）
- 画像検索の CLIP タイムアウトを60秒→30秒（フロントの30秒タイムアウトに整合）

### ドキュメント

- `docs/interview-guide.md` — 面接用プロジェクト解説ガイドを作成
- `docs/proposals-2026-06-13.md` — アーキテクチャ変更を伴う改善7件を選択肢・推奨付きで整理
  - 採用推奨: プロフィールのオンメモリTTLキャッシュ、k-means複峰性対応（推薦の質に直結）
  - 見送り推奨: RANDOM()改善（5万件キャップ内では問題なし）、embedder優先度キュー（ボトルネックはCLIP推論）
  - 実測待ち: NOT IN → NOT EXISTS 書き換え

### 判断メモ

- Explore調査の指摘のうち4件は検証の結果却下（既存UNIQUE索引のプレフィックス利用で
  インデックス追加不要、など）。サブエージェントの指摘は必ずメインで裏取りしてから実装する

### 提案の採用実装（ユーザー承認後・同日）

**好みベクトルのオンメモリTTLキャッシュ**（68871a4）
- 5分TTL + フィードバック時 Invalidate。nil（コールドスタート）もキャッシュ
- 「いいね直後におすすめが変わる」体験は Invalidate で維持

**k-meansによる好みの複峰性対応**（dc00ee8）— 設計フェーズからの宿題を実装
- スフェリカルk-means（コサイン類似度）+ maximin初期化（決定的・乱数なし）
- k=1〜3をエルボー法で自動選択（品質改善 +0.03 未満で打ち切り、最小クラスタ5件）
- いいね30件以上で発動。推薦枠19件を系統のいいねシェアに比例配分（最大剰余法・最低1件）
- APIレスポンス形式は不変（フロント変更不要）。テスト13件追加（計26件全通過）
- 詳細設計・判断理由は docs/changes-2026-06-13.md 第2部を参照

### フロントエンドUX改修（同日・第3部）

Explore でフロント全体を調査（15項目）。高効果のものを実装。

- **タブ切替でデータ・スクロール位置を保持**（8cdf833）: `<Routes>` を KeepAlive 方式に変更。
  探索系4タブは `display:none` でDOM保持、パレット/管理は鮮度優先で毎回再マウント。
  スクロール位置を useLayoutEffect で復元。各タブを個別 ErrorBoundary で包む
- **画像モーダルに前後ナビゲーション**（93742dc）: モーダル状態をカードからグリッドへリフトし
  `useImageModal` フックで一元管理。‹ › ボタン・←→キー・「N / 総数」表示。全4グリッド対応。
  フォーカストラップを `button:not([disabled])` に改善
- **小改善**（7961346・Sonnet委任）: おすすめモード説明の明確化、検索ボタンの focus ring、
  色検索の空状態メッセージ専用化
- 見送り/次回候補は docs/proposals-frontend-2026-06-13.md（ライトモード廃止案・モバイル対応・
  エラー表示統一・サムネのキーボード操作・モーダル前後プリロードなど）

### 設計判断メモ（フロント）

- **モーダル位置は index 保持・open は id 起点**: 無限スクロールで一覧が伸びても開いている
  位置がずれないように。末尾追加は既存 index に影響しないため安全
- **KeepAlive の保持対象を絞る**: 全タブ保持ではなく、鮮度が重要なパレット・
  ポーリングを持つ管理は除外。「保持すべきもの」と「最新であるべきもの」を区別

### デプロイ計画（検討開始・決定待ち）

- デプロイ可能性を調査。Docker化・同一オリジン配信・JWT/Secure Cookie は本番対応済みと確認
- 当初VPS/PaaSを検討したが、ユーザーが高性能自宅サーバー（i7-10700KF / 32GB / GTX1070+1650S / SSD1TB）を
  保有しているため自宅ホスティング方針に。CLIPのGPU化（CPU 2-5秒/枚 → GPU 数十ミリ秒）が最大の収穫
- 公開方法は Cloudflare Tunnel 推奨（ポート開放不要・自宅IP非公開・無料公開HTTPS）
- 詳細・決定待ち論点（サーバーの所在/公開可否/GPU対応の範囲）は `docs/deployment-plan.md` を参照。
  ユーザーが確認事項ありとのことで一旦保留

### バグ修正: 拡大画像が頻繁に403で表示されない（59b8e88）

- 症状: モーダルで元画像が「結構な頻度で」表示されない
- 原因: **Wallhaven（Cloudflare）の Referer ベースのホットリンク保護**。
  フル画像（w.wallhaven.cc）の約36%が、localhost からの Referer 付きリクエストを403拒否。
  サムネ（th.wallhaven.cc）は保護対象外なのでグリッドは正常だった
- 切り分け: サンプルを25件に増やして36%の再現率を確認 → UA/Referer を1つずつ変えて
  二分探索 → 「Referer を送らなければ200」と確定
- 修正: 全 wallhaven img に `referrerPolicy="no-referrer"`。モーダルは onError で
  サムネにフォールバック。プロキシ/APIキーは不要（理由は docs/changes-2026-06-13.md 第10項）
- 詳細な調査記録は docs/changes-2026-06-13.md「10. 拡大画像が頻繁に403で…」を参照
