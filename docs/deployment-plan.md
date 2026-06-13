# デプロイ計画（検討中）

> ステータス: **検討中／一部決定待ち**。下部の「決定待ちの論点」に答えが出たら本文を更新する。
> このドキュメントは最新の1版を維持する（更新履歴は末尾）。

2026-06-13 にデプロイ可能性を調査した記録と方針案。

---

## 1. 現状のデプロイ可能性（調査結果）

アーキテクチャ的にはすでにデプロイ可能な状態に近い。

| 項目 | 状態 |
|------|------|
| Docker化 | 4サービス全てに Dockerfile あり（postgres / clip / backend / frontend） |
| オーケストレーション | `docker-compose.yml` にヘルスチェック・`depends_on` あり |
| フロント→API | client.ts は **相対パス `/api`** を使用。nginx が裏の backend へプロキシ |
| → CORS | フロントとAPIが**同一オリジン**配信になるため CORS は実質無関係。Cookie認証もそのまま動く |
| JWT_SECRET | 必須化済み（未設定なら起動失敗） |
| SECURE_COOKIE | デフォルトON（`!= "false"`）。**= 平文HTTPだとログインCookieが送られず認証が壊れる → HTTPS必須** |
| ALLOWED_ORIGIN | 環境変数・カンマ区切り複数対応（同一オリジン配信なら出番なし） |

---

## 2. 本番前に対処すべき点

### 2-1. HTTPS/TLS（必須）
`Secure` Cookie がデフォルトONのため、**HTTPSは必須**（平文HTTPだとログインが動かない）。
前段にリバースプロキシ（Caddy または Cloudflare Tunnel）を置いて TLS 終端する。

### 2-2. シークレットの外出し
- `docker-compose.yml` の `POSTGRES_PASSWORD: palettevein` がベタ書き → `.env` へ
- `JWT_SECRET` は本物の値を `.env` で（composeは既に `${JWT_SECRET}` を読む）
- `.env` は未コミット（`.gitignore`）

### 2-3. ホスティング先 → **自宅サーバーで確定見込み**
当初はVPS/PaaSを検討（CLIPのRAM・常駐クローラーがネックで無料tier不向き）だったが、
ユーザーが高性能な自宅サーバーを保有しているため**そちらに全部乗せる方針**。

---

## 3. 利用可能なハードウェア（ユーザー保有の自宅サーバー）

| 部品 | スペック | 備考 |
|------|---------|------|
| CPU | Intel i7-10700KF | 8コア16スレッド。"KF" = 内蔵GPUなし |
| RAM | 32GB | CLIPのメモリ懸念は完全に解消 |
| GPU | GTX 1070（8GB VRAM） + GTX 1650 Super系 | **要確認: 1650の正確なモデル**（Super / Ti でVRAMが変わる） |
| ストレージ | SSD 1TB | DB・画像URLメタデータには十分 |

→ VPS費用ゼロ。RAMもストレージも余裕。**GPUがあるのが最大の強み**。

---

## 4. 最大の収穫：CLIPのGPU化

現状の CLIP サービスは **CPU推論で1枚2〜5秒**、起動時クロール分の埋め込みに数時間かかる。
GPU（1070でも十分）を使えば ViT-B/32 は **1枚10〜50ミリ秒**。

**効果**:
- 起動時の埋め込みバックログが数時間 → 数分に
- 画像アップロード検索が体感ゼロ秒
- より高精度な CLIP（例: ViT-L/14）への引き上げ余地も生まれる（推薦の質向上）

**必要な作業**:
- CLIP Dockerfile を CUDA版PyTorchベースに変更
- `nvidia-container-toolkit` でDockerにGPUを渡す（compose の `deploy.resources.devices` or `--gpus`）
- `server.py` で `model.to('cuda')`、入力テンソルもGPUへ
- WSL2上で動かす場合は Windows のNVIDIAドライバ + WSLのCUDAパススルー設定が必要

---

## 5. 自宅サーバーの公開方法（論点）

| 方式 | 長所 | 短所 |
|------|------|------|
| **Cloudflare Tunnel（推奨）** | ポート開放不要・自宅IP非公開・無料の公開HTTPS URL・証明書自動。面接で実URLを見せられる | Cloudflareアカウント＋ドメイン（無料ドメインでも可）が要る |
| Tailscale | 設定簡単・完全プライベート | 公開不可（自分/招待者のみ）。ポートフォリオには不向き |
| ポート開放 + DDNS + Caddy | 仕組みが素直 | 自宅IP露出・ルーター設定・セキュリティ責任が自分 |

---

## 6. 推奨方針（暫定）

**自宅サーバー上で既存compose + Cloudflare Tunnel + CLIP GPU対応**を一気に入れる。
- 追加作業が最小（compose構成を活かす）
- GPUでCLIPが化ける（面接でも「GPU推論に最適化した」と語れる）
- Cloudflare Tunnelで安全に公開URLを出せる（デモ/ポートフォリオに最適）

---

## 7. 決定待ちの論点（ユーザー確認中）

> ユーザーが「確かめたいことがある」とのことで一旦保留。再開時はここから。

1. **このサーバーは常時起動の別マシンか、今開発しているWSL2マシン自体か？**
   （24/7運用の可否、GPUパススルーの設定方法が変わる）
2. **公開したいか（ポートフォリオ/デモ）、自分だけ使えればよいか？**
   → 公開なら Cloudflare Tunnel、私用なら Tailscale
3. **GPU対応は今回まとめてやるか、まずCPUのまま動かして後でGPU化するか？**
4. （付随）**GTX 1650 の正確なモデル**（Super/Ti）— VRAM確認のため
5. （付随）**使えるドメインの有無**（DEPLOY.md を具体化するため）

---

## 8. 決定後に用意する成果物（予定）

- `docker-compose.prod.yml`（ポート公開を絞り、postgres/clip/backendは内部のみ、外向きはTunnel/443経由）
- Cloudflare Tunnel 設定（cloudflared サービス）or Caddy 設定
- GPU対応版 `clip_service/Dockerfile` + `server.py` のCUDA対応（採用時）
- `.env.example` 更新（DB_PASSWORD外出し）
- `DEPLOY.md`（自宅サーバー構築〜公開までのランブック）

---

## 参考資料

- `docker-compose.yml` / 各 `Dockerfile` / `frontend/nginx.conf` — 調査対象
- `CLAUDE.md` — 技術スタック・設計方針
- `backend/cmd/server/main.go` — `JWT_SECRET` 必須化・`SECURE_COOKIE` デフォルトON の確認元

---

## 更新履歴

- 2026-06-13 初版（デプロイ可能性調査・自宅サーバー方針・GPU化案・公開方法の比較・決定待ち論点）
