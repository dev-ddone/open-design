CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  disabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL DEFAULT 'Untitled Design',
  canvas_json TEXT NOT NULL DEFAULT '{}',
  width INTEGER NOT NULL DEFAULT 1080 CHECK (width > 0),
  height INTEGER NOT NULL DEFAULT 1080 CHECK (height > 0),
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id UUID NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Page 1',
  canvas_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  canvas_json TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  thumbnail_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  colors JSONB NOT NULL DEFAULT '[]'::jsonb,
  fonts JSONB NOT NULL DEFAULT '[]'::jsonb,
  logos JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'uploads',
  tags TEXT[] NOT NULL DEFAULT '{}',
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  license TEXT NOT NULL DEFAULT 'proprietary',
  author TEXT,
  source_url TEXT,
  attribution_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favorite_elements (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, element_id)
);

CREATE TABLE IF NOT EXISTS collaboration_documents (
  room TEXT PRIMARY KEY,
  state BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_designs_org_updated ON designs(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_designs_client ON designs(client_id);
CREATE INDEX IF NOT EXISTS idx_pages_design_order ON pages(design_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_templates_org_category ON templates(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_assets_org_category ON assets(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING GIN(tags);

INSERT INTO templates (id, name, category, canvas_json, width, height, sort_order)
VALUES
('ddone-quote-card', 'Quote Card', 'social', '{"version":"6.0.0","objects":[{"type":"rect","left":0,"top":0,"width":1080,"height":1080,"fill":"#171717"},{"type":"textbox","left":90,"top":310,"width":900,"text":"Your inspiring quote goes here","fontSize":54,"fontFamily":"Playfair Display","fontWeight":"700","fill":"#ffffff","textAlign":"center"},{"type":"textbox","left":90,"top":900,"width":900,"text":"— Author Name","fontSize":24,"fontFamily":"Inter","fontWeight":"500","fill":"#a3a3a3","textAlign":"center"}]}', 1080, 1080, 1),
('ddone-menu-a4', 'Restaurant Menu A4', 'menu', '{"version":"6.0.0","objects":[{"type":"rect","left":0,"top":0,"width":1240,"height":1754,"fill":"#f7f1e7"},{"type":"textbox","left":100,"top":100,"width":1040,"text":"MENU","fontSize":72,"fontFamily":"Playfair Display","fontWeight":"700","fill":"#2b2118","textAlign":"center"},{"type":"line","x1":180,"y1":230,"x2":1060,"y2":230,"stroke":"#b38b45","strokeWidth":3},{"type":"textbox","left":120,"top":300,"width":1000,"text":"Cocktails","fontSize":42,"fontFamily":"Montserrat","fontWeight":"700","fill":"#2b2118","textAlign":"center"}]}', 1240, 1754, 2),
('ddone-instagram-story', 'Instagram Story Promotion', 'social', '{"version":"6.0.0","objects":[{"type":"rect","left":0,"top":0,"width":1080,"height":1920,"fill":"#111827"},{"type":"textbox","left":90,"top":260,"width":900,"text":"SPECIAL NIGHT","fontSize":82,"fontFamily":"Montserrat","fontWeight":"900","fill":"#ffffff","textAlign":"center"},{"type":"textbox","left":140,"top":1450,"width":800,"text":"Book your table now","fontSize":38,"fontFamily":"Inter","fontWeight":"600","fill":"#fbbf24","textAlign":"center"}]}', 1080, 1920, 3),
('ddone-event-poster', 'Event Poster A4', 'poster', '{"version":"6.0.0","objects":[{"type":"rect","left":0,"top":0,"width":1240,"height":1754,"fill":"#0b0b0d"},{"type":"textbox","left":100,"top":180,"width":1040,"text":"LIVE EVENT","fontSize":96,"fontFamily":"Montserrat","fontWeight":"900","fill":"#ffffff","textAlign":"center"},{"type":"textbox","left":120,"top":1430,"width":1000,"text":"Saturday · 21:00","fontSize":42,"fontFamily":"Inter","fontWeight":"600","fill":"#a78bfa","textAlign":"center"}]}', 1240, 1754, 4)
ON CONFLICT (id) DO NOTHING;
