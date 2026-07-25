export interface TemplateEditRules {
  mode: "unlocked" | "locked" | "regions";
  editableObjectIds: string[];
  lockedObjectIds: string[];
}

export interface Design {
  id: string;
  organization_id?: string;
  client_id?: string | null;
  name: string;
  canvas_json: string;
  width: number;
  height: number;
  thumbnail_url: string | null;
  template_id?: string | null;
  template_edit_rules?: TemplateEditRules;
  effective_role?: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  design_id: string;
  title: string;
  canvas_json: string;
  sort_order: number;
  created_at: string;
  updated_at?: string;
}

export interface DesignWithPages extends Design {
  pages: Page[];
}

export interface Template {
  id: string;
  organization_id?: string | null;
  client_id?: string | null;
  name: string;
  category: string;
  canvas_json: string;
  width: number;
  height: number;
  thumbnail_url: string | null;
  sort_order: number;
  is_locked?: boolean;
  edit_rules?: TemplateEditRules;
}

export interface DesignVersion {
  id: string;
  design_id: string;
  label: string | null;
  source: "manual" | "save" | "restore" | "system";
  created_at: string;
  created_by_name?: string | null;
  created_by_email?: string | null;
}

export interface BrandTextStyle {
  name?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fill?: string;
  [key: string]: unknown;
}

export interface BrandKit {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  colors: string[];
  fonts: string[];
  logos: string[];
  text_styles: BrandTextStyle[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface DesignElement {
  id: string;
  name: string;
  category: "shapes" | "icons" | "ornaments" | "frames" | "food" | "cocktails" | "backgrounds" | "social";
  tags: string[];
  provider: "ddone" | "iconify";
  license: string;
  author?: string;
  sourceUrl?: string;
  svg?: string;
  svgUrl?: string;
}
