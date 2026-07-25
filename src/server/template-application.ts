import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  type AppVariables,
  canAccessDesign,
  requireAuth,
  requireOrganization,
} from "./auth.js";
import { one, query, transaction } from "./db.js";

const templateApplication = new Hono<{ Variables: AppVariables }>();

async function snapshot(designId: string, organizationId: string) {
  const design = await one<any>(
    `SELECT id,organization_id,client_id,name,canvas_json,width,height,thumbnail_url,
            template_id,template_edit_rules,created_at,updated_at
       FROM designs WHERE id=$1 AND organization_id=$2`,
    [designId, organizationId],
  );
  const pages = await query<any>(
    `SELECT id,title,canvas_json,sort_order,created_at,updated_at
       FROM pages WHERE design_id=$1 ORDER BY sort_order,created_at`,
    [designId],
  );
  return { design, pages };
}

templateApplication.post(
  "/api/designs/:id/apply-template",
  requireAuth,
  requireOrganization,
  async (c) => {
    const parsed = z.object({
      template_id: z.string().trim().min(1).max(160),
      page_id: z.string().uuid(),
    }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues.map((issue) => issue.message).join(", "),
      });
    }
    const access = await canAccessDesign(c.get("user").id, c.req.param("id"), "EDITOR");
    if (!access || access.organizationId !== c.get("organizationId")) {
      throw new HTTPException(403, { message: "Design editor access required" });
    }
    const design = await one<{ id: string; client_id: string | null }>(
      "SELECT id,client_id FROM designs WHERE id=$1 AND organization_id=$2",
      [c.req.param("id"), c.get("organizationId")],
    );
    const template = await one<any>(
      `SELECT * FROM templates
        WHERE id=$1 AND (organization_id IS NULL OR organization_id=$2)`,
      [parsed.data.template_id, c.get("organizationId")],
    );
    if (!design || !template) throw new HTTPException(404, { message: "Design or template not found" });
    if (template.client_id && template.client_id !== design.client_id) {
      throw new HTTPException(403, { message: "Template belongs to another client" });
    }
    const page = await one<{ id: string; sort_order: number }>(
      "SELECT id,sort_order FROM pages WHERE id=$1 AND design_id=$2",
      [parsed.data.page_id, design.id],
    );
    if (!page) throw new HTTPException(404, { message: "Page not found" });

    const before = await snapshot(design.id, c.get("organizationId"));
    const result = await transaction(async (client) => {
      await client.query(
        `INSERT INTO design_versions(design_id,organization_id,created_by,label,source,snapshot)
         VALUES ($1,$2,$3,'Before template application','system',$4::jsonb)`,
        [design.id, c.get("organizationId"), c.get("user").id, JSON.stringify(before)],
      );
      const updatedDesign = await client.query<any>(
        `UPDATE designs SET template_id=$1,template_edit_rules=$2::jsonb,width=$3,height=$4,
                            canvas_json=CASE WHEN $5=0 THEN $6 ELSE canvas_json END,
                            updated_at=now()
          WHERE id=$7 RETURNING *`,
        [
          template.id,
          JSON.stringify(template.edit_rules),
          template.width,
          template.height,
          page.sort_order,
          template.canvas_json,
          design.id,
        ],
      );
      const updatedPage = await client.query<any>(
        `UPDATE pages SET canvas_json=$1,updated_at=now() WHERE id=$2 RETURNING *`,
        [template.canvas_json, page.id],
      );
      await client.query("DELETE FROM collaboration_documents WHERE room=$1", [`design:${design.id}`]);
      return { design: updatedDesign.rows[0], page: updatedPage.rows[0] };
    });
    return c.json(result);
  },
);

export default templateApplication;
