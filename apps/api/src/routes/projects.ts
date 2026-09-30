import { Router } from 'express';
import { z } from 'zod';
import { createProjectFromTemplate, projectArea, projectDataSchema, TEMPLATES, type ProjectData } from '@spaceplan/shared';
import { config } from '../config';
import { query, withTransaction } from '../db';
import { HttpError, notFound, parse } from '../http';
import { requireAuth } from '../auth';
import type pg from 'pg';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  thumbnail: string | null;
  status: string;
  area: number;
  floors_count: number;
  unit: string;
  version: number;
  data?: ProjectData;
  created_at: Date;
  updated_at: Date;
}

const SUMMARY_COLUMNS = 'id, user_id, name, description, thumbnail, status, area, floors_count, unit, version, created_at, updated_at';

const toSummary = (p: ProjectRow) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  thumbnail: p.thumbnail,
  status: p.status,
  /** m² */
  area: p.area,
  floorsCount: p.floors_count,
  unit: p.unit,
  version: p.version,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

const toFull = (p: ProjectRow) => ({ ...toSummary(p), data: p.data });

/** Denormalised dashboard columns derived from the project JSON */
function aggregates(data: ProjectData) {
  return { area: Math.round(projectArea(data) / 100) / 100, floorsCount: data.floors.length, unit: data.units };
}

const idParam = z.object({ id: z.uuid() });
const thumbnail = z
  .string()
  .max(400_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
  .nullable();

async function loadOwned(id: string, userId: string, client?: pg.PoolClient): Promise<ProjectRow> {
  const q = client ? client.query.bind(client) : query;
  const { rows } = await q<ProjectRow>('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!rows[0]) throw notFound('Project');
  return rows[0];
}

async function snapshot(client: pg.PoolClient, projectId: string, version: number, data: ProjectData) {
  await client.query('INSERT INTO project_versions (project_id, version, data) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [projectId, version, data]);
  await client.query(
    `DELETE FROM project_versions WHERE project_id = $1 AND id NOT IN (
       SELECT id FROM project_versions WHERE project_id = $1 ORDER BY version DESC LIMIT $2)`,
    [projectId, config.maxVersionsPerProject],
  );
}

projectsRouter.get('/templates', (_req, res) => {
  res.json({ templates: TEMPLATES });
});

projectsRouter.get('/', async (req, res) => {
  const q = z.object({ search: z.string().max(100).optional() }).parse(req.query);
  const { rows } = await query<ProjectRow>(
    `SELECT ${SUMMARY_COLUMNS} FROM projects WHERE user_id = $1 AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
     ORDER BY updated_at DESC`,
    [req.user!.id, q.search ?? null],
  );
  res.json({ projects: rows.map(toSummary) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120).default('Новый проект'),
  description: z.string().max(2000).default(''),
  templateId: z.enum(TEMPLATES.map((t) => t.id) as [string, ...string[]]).optional(),
  data: projectDataSchema.optional(),
});

projectsRouter.post('/', async (req, res) => {
  const body = parse(createSchema, req.body);
  const { rows: count } = await query<{ n: number }>('SELECT count(*)::int AS n FROM projects WHERE user_id = $1', [req.user!.id]);
  if (req.user!.role === 'user' && count[0].n >= config.freeProjectLimit) {
    throw new HttpError(402, `Free plan is limited to ${config.freeProjectLimit} projects`);
  }
  const data = (body.data as ProjectData | undefined) ?? createProjectFromTemplate(body.templateId ?? 'empty');
  const agg = aggregates(data);
  const project = await withTransaction(async (c) => {
    const { rows } = await c.query<ProjectRow>(
      `INSERT INTO projects (user_id, name, description, area, floors_count, unit, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user!.id, body.name, body.description, agg.area, agg.floorsCount, agg.unit, data],
    );
    await snapshot(c, rows[0].id, 1, data);
    return rows[0];
  });
  res.status(201).json({ project: toFull(project) });
});

projectsRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  res.json({ project: toFull(await loadOwned(id, req.user!.id)) });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  thumbnail: thumbnail.optional(),
  data: projectDataSchema.optional(),
  /** Optimistic concurrency: the version the client based its edits on */
  baseVersion: z.number().int().positive().optional(),
  /** Force a restorable version snapshot (manual save) */
  snapshot: z.boolean().optional(),
});

projectsRouter.put('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const body = parse(updateSchema, req.body);
  const project = await withTransaction(async (c) => {
    const current = await loadOwned(id, req.user!.id, c);
    if (body.baseVersion !== undefined && body.data && body.baseVersion !== current.version) {
      throw new HttpError(409, 'Project was modified elsewhere', { version: current.version });
    }
    const data = (body.data as ProjectData | undefined) ?? current.data!;
    const agg = aggregates(data);
    const version = body.data ? current.version + 1 : current.version;
    const { rows } = await c.query<ProjectRow>(
      `UPDATE projects SET name = $3, description = $4, status = $5, thumbnail = $6, data = $7, area = $8,
         floors_count = $9, unit = $10, version = $11, updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user!.id, body.name ?? current.name, body.description ?? current.description, body.status ?? current.status,
        body.thumbnail !== undefined ? body.thumbnail : current.thumbnail, data, agg.area, agg.floorsCount, agg.unit, version],
    );
    if (body.data) {
      const { rows: last } = await c.query<{ created_at: Date }>(
        'SELECT created_at FROM project_versions WHERE project_id = $1 ORDER BY version DESC LIMIT 1',
        [id],
      );
      const stale = !last[0] || Date.now() - last[0].created_at.getTime() > config.versionIntervalMs;
      if (body.snapshot || stale) await snapshot(c, id, version, data);
    }
    return rows[0];
  });
  res.json({ project: toFull(project) });
});

projectsRouter.delete('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { rowCount } = await query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [id, req.user!.id]);
  if (!rowCount) throw notFound('Project');
  res.status(204).end();
});

projectsRouter.post('/:id/duplicate', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const src = await loadOwned(id, req.user!.id);
  const project = await withTransaction(async (c) => {
    const { rows } = await c.query<ProjectRow>(
      `INSERT INTO projects (user_id, name, description, thumbnail, area, floors_count, unit, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user!.id, `${src.name} (копия)`, src.description, src.thumbnail, src.area, src.floors_count, src.unit, src.data],
    );
    await snapshot(c, rows[0].id, 1, src.data!);
    return rows[0];
  });
  res.status(201).json({ project: toFull(project) });
});

projectsRouter.get('/:id/versions', async (req, res) => {
  const { id } = parse(idParam, req.params);
  await loadOwned(id, req.user!.id);
  const { rows } = await query<{ id: string; version: number; created_at: Date }>(
    'SELECT id, version, created_at FROM project_versions WHERE project_id = $1 ORDER BY version DESC',
    [id],
  );
  res.json({ versions: rows.map((v) => ({ id: v.id, version: v.version, createdAt: v.created_at })) });
});

projectsRouter.post('/:id/versions/:versionId/restore', async (req, res) => {
  const { id, versionId } = parse(z.object({ id: z.uuid(), versionId: z.uuid() }), req.params);
  const project = await withTransaction(async (c) => {
    const current = await loadOwned(id, req.user!.id, c);
    const { rows: v } = await c.query<{ data: ProjectData }>('SELECT data FROM project_versions WHERE id = $1 AND project_id = $2', [versionId, id]);
    if (!v[0]) throw notFound('Version');
    const agg = aggregates(v[0].data);
    const version = current.version + 1;
    const { rows } = await c.query<ProjectRow>(
      `UPDATE projects SET data = $2, area = $3, floors_count = $4, unit = $5, version = $6, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, v[0].data, agg.area, agg.floorsCount, agg.unit, version],
    );
    await snapshot(c, id, version, v[0].data);
    return rows[0];
  });
  res.json({ project: toFull(project) });
});
