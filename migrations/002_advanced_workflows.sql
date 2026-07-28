ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS all_clients BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS client_members (
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('EDITOR', 'VIEWER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_client_members_user ON client_members(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_expiry ON password_reset_tokens(expires_at);

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS client_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invitations_org_email ON invitations(organization_id, email);
CREATE INDEX IF NOT EXISTS idx_invitations_expiry ON invitations(expires_at);

CREATE TABLE IF NOT EXISTS design_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  label TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'save', 'restore', 'system')),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_versions_design_created
  ON design_versions(design_id, created_at DESC);

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS edit_rules JSONB NOT NULL DEFAULT '{"mode":"unlocked","editableObjectIds":[],"lockedObjectIds":[]}'::jsonb;

ALTER TABLE designs
  ADD COLUMN IF NOT EXISTS template_id TEXT,
  ADD COLUMN IF NOT EXISTS template_edit_rules JSONB NOT NULL DEFAULT '{"mode":"unlocked","editableObjectIds":[],"lockedObjectIds":[]}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'designs_template_id_fkey'
  ) THEN
    ALTER TABLE designs
      ADD CONSTRAINT designs_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE brand_kits
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS text_styles JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_kits_default_client
  ON brand_kits(organization_id, client_id)
  WHERE is_default = true AND client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_kits_default_org
  ON brand_kits(organization_id)
  WHERE is_default = true AND client_id IS NULL;
