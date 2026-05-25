ALTER TABLE images ADD COLUMN IF NOT EXISTS embedding VECTOR(512);

-- embedder キャッチアップ用（embedding IS NULL の画像を高速スキャン）
CREATE INDEX IF NOT EXISTS images_pending_embedding_idx
    ON images (id) WHERE embedding IS NULL;

-- 類似検索インデックス（HNSW: 空テーブルから作れて挿入に強い）
CREATE INDEX IF NOT EXISTS images_embedding_hnsw_idx
    ON images USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 同一画像への重複フィードバック防止
CREATE UNIQUE INDEX IF NOT EXISTS feedback_unique_user_image_kind
    ON feedback_events (user_id, image_id, kind);
