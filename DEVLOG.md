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
