import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CATALOG_CATEGORIES, CATALOG_ITEMS, MATERIALS } from '@spaceplan/shared';
import { pool, withTransaction } from './db';
import { migrate } from './migrate';

/** Upsert the base catalog and material library (idempotent). */
export async function seed(log = console.log) {
  await withTransaction(async (c) => {
    for (const [i, cat] of CATALOG_CATEGORIES.entries()) {
      await c.query(
        `INSERT INTO catalog_categories (id, name, subcategories, sort_order) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, subcategories = EXCLUDED.subcategories, sort_order = EXCLUDED.sort_order`,
        [cat.id, cat.name, cat.subcategories, i],
      );
    }
    for (const [i, it] of CATALOG_ITEMS.entries()) {
      await c.query(
        `INSERT INTO catalog_items (id, category_id, subcategory, name, brand, model, model_url, thumbnail, width, height, depth,
           elevation, price, currency, color, material_id, premium, wall_mounted, light, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (id) DO UPDATE SET category_id = EXCLUDED.category_id, subcategory = EXCLUDED.subcategory, name = EXCLUDED.name,
           brand = EXCLUDED.brand, model = EXCLUDED.model, width = EXCLUDED.width, height = EXCLUDED.height, depth = EXCLUDED.depth,
           elevation = EXCLUDED.elevation, price = EXCLUDED.price, color = EXCLUDED.color, material_id = EXCLUDED.material_id,
           premium = EXCLUDED.premium, wall_mounted = EXCLUDED.wall_mounted, light = EXCLUDED.light, sort_order = EXCLUDED.sort_order`,
        [it.id, it.category, it.subcategory, it.name, it.manufacturer ?? null, it.model, it.modelUrl ?? null, it.thumbnail ?? null,
          it.width, it.height, it.depth, it.elevation ?? 0, it.price, it.currency, it.color, it.materialId ?? null, it.premium,
          it.wallMounted ?? false, it.light ?? false, i],
      );
    }
    for (const m of MATERIALS) {
      await c.query(
        `INSERT INTO materials (id, name, target, base_color, pattern, texture_url, normal_url, roughness, metallic, scale, price_per_m2)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, target = EXCLUDED.target, base_color = EXCLUDED.base_color,
           pattern = EXCLUDED.pattern, roughness = EXCLUDED.roughness, metallic = EXCLUDED.metallic, scale = EXCLUDED.scale,
           price_per_m2 = EXCLUDED.price_per_m2`,
        [m.id, m.name, m.target, m.baseColor, m.pattern, m.textureUrl ?? null, m.normalUrl ?? null, m.roughness, m.metallic, m.scale, m.pricePerM2 ?? null],
      );
    }
  });
  log(`seeded ${CATALOG_CATEGORIES.length} categories, ${CATALOG_ITEMS.length} catalog items, ${MATERIALS.length} materials`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate()
    .then(() => seed())
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
