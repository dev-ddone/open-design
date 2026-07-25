export interface Design {
  id: string;
  organization_id?: string;
  client_id?: string | null;
  name: string;
  canvas_json: string;
  width: number;
  height: number;
  thumbnail_url: string | null;
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
