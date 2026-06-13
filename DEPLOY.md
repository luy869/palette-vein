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
#   JWT_SECRET        = openssl rand -hex 32
#   POSTGRES_PASSWORD = openssl rand -hex 24
#   EMBED_DELAY_MS    = 300（CDN負荷を見て調整可）
```

## 2. CLIP をホストで起動（GPU）

```bash
# 使うGPUを固定（チャットボット/ゲームと住み分け。nvidia-smi で番号確認）
CUDA_VISIBLE_DEVICES=1 ./clip_service/run-clip.sh
```

- 起動ログに `CLIP device: cuda:N (GTX ...)` が出れば GPU 利用。`cpu` ならドライバ/torch を確認。
- GPU互換: GTX1070(Pascal)/1650S(Turing) × torch cu128。動かない場合は `clip_service/pyproject.toml` の
  index を cu121 に下げるか、CPU で動かす（埋め込みのボトルネックは DL なので CPU でも実用上問題は小さい）。
- 別ターミナル/別tmuxペインで起動したまま次へ。**ゲーム時は Ctrl+C で停止**（VRAM解放）。

## 3. Docker スタック起動

```bash
./start.sh
# = docker compose -p palettevein -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up -d --build
```

確認:
```bash
docker compose -p palettevein ps                 # postgres/backend/frontend が healthy
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
4. backend ログで埋め込みを確認: `docker compose -p palettevein logs -f backend | grep -E 'embed|dl='`
   → `dl=` が小さい（サムネDL化の効果）
5. **既存チャットボットが無傷で動いていること**を確認（ポート/トンネル衝突なし）

---

## 停止 / 撤去

```bash
./stop.sh                 # 停止（DBボリュームは保持）
# 完全撤去（DBも削除）:
docker compose -p palettevein -f docker-compose.yml -f docker-compose.prod.yml down -v
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
| CLIP が CPU 落ち | `CLIP device:` ログ確認。torch cu128 が GPU 非対応なら cu121 ピン or CPU 運用 |

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

> dev機は 5080/3080 なので cu128 はそのまま動く。**本番(1070/1650S)のGPU互換はサーバー側で別途確認**
> （CLIP起動ログが `cuda` か `cpu` か）。Cloudflare Tunnel/Access は dev機には無いので、その部分は本番サーバーでのみ実施。
