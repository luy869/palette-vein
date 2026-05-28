import io
import sys
import time
import logging
from concurrent import futures

import grpc
import requests
import torch
import open_clip
from PIL import Image

sys.path.insert(0, ".")
sys.path.insert(0, "./generated")
import clip_pb2
import clip_pb2_grpc

MODEL_NAME = "ViT-B-32"
PRETRAINED = "openai"
HTTP_TIMEOUT = 15
PORT = 50051

def _select_device() -> str:
    if not torch.cuda.is_available():
        return "cpu"
    best = max(range(torch.cuda.device_count()),
               key=lambda i: torch.cuda.mem_get_info(i)[0])
    return f"cuda:{best}"

DEVICE = _select_device()


class ClipServicer(clip_pb2_grpc.ClipServiceServicer):
    def __init__(self):
        device_name = torch.cuda.get_device_name(DEVICE) if DEVICE != "cpu" else "cpu"
        logging.info("CLIP device: %s (%s)", DEVICE, device_name)
        logging.info("loading CLIP %s/%s ...", MODEL_NAME, PRETRAINED)
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            MODEL_NAME, pretrained=PRETRAINED, device=DEVICE
        )
        self.model.eval()
        # ウォーム推論（初回RPC の長い待ちを平準化）
        with torch.no_grad():
            self.model.encode_image(torch.zeros(1, 3, 224, 224).to(DEVICE))
        logging.info("CLIP model ready")

    def _load_image(self, req: clip_pb2.EmbedRequest) -> Image.Image:
        if req.raw_bytes:
            return Image.open(io.BytesIO(req.raw_bytes)).convert("RGB")
        if req.url:
            r = requests.get(
                req.url,
                timeout=HTTP_TIMEOUT,
                headers={"User-Agent": "PaletteVein/0.1"},
            )
            r.raise_for_status()
            return Image.open(io.BytesIO(r.content)).convert("RGB")
        raise ValueError("either url or raw_bytes is required")

    def _embed_pil(self, img: Image.Image) -> list[float]:
        with torch.no_grad():
            x = self.preprocess(img).unsqueeze(0).to(DEVICE)
            v = self.model.encode_image(x)
            v = v / v.norm(dim=-1, keepdim=True)  # cosine 用に L2 正規化
        return v.squeeze(0).cpu().tolist()

    def Embed(self, request, context):
        t0 = time.time()
        rid = request.request_id or "-"
        try:
            img = self._load_image(request)
            t1 = time.time()
            vec = self._embed_pil(img)
            t2 = time.time()
            dl_ms = int((t1 - t0) * 1000)
            inf_ms = int((t2 - t1) * 1000)
            logging.info("embed ok req=%s dim=%d total=%dms (dl=%dms inf=%dms)",
                         rid, len(vec), dl_ms + inf_ms, dl_ms, inf_ms)
            return clip_pb2.EmbedResponse(
                vector=vec,
                dim=len(vec),
                model=f"open_clip:{MODEL_NAME}/{PRETRAINED}",
                latency_ms=latency,
            )
        except Exception as e:
            logging.error("embed error req=%s: %s", rid, e)
            context.abort(grpc.StatusCode.INTERNAL, f"embed failed: {e}")

    def EmbedText(self, request, context):
        t0 = time.time()
        try:
            tokens = open_clip.tokenize([request.text])
            with torch.no_grad():
                v = self.model.encode_text(tokens)
                v = v / v.norm(dim=-1, keepdim=True)
            vec = v.squeeze(0).cpu().tolist()
            latency = int((time.time() - t0) * 1000)
            logging.info("embed_text ok dim=%d latency=%dms", len(vec), latency)
            return clip_pb2.EmbedResponse(
                vector=vec, dim=len(vec),
                model=f"open_clip:{MODEL_NAME}/{PRETRAINED}",
                latency_ms=latency,
            )
        except Exception as e:
            logging.error("embed_text error: %s", e)
            context.abort(grpc.StatusCode.INTERNAL, f"embed_text failed: {e}")

    def Health(self, request, context):
        return clip_pb2.HealthResponse(
            ok=True,
            model=f"open_clip:{MODEL_NAME}/{PRETRAINED}",
        )


def serve():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    clip_pb2_grpc.add_ClipServiceServicer_to_server(ClipServicer(), server)
    server.add_insecure_port(f"[::]:{PORT}")
    logging.info("CLIP gRPC server listening on :%d", PORT)
    server.start()
    server.wait_for_termination()


if __name__ == "__main__":
    serve()
