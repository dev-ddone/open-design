ALTER TABLE element_preferences
  ADD COLUMN IF NOT EXISTS favorite_items JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'element_preferences_favorite_items_array'
  ) THEN
    ALTER TABLE element_preferences
      ADD CONSTRAINT element_preferences_favorite_items_array
      CHECK (jsonb_typeof(favorite_items) = 'array');
  END IF;
END $$;
