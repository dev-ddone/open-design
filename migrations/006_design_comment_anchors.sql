ALTER TABLE design_comments
  ADD COLUMN IF NOT EXISTS anchor_x DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS anchor_y DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE design_comments
  DROP CONSTRAINT IF EXISTS design_comments_anchor_x_range,
  DROP CONSTRAINT IF EXISTS design_comments_anchor_y_range;

ALTER TABLE design_comments
  ADD CONSTRAINT design_comments_anchor_x_range CHECK (anchor_x IS NULL OR (anchor_x >= 0 AND anchor_x <= 1)),
  ADD CONSTRAINT design_comments_anchor_y_range CHECK (anchor_y IS NULL OR (anchor_y >= 0 AND anchor_y <= 1));

CREATE INDEX IF NOT EXISTS idx_design_comments_page_open
  ON design_comments(design_id, page_id, resolved_at, created_at DESC);
