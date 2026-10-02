import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { notFound, parse } from '../http';

export const catalogRouter = Router();

interface ItemRow {
  id: string;
  category_id: string;
  subcategory: string;
  name: string;
  brand: string | null;
  model: string;
  model_url: string | null;
  thumbnail: string | null;
  width: number;
  height: number;
  depth: number;
  elevation: number;
  price: number;
  currency: string;
  color: string;
  material_id: string | null;
  premium: boolean;
  wall_mounted: boolean;
  light: boolean;
}

/** DB row → shared CatalogItem shape */
const toItem = (r: ItemRow) => ({
  id: r.id,
  name: r.name,
  category: r.category_id,
  subcategory: r.subcategory,
  model: r.model,
  modelUrl: r.model_url,
  thumbnail: r.thumbnail,
  width: r.width,
  depth: r.depth,
  height: r.height,
  elevation: r.elevation,
  manufacturer: r.brand ?? undefined,
  price: r.price,
  currency: r.currency,
  color: r.color,
  materialId: r.material_id ?? undefined,
  premium: r.premium,
  wallMounted: r.wall_mounted,
  light: r.light,
});

catalogRouter.get('/categories', async (_req, res) => {
  const { rows } = await query('SELECT id, name, subcategories FROM catalog_categories ORDER BY sort_order');
  res.json({ categories: rows });
});

const listSchema = z.object({
  category: z.string().max(64).optional(),
  search: z.string().max(100).optional(),
  premium: z.enum(['true', 'false']).optional(),
});

catalogRouter.get('/items', async (req, res) => {
  const q = parse(listSchema, req.query);
  const { rows } = await query<ItemRow>(
    `SELECT * FROM catalog_items
     WHERE NOT hidden
       AND ($1::text IS NULL OR category_id = $1)
       AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR subcategory ILIKE '%' || $2 || '%')
       AND ($3::boolean IS NULL OR premium = $3)
     ORDER BY sort_order`,
    [q.category ?? null, q.search ?? null, q.premium === undefined ? null : q.premium === 'true'],
  );
  res.json({ items: rows.map(toItem) });
});

catalogRouter.get('/items/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.string().max(64) }), req.params);
  const { rows } = await query<ItemRow>('SELECT * FROM catalog_items WHERE id = $1 AND NOT hidden', [id]);
  if (!rows[0]) throw notFound('Catalog item');
  res.json({ item: toItem(rows[0]) });
});

export const materialsRouter = Router();

materialsRouter.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, target, base_color AS "baseColor", pattern, texture_url AS "textureUrl", normal_url AS "normalUrl",
       roughness, metallic, scale, price_per_m2 AS "pricePerM2" FROM materials ORDER BY target, id`,
  );
  res.json({ materials: rows });
});
