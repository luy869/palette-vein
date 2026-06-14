# PaletteVein デプロイ手順（自宅サーバー・限定公開）

自宅サーバーに、既存のポートフォリオ＋チャットボット（同サーバーで Cloudflare Tunnel 稼働中）と
**共存させて限定公開**するランブック。設計の背景は `docs/deployment-plan.md` を参照。

## 構成

```
[ブラウザ] --HTTPS--> [Cloudflare] --tunnel--> 127.0.0.1:8090 (frontend nginx / Docker)
                                                      │ /api → backend:8080 (Docker)
                                                      │           ├─ postgres:5432 (Docker・専用volume)
                                                      │           └─ host.docker.internal:50051
                                                      ▼
                                              CLIP gRPC :50051 (ホストで手動起動・GPU直接)
```

- **CLIP はホストで手動起動**（GPU直接・systemd 無し）。ゲーム時は止める。
- **Docker は postgres / backend / frontend のみ**（restart: "no"、自動起動しない）。
- 公開は **Cloudflare Tunnel に ingress を1行追加**するだけ。既存ルールは触らない。
- まず **Cloudflare Access** で許可メールのみに限定公開 → 様子見後に全体公開。

---

## 0. 前提

- Docker / Docker Compose v2
- `uv`（CLIP 用）、NVIDIA ドライバ + CUDA（GPU 利用時）
- 既存の cloudflared（チャットボットで稼働中）が使えること
- ホストポート **8090** が空いていること（埋まっていれば prod compose と本手順の番号を変更）

---

## 1. 環境変数

```bash
cp .env.example .env
# 編集して値を設定:
#   COMPOSE_PROJECT_NAME = palettevein（既定のまま）
#   JWT_SECRET           = openssl rand -hex 32
#   POSTGRES_PASSWORD    = openssl rand -hex 24   ← :? 必須。未設定だと up でエラー
#   EMBED_DELAY_MS       = 300（CDN負荷を見て調整可）
#   SECURE_COOKIE        = ローカルHTTP疎通テスト中だけ false（本番HTTPSでは未設定=true）
```

ローカル疎通テスト用の `.env` を一発で作る例（秘密値はサーバー上で生成・チャットに貼らない）:
```bash
{ echo "COMPOSE_PROJECT_NAME=palettevein"
  echo "JWT_SECRET=$(openssl rand -hex 32)"
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
  echo "EMBED_DELAY_MS=300"
  echo "SECURE_COOKIE=false"; } > .env
wc -l .env   # → 5
```

## 2. CLIP をホストで起動（GPU）

> **重要・GPU互換（実機で確定 2026-06-15）**: torch 2.7+cu128 のコンパイル対象は **sm_75 以上**
> （`get_arch_list()` = sm_75/80/86/90/100/120）。本番機の GPU は **GTX 1660 Ti + GTX 1070**:
> - **GTX 1660 Ti（Turing sm_75・6GB）= 対応 ✅ → CLIP はこれ（GPU 0）に固定する**
> - **GTX 1070（Pascal sm_61）= 非対応 ❌**（cu128 が Pascal を切り捨てている。起動時に
>   `no kernel image is available` でクラッシュする）
>
> `_select_device()` は空きVRAM最大を自動選択するため、放置すると **1070 を選んで落ちる**可能性がある。
> **必ず 1660 Ti に固定**すること。実機では 1660 Ti が `nvidia-smi` の GPU 0 なので
> `CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=0` で固定する（番号は `nvidia-smi -L` で確認）。
> **1070 も使いたい場合**: 本番だけ torch を **cu126** に下げる（torch 2.7 の選択肢は cu118/cu126/cu128）。
> cu126 のアーキ一覧は `sm_50,60,70,75,80,86,90`（実測）。**sm_60 を含むので 1070(sm_61) は
> CUDAのマイナーバージョン互換（6.0 cubin は 6.1 デバイスで動く）で動作する見込み**（実機で要最終確認）。
> cu126 なら 1070 と 1660 Ti の両方が使える。ただし cu126 に sm_120 は無いので dev機の RTX5080 は動かない
> → dev=cu128 / prod=cu126 とビルドが分かれる。
> 変更は `clip_service/pyproject.toml` の torch index を `cu126` に、`uv lock` し直して Docker 再ビルド。

```bash
# CLIP を GTX 1660 Ti に固定して起動（実機では GPU 0。番号は nvidia-smi -L で確認）
CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=0 ./clip_service/run-clip.sh
```

- 起動ログに `CLIP device: cuda:0 (NVIDIA GeForce GTX 1660 Ti)` が出て `CLIP model ready` まで進めばOK。
  `cpu` や `no kernel image` エラーなら GPU 選択を見直す。
- 別ターミナル/別tmuxペインで起動したまま次へ。**ゲーム時は Ctrl+C で停止**（VRAM解放）。
- EVA02-B/16 は約1.5GB VRAM なので 1660 Ti(6GB) でも余裕。

## 3. Docker スタック起動

```bash
./start.sh
# = COMPOSE_PROJECT_NAME=palettevein docker compose -f docker-compose.prod.yml --env-file .env up -d --build
#   （古い docker compose は -p 前置を受け付けないため COMPOSE_PROJECT_NAME で渡す。.env にも書いておくと
#     ps/logs/down で -p 無しでもプロジェクトを解決できる）
```

確認:
```bash
docker compose -f docker-compose.prod.yml ps     # postgres/backend/frontend が healthy（.env の COMPOSE_PROJECT_NAME を読む）
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090   # 200(SPA)
```

## 4. Cloudflare Tunnel に ingress を追加

既存の cloudflared 設定（例: `~/.cloudflared/config.yml`）の `ingress:` に、
**catch-all(404)の前**へ1ブロック追加する:

```yaml
ingress:
  # ... 既存ルール ...
  - hostname: palettevein.example.com      # 使うホスト名に置換
    service: http://localhost:8090
  - service: http_status:404               # 既存の catch-all（末尾のまま）
```

DNS を割り当ててトンネルを再読込:
```bash
cloudflared tunnel route dns <TUNNEL_NAME> palettevein.example.com
sudo systemctl restart cloudflared      # 既存tunnelの起動方法に合わせる
```

## 5. Cloudflare Access で限定公開

Cloudflare Zero Trust ダッシュボード → **Access → Applications → Add an application**（Self-hosted）:
- Application domain: `palettevein.example.com`
- Policy: Action=Allow、Include=**Emails**（自分や招待者のメールを列挙）

→ これで許可メールの認証を通った人だけが到達できる。
**全体公開する時はこの Access アプリを削除するだけ**（アプリ側は無変更）。

## 6. 動作確認（エンドツーエンド）

1. `https://palettevein.example.com` にアクセス → Cloudflare Access のメール認証
2. PaletteVein のログイン/登録 → 成功（HTTPS なので Secure Cookie が効く）
3. 画像が表示される（拡大も）/ おすすめ / 検索（テキスト・画像・色）が動く
4. backend ログで埋め込みを確認: `docker compose -f docker-compose.prod.yml logs -f backend | grep -E 'embed|dl='`
   → `dl=` が小さい（サムネDL化の効果）
5. **既存チャットボットが無傷で動いていること**を確認（ポート/トンネル衝突なし）

---

## 停止 / 撤去

```bash
./stop.sh                 # 停止（DBボリュームは保持）
# 完全撤去（DBも削除）:
COMPOSE_PROJECT_NAME=palettevein docker compose -f docker-compose.prod.yml down -v
# さらに ingress の1ブロックを削除し cloudflared 再起動、CLIP は Ctrl+C で停止
```

これで既存サービスを一切残さずクリーンに戻せる。

---

## トラブルシュート

| 症状 | 確認 |
|------|------|
| backend が CLIP に繋がらない | `ss -ltn \| grep 50051`（CLIP起動中か）、`extra_hosts: host.docker.internal:host-gateway` が効いているか |
| ログインできない | HTTPS でアクセスしているか（Secure Cookie は HTTP では送られない）、Access を通過しているか |
| 画像が出ない | `referrerPolicy=no-referrer` は実装済み。CLIP 停止中でも既存埋め込みの閲覧は可能 |
| 8090 が衝突 | 既存サービスが使用中 → prod compose の frontend ポートと ingress の番号を変更 |
| CLIP が起動時クラッシュ（`no kernel image is available`） | **1070(Pascal)に乗った**可能性大。cu128 は sm_75以上のみ。`CUDA_VISIBLE_DEVICES` で **1650S** に固定する |
| CLIP が CPU 落ち | `CLIP device:` ログ確認。1650S に固定しても CPU なら NVIDIA ドライバ/CUDA を確認 |

---

## 付録: ローカル事前テスト（本番サーバーに出す前に dev 機で確認）

本番サーバー（1070+1650S）に出す前に、手元の dev 機（5080+3080 など）で prod compose を
一度通しておくと安心。**HTTPS が無いので Secure Cookie を切る**のがポイント
（切らないとログインCookieがブラウザから送られない）。

1. `.env` をテスト用に用意（`JWT_SECRET`/`POSTGRES_PASSWORD` は適当でよい）。
   **`SECURE_COOKIE=false` を追加**（ローカルHTTPでログインを通すため）。
2. CLIP をホスト起動: `./clip_service/run-clip.sh`
   （空きVRAM最大のGPUを自動選択。dev機なら 3080 が選ばれるはず。ログで `cuda:N` を確認）
3. `./start.sh` → ブラウザで `http://localhost:8090`
4. 登録/ログイン・画像表示・おすすめ・検索を確認。`docker compose -p palettevein logs -f backend` で `dl=` が小さいことを確認。
5. 確認できたら `./stop.sh`。**本番では `.env` から `SECURE_COOKIE` を消す（=true に戻す）**。

> dev機は 5080/3080(cu128対応) なので問題なし。**本番は 1650S に固定すること**
> （1070=Pascal は cu128 非対応＝上記「重要・GPU互換」参照）。
> Cloudflare Tunnel/Access は dev機には無いので、その部分は本番サーバーでのみ実施。
