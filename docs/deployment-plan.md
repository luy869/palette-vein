# デプロイ計画（検討中）

> ステータス: **方針確定・実装中**。実装手順は `DEPLOY.md`、承認済み詳細プランも参照。
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

## 4. 訂正：CLIPは既にGPU化済み・ボトルネックはDLだった

**当初「CPUで2〜5秒、GPU化が必要」と書いたが誤り**（コード調査で判明）。実際は:
- `server.py _select_device()` が**空きVRAM最大のGPUを自動選択**（無ければCPU）。torchはcu128（CUDA 12.8）
- 推論は既に高速。**埋め込みの遅さの正体はDL＋固定スリープ**だった:
  embedderが `url`（フル画像2〜11MB）をCLIPに渡し、CLIP側で全DLしてから224pxに縮小＋毎回1.4秒スリープ
- **対応済み**（commit `8e2800a`）: 埋め込みを `thumb_url`（約700px/数百KB）からに変更
  （CLIPは入力を224pxに縮小するため品質はフル画像と同等、DLが20〜50倍軽量）。
  スリープも `EMBED_DELAY_MS`（既定300ms）化

**デプロイ時のGPU**: CLIP は**ホストで直接起動**してGPUをそのまま使う（Dockerにパススルーしない）。
既存composeはGPUを渡していないため、Dockerのままだと逆にCPU落ちする点に注意。
GPU互換（1070=Pascal/1650S=Turing × cu128）は実機で要確認、非対応ならcu121ピン or CPU（DL律速なので許容）。

---

## 5. 自宅サーバーの公開方法（論点）

| 方式 | 長所 | 短所 |
|------|------|------|
| **Cloudflare Tunnel（推奨）** | ポート開放不要・自宅IP非公開・無料の公開HTTPS URL・証明書自動。面接で実URLを見せられる | Cloudflareアカウント＋ドメイン（無料ドメインでも可）が要る |
| Tailscale | 設定簡単・完全プライベート | 公開不可（自分/招待者のみ）。ポートフォリオには不向き |
| ポート開放 + DDNS + Caddy | 仕組みが素直 | 自宅IP露出・ルーター設定・セキュリティ責任が自分 |

---

## 6. 確定方針

- CLIP は**ホストで手動起動**（GPU直接・systemd無し＝ゲーム併用のため常駐させない）、他3サービスはDocker
- **Cloudflare Tunnel**（既存tunnelにingress 1行追加）＋ **Cloudflare Access** で限定公開（許可メールのみ）→様子見
- 既存のポートフォリオ＋チャットボットと**完全隔離**（別composeプロジェクト・専用ポート8090・専用DBボリューム・即撤去可能）
- 埋め込みDL最適化（サムネ化＋スリープ短縮）は実装済み（commit `8e2800a`）
- 実装手順は `DEPLOY.md` を参照

---

## 7. 決定事項（解決済み）

1. サーバーはゲームにも使う環境 → **常駐デーモン無し・手動起動**（CLIPもDockerスタックも）
2. **限定公開**（Cloudflare Access で許可メールのみ）→様子見後に全体公開
3. CLIPは既にGPU化済み。**ホスト直接起動でGPU利用**（Dockerパススルーはしない）
4. 埋め込みは**サムネ化＋スリープ短縮で対応済み**（GPUはボトルネックではなかった）

### 実行時にユーザーから必要な入力
- PaletteVein用ホスト名 / 既存cloudflared設定の場所＋tunnel名 / CLIPに割当てるGPU（`CUDA_VISIBLE_DEVICES`）
  / ホストポート8090の空き確認 / `JWT_SECRET`・`POSTGRES_PASSWORD`（こちらで生成）

---

## 8. 用意する成果物

- `docker-compose.prod.yml`（postgres/backendは内部のみ、frontendは127.0.0.1:8090、clipは起動しない）
- `clip_service/run-clip.sh`（GPU指定でホスト手動起動）、`start.sh`/`stop.sh`（Dockerスタック）
- Cloudflare Tunnel ingress 追記＋ Access ポリシー（手順は DEPLOY.md）
- `.env.example` 更新（POSTGRES_PASSWORD/JWT_SECRET/EMBED_DELAY_MS）
- `DEPLOY.md`（自宅サーバー手動起動〜限定公開〜撤去までのランブック）

---

## 参考資料

- `docker-compose.yml` / 各 `Dockerfile` / `frontend/nginx.conf` — 調査対象
- `CLAUDE.md` — 技術スタック・設計方針
- `backend/cmd/server/main.go` — `JWT_SECRET` 必須化・`SECURE_COOKIE` デフォルトON の確認元

---

## 更新履歴

- 2026-06-13 方針確定に更新: CLIPは既にGPU化済み（CPU記述は誤りだった）と訂正、ボトルネックはDL→サムネ化で対応済み（8e2800a）、CLIPホスト手動起動・CF Access限定公開・完全隔離を確定
- 2026-06-13 初版（デプロイ可能性調査・自宅サーバー方針・GPU化案・公開方法の比較・決定待ち論点）
