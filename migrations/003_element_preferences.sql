CREATE TABLE IF NOT EXISTS element_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  favorite_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  recent_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  collections JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id),
  CHECK (jsonb_typeof(favorite_ids) = 'array'),
  CHECK (jsonb_typeof(recent_items) = 'array'),
  CHECK (jsonb_typeof(collections) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_element_preferences_organization
  ON element_preferences(organization_id, updated_at DESC);
