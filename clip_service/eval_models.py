"""CLIPモデル比較ハーネス（テスト用・本体とは独立）。

同じ画像サンプルを複数のCLIPモデルで埋め込み、同じテキストクエリ／画像アンカーに対する
上位結果をHTMLでサムネ並べて見比べる。

  cd clip_service && uv run python eval_models.py

入力: /tmp/eval_urls.txt（thumb_url を1行1件）
出力: /tmp/model_eval.html（ブラウザで開く）
"""
import io
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests
import timm
import torch
import open_clip
from PIL import Image

URLS_FILE = "/tmp/eval_urls.txt"
OUT = "/tmp/model_eval.html"
TOPK = 8
BATCH = 64

# (アーキテクチャ, pretrained, 表示名)。dim512=スキーマ変更不要 / dim768=要スキーマ変更
MODELS = [
    ("ViT-B-32", "openai", "B/32 openai（現状・baseline / 512）"),
    ("ViT-B-16", "laion2b_s34b_b88k", "B/16 laion2b（512）"),
    ("EVA02-B-16", "merged2b_s8b_b131k", "EVA02-B/16（512・高品質）"),
    ("ViT-B-16-SigLIP-i18n-256", "webli", "SigLIP B/16 多言語（日本語◎ / 768）"),
    ("EVA02-L-14", "merged2b_s4b_b131k", "EVA02-L/14（768・最高品質）"),
    ("ViT-L-14", "laion2b_s32b_b82k", "L/14 laion2b（768）"),
]

TEXT_QUERIES = [
    "cyberpunk city with neon lights at night",
    "calm mountain landscape in nature",
    "cute anime girl",
    "epic fantasy dragon",
    "outer space galaxy and stars",
    "夜の森と月明かり",  # 日本語（多言語性の差を見る）
]

ANCHOR_INDICES = [0, 60, 130]  # 画像→類似画像 の起点（サンプル内インデックス）

DINO_MODELS = [
    ("vit_small_patch14_dinov2", "DINOv2 ViT-S/14（384・画像専用）"),
    ("vit_base_patch14_dinov2", "DINOv2 ViT-B/14（768・画像専用）"),
]


def pick_device() -> str:
    if not torch.cuda.is_available():
        return "cpu"
    best = max(range(torch.cuda.device_count()),
               key=lambda i: torch.cuda.mem_get_info(i)[0])
    return f"cuda:{best}"


def wid_from_thumb(url: str) -> str:
    m = re.search(r"/([a-z0-9]+)\.(jpg|png)$", url)
    return m.group(1) if m else ""


def download(url: str):
    try:
        r = requests.get(url, timeout=15, headers={"User-Agent": "PaletteVein-eval/0.1"})
        r.raise_for_status()
        return url, Image.open(io.BytesIO(r.content)).convert("RGB")
    except Exception:
        return url, None


def load_images():
    urls = [l.strip() for l in open(URLS_FILE) if l.strip()]
    print(f"downloading {len(urls)} thumbnails ...", flush=True)
    pairs = []
    with ThreadPoolExecutor(max_workers=16) as ex:
        for url, img in ex.map(download, urls):
            if img is not None:
                pairs.append((url, img))
    print(f"  got {len(pairs)} images", flush=True)
    return [u for u, _ in pairs], [im for _, im in pairs]


@torch.no_grad()
def embed_images(model, preprocess, images, device):
    feats = []
    for i in range(0, len(images), BATCH):
        batch = torch.stack([preprocess(im) for im in images[i:i + BATCH]]).to(device)
        v = model.encode_image(batch)
        v = v / v.norm(dim=-1, keepdim=True)
        feats.append(v.cpu())
    return torch.cat(feats)


@torch.no_grad()
def embed_texts(model, tokenizer, texts, device):
    tokens = tokenizer(texts).to(device)
    v = model.encode_text(tokens)
    v = v / v.norm(dim=-1, keepdim=True)
    return v.cpu()


def run_model(arch, pretrained, device, images, texts):
    """1モデル分の (text_topk, anchor_topk) を返す。失敗時は None（全体は落とさない）。"""
    model = None
    try:
        model, _, preprocess = open_clip.create_model_and_transforms(
            arch, pretrained=pretrained, device=device)
        model.eval()
        tokenizer = open_clip.get_tokenizer(arch)

        t0 = time.time()
        img_feat = embed_images(model, preprocess, images, device)  # [N, D]
        txt_feat = embed_texts(model, tokenizer, texts, device)      # [Q, D]

        text_topk = []
        for q in range(len(texts)):
            sims = img_feat @ txt_feat[q]
            text_topk.append(sims.topk(TOPK).indices.tolist())

        anchor_topk = []
        for idx in ANCHOR_INDICES:
            sims = img_feat @ img_feat[idx]
            order = sims.argsort(descending=True).tolist()  # 自分自身を除いて上位
            anchor_topk.append([j for j in order if j != idx][:TOPK])

        print(f"  {arch}/{pretrained}: embedded {len(images)} imgs in {time.time()-t0:.1f}s", flush=True)
        return text_topk, anchor_topk
    except Exception as e:
        print(f"  !! {arch}/{pretrained} failed: {e}", flush=True)
        return None
    finally:
        del model
        if device != "cpu":
            torch.cuda.empty_cache()


def run_dino(name, device, images):
    """DINOv2 モデル1つ分の anchor_topk を返す。失敗時は None。"""
    model = None
    try:
        model = timm.create_model(name, pretrained=True, num_classes=0).to(device).eval()
        cfg = timm.data.resolve_data_config({}, model=model)
        tf = timm.data.create_transform(**cfg)

        t0 = time.time()
        feats = []
        with torch.no_grad():
            for i in range(0, len(images), 32):
                batch = torch.stack([tf(im) for im in images[i:i + 32]]).to(device)
                v = model(batch)
                v = v / v.norm(dim=-1, keepdim=True)
                feats.append(v.cpu())
        img_feat = torch.cat(feats)

        anchor_topk = []
        for idx in ANCHOR_INDICES:
            sims = img_feat @ img_feat[idx]
            order = sims.argsort(descending=True).tolist()
            anchor_topk.append([j for j in order if j != idx][:TOPK])

        print(f"  {name}: embedded {len(images)} imgs in {time.time()-t0:.1f}s", flush=True)
        return anchor_topk
    except Exception as e:
        print(f"  !! {name} failed: {e}", flush=True)
        return None
    finally:
        del model
        if device != "cpu":
            torch.cuda.empty_cache()


def thumb_html(url):
    wid = wid_from_thumb(url)
    link = f"https://wallhaven.cc/w/{wid}" if wid else url
    return (f'<a href="{link}" target="_blank">'
            f'<img src="{url}" referrerpolicy="no-referrer" '
            f'style="width:130px;height:82px;object-fit:cover;border-radius:6px;margin:2px"></a>')


def build_html(urls, results, labels, dino_results=None, dino_labels=None):
    import html as H
    parts = ['<html><head><meta charset="utf-8"><title>CLIP model eval</title>',
             '<style>body{background:#0a0a14;color:#cbd5e1;font-family:sans-serif;padding:16px}'
             'h2{color:#a78bfa;border-bottom:1px solid #333;padding-bottom:4px;margin-top:32px}'
             '.q{font-size:18px;color:#e2e8f0;margin:18px 0 6px}'
             '.row{display:flex;align-items:center;margin:4px 0;flex-wrap:wrap}'
             '.lbl{width:140px;font-size:13px;color:#94a3b8;flex-shrink:0}</style></head><body>']
    parts.append("<h1>CLIPモデル比較</h1>")
    parts.append(f"<p>サンプル {len(urls)} 枚 / 各クエリ上位 {TOPK} 件。各行が1モデル。"
                 "クエリの意味に合う画像が並ぶモデルほど良い。</p>")

    parts.append("<h2>テキスト検索の比較</h2>")
    for qi, query in enumerate(TEXT_QUERIES):
        parts.append(f'<div class="q">🔍 {H.escape(query)}</div>')
        for mi, label in enumerate(labels):
            if results[mi] is None:
                continue
            text_topk, _ = results[mi]
            imgs = "".join(thumb_html(urls[j]) for j in text_topk[qi])
            parts.append(f'<div class="row"><div class="lbl">{H.escape(label)}</div>{imgs}</div>')

    parts.append("<h2>画像 → 類似画像の比較</h2>")
    for ai, idx in enumerate(ANCHOR_INDICES):
        parts.append(f'<div class="q">起点画像:</div>')
        parts.append(f'<div class="row"><div class="lbl">anchor</div>{thumb_html(urls[idx])}</div>')
        for mi, label in enumerate(labels):
            if results[mi] is None:
                continue
            _, anchor_topk = results[mi]
            imgs = "".join(thumb_html(urls[j]) for j in anchor_topk[ai])
            parts.append(f'<div class="row"><div class="lbl">{H.escape(label)}</div>{imgs}</div>')
        if dino_results:
            for di, dlabel in enumerate(dino_labels):
                if dino_results[di] is None:
                    continue
                imgs = "".join(thumb_html(urls[j]) for j in dino_results[di][ai])
                parts.append(f'<div class="row"><div class="lbl">{H.escape(dlabel)}</div>{imgs}</div>')

    parts.append("</body></html>")
    with open(OUT, "w") as f:
        f.write("\n".join(parts))


def main():
    device = pick_device()
    print(f"device: {device}", flush=True)
    urls, images = load_images()
    if len(images) < TOPK + 1:
        print("not enough images", file=sys.stderr)
        sys.exit(1)

    labels = [m[2] for m in MODELS]
    results = []
    for arch, pretrained, label in MODELS:
        print(f"== {label} ==", flush=True)
        results.append(run_model(arch, pretrained, device, images, TEXT_QUERIES))

    dino_labels = [d[1] for d in DINO_MODELS]
    dino_results = []
    for name, label in DINO_MODELS:
        print(f"== {label} ==", flush=True)
        dino_results.append(run_dino(name, device, images))

    build_html(urls, results, labels, dino_results, dino_labels)
    print(f"\nwrote {OUT}", flush=True)


if __name__ == "__main__":
    main()
