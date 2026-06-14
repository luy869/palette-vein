-- 埋め込みモデルを EVA02-L/14（768次元）へ変更。embedding を VECTOR(512) → VECTOR(768) に作り直す。
--
-- 注意: このプロジェクトの移行は毎起動で全SQL再実行される（冪等前提）。
-- 素朴に DROP/ADD すると起動の度に 768 ベクトルを破棄して再埋め込みしてしまうため、
-- 「現在すでに 768 なら何もしない」ガードを DO ブロックで付ける。
-- pgvector の format_type(...) は次元込みで 'vector(768)' を返すので、これで判定する。
DO $$
BEGIN
    IF (
        SELECT format_type(atttypid, atttypmod)
        FROM pg_attribute
        WHERE attrelid = 'images'::regclass
          AND attname = 'embedding'
          AND NOT attisdropped
    ) IS DISTINCT FROM 'vector(768)' THEN

        -- HNSW 索引は次元固定なので作り直す
        DROP INDEX IF EXISTS images_embedding_hnsw_idx;
        DROP INDEX IF EXISTS images_pending_embedding_idx;

        ALTER TABLE images DROP COLUMN IF EXISTS embedding;
        ALTER TABLE images ADD COLUMN embedding VECTOR(768);

        CREATE INDEX images_pending_embedding_idx
            ON images (id) WHERE embedding IS NULL;
        CREATE INDEX images_embedding_hnsw_idx
            ON images USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64);

        -- 旧 512 次元の埋め込みを破棄したので、全画像を再埋め込みさせる
        -- （embedder は embedding IS NULL AND embed_errors < N を拾うため、エラーカウントもリセット）。
        UPDATE images SET embed_errors = 0;
    END IF;
END $$;
