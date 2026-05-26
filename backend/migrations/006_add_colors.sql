ALTER TABLE images ADD COLUMN IF NOT EXISTS colors TEXT[];
CREATE INDEX IF NOT EXISTS images_colors_gin_idx ON images USING gin(colors);
