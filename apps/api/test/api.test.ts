import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createEmptyProject, createProjectFromTemplate } from '@spaceplan/shared';
import { createApp } from '../src/app';
import { pool } from '../src/db';
import { migrate } from '../src/migrate';
import { seed } from '../src/seed';
import { config } from '../src/config';

const app = createApp();
const email = `user${Date.now()}@example.kz`;
let token = '';

beforeAll(async () => {
  await migrate(() => {});
  await seed(() => {});
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', ['%@example.kz']);
  await pool.end();
});

describe('auth', () => {
  it('registers, rejects duplicates, logs in and rotates refresh tokens', async () => {
    const reg = await request(app).post('/api/auth/register').send({ email, password: 'secret123', name: 'Aruzhan' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe(email);
    expect(reg.body.user).not.toHaveProperty('password_hash');

    const dup = await request(app).post('/api/auth/register').send({ email: email.toUpperCase(), password: 'secret123', name: 'X' });
    expect(dup.status).toBe(409);

    const bad = await request(app).post('/api/auth/login').send({ email, password: 'wrong-pass' });
    expect(bad.status).toBe(401);

    const login = await request(app).post('/api/auth/login').send({ email, password: 'secret123' });
    expect(login.status).toBe(200);
    token = login.body.accessToken;
    const refreshToken = login.body.refreshToken;

    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshed.status).toBe(200);
    const reused = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(reused.status).toBe(401);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.user.name).toBe('Aruzhan');

    const out = await request(app).post('/api/auth/logout').send({ refreshToken: refreshed.body.refreshToken });
    expect(out.status).toBe(204);
    const afterLogout = await request(app).post('/api/auth/refresh').send({ refreshToken: refreshed.body.refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it('validates input and protects routes', async () => {
    expect((await request(app).post('/api/auth/register').send({ email: 'nope', password: '1', name: '' })).status).toBe(400);
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).get('/api/projects').set('Authorization', 'Bearer garbage')).status).toBe(401);
  });
});

describe('projects', () => {
  const auth = () => ({ Authorization: `Bearer ${token}` });
  let id = '';

  it('creates a project from a template with computed area', async () => {
    const res = await request(app).post('/api/projects').set(auth()).send({ name: 'Моя квартира', templateId: 'two-room' });
    expect(res.status).toBe(201);
    id = res.body.project.id;
    expect(res.body.project.area).toBeGreaterThan(50);
    expect(res.body.project.data.floors[0].rooms).toHaveLength(5);
  });

  it('lists, updates with optimistic concurrency and keeps versions', async () => {
    const list = await request(app).get('/api/projects').set(auth());
    expect(list.body.projects.map((p: { id: string }) => p.id)).toContain(id);
    expect(list.body.projects[0]).not.toHaveProperty('data');

    const data = createProjectFromTemplate('bedroom');
    const upd = await request(app).put(`/api/projects/${id}`).set(auth()).send({ data, baseVersion: 1, snapshot: true, name: 'Спальня' });
    expect(upd.status).toBe(200);
    expect(upd.body.project.version).toBe(2);
    expect(upd.body.project.area).toBeCloseTo(15.12, 1);

    const stale = await request(app).put(`/api/projects/${id}`).set(auth()).send({ data, baseVersion: 1 });
    expect(stale.status).toBe(409);

    const versions = await request(app).get(`/api/projects/${id}/versions`).set(auth());
    expect(versions.body.versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);

    const v1 = versions.body.versions[1].id;
    const restored = await request(app).post(`/api/projects/${id}/versions/${v1}/restore`).set(auth());
    expect(restored.body.project.version).toBe(3);
    expect(restored.body.project.data.floors[0].rooms).toHaveLength(5);
  });

  it('rejects invalid project JSON and thumbnails', async () => {
    const bad = { ...createEmptyProject(), floors: [] };
    expect((await request(app).put(`/api/projects/${id}`).set(auth()).send({ data: bad })).status).toBe(400);
    expect((await request(app).put(`/api/projects/${id}`).set(auth()).send({ thumbnail: 'javascript:alert(1)' })).status).toBe(400);
  });

  it('duplicates and deletes; other users cannot access', async () => {
    const dup = await request(app).post(`/api/projects/${id}/duplicate`).set(auth());
    expect(dup.status).toBe(201);
    expect(dup.body.project.name).toContain('(копия)');

    const other = await request(app)
      .post('/api/auth/register')
      .send({ email: `other${Date.now()}@example.kz`, password: 'secret123', name: 'Nursultan' });
    const foreign = await request(app).get(`/api/projects/${id}`).set('Authorization', `Bearer ${other.body.accessToken}`);
    expect(foreign.status).toBe(404);

    expect((await request(app).delete(`/api/projects/${id}`).set(auth())).status).toBe(204);
    expect((await request(app).get(`/api/projects/${id}`).set(auth())).status).toBe(404);
  });
});

describe('catalog', () => {
  it('serves categories, items and materials', async () => {
    const cats = await request(app).get('/api/catalog/categories');
    expect(cats.body.categories.length).toBeGreaterThanOrEqual(7);
    const items = await request(app).get('/api/catalog/items?category=kitchen');
    expect(items.body.items.length).toBeGreaterThan(5);
    expect(items.body.items.every((i: { category: string }) => i.category === 'kitchen')).toBe(true);
    const sofa = await request(app).get('/api/catalog/items/sofa');
    expect(sofa.body.item.price).toBe(289990);
    const mats = await request(app).get('/api/materials');
    expect(mats.body.materials.length).toBeGreaterThan(20);
  });
});

describe('ai', () => {
  it('reports whether plan recognition is configured and protects the endpoint', async () => {
    const status = await request(app).get('/api/ai/status');
    expect(status.status).toBe(200);
    expect(typeof status.body.planRecognition).toBe('boolean');

    const anon = await request(app).post('/api/ai/recognize-plan').send({});
    expect(anon.status).toBe(401);
  });

  // Without Anthropic credentials (CI) the endpoint must fail cleanly, before any validation of the image
  it.skipIf(config.aiEnabled)('returns 503 when AI is not configured', async () => {
    const res = await request(app)
      .post('/api/ai/recognize-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ image: 'x'.repeat(200), mediaType: 'image/png', width: 100, height: 100 });
    expect(res.status).toBe(503);
  });
});
