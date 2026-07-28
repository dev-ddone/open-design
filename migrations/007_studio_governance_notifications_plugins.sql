ALTER TABLE design_comments
  ADD COLUMN IF NOT EXISTS anchor_width DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS anchor_height DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS anchor_mode TEXT NOT NULL DEFAULT 'point',
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE design_comments
  DROP CONSTRAINT IF EXISTS design_comments_anchor_width_range,
  DROP CONSTRAINT IF EXISTS design_comments_anchor_height_range,
  DROP CONSTRAINT IF EXISTS design_comments_anchor_mode_values;

ALTER TABLE design_comments
  ADD CONSTRAINT design_comments_anchor_width_range CHECK (anchor_width IS NULL OR (anchor_width > 0 AND anchor_width <= 1)),
  ADD CONSTRAINT design_comments_anchor_height_range CHECK (anchor_height IS NULL OR (anchor_height > 0 AND anchor_height <= 1)),
  ADD CONSTRAINT design_comments_anchor_mode_values CHECK (anchor_mode IN ('point', 'region'));

CREATE TABLE IF NOT EXISTS design_governance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  design_id UUID NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_governance_events_design
  ON design_governance_events(design_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_governance_events_organization
  ON design_governance_events(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES design_comments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, organization_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS plugin_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  plugin_key TEXT NOT NULL,
  name TEXT NOT NULL,
  manifest JSONB NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_id, plugin_key)
);

CREATE INDEX IF NOT EXISTS idx_plugin_installations_scope
  ON plugin_installations(organization_id, client_id, enabled, plugin_key);