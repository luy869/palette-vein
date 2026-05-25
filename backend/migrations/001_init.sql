CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO users (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS images (
    id BIGSERIAL PRIMARY KEY,
    wallhaven_id TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    thumb_url TEXT NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL,
    ratio NUMERIC(6,3),
    views INT,
    favorites INT,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- M2: ADD COLUMN embedding VECTOR(512)
);

CREATE TABLE IF NOT EXISTS feedback_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    image_id BIGINT NOT NULL REFERENCES images(id),
    kind TEXT NOT NULL CHECK (kind IN ('like','skip')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feedback_events_user_created_idx
    ON feedback_events (user_id, created_at DESC);
