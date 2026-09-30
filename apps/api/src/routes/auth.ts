import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db';
import { HttpError, parse } from '../http';
import { issueRefreshToken, requireAuth, revokeRefreshToken, rotateRefreshToken, signAccessToken, type Role } from '../auth';

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 10_000 : 50, standardHeaders: 'draft-8', legacyHeaders: false });

interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: Role;
  password_hash: string;
  created_at: Date;
}

const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name, avatar: u.avatar, role: u.role, createdAt: u.created_at });

async function session(u: UserRow) {
  return {
    user: publicUser(u),
    accessToken: signAccessToken({ id: u.id, role: u.role }),
    refreshToken: await issueRefreshToken(u.id),
  };
}

const registerSchema = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100),
});

authRouter.post('/register', limiter, async (req, res) => {
  const body = parse(registerSchema, req.body);
  const hash = await bcrypt.hash(body.password, 12);
  const { rows } = await query<UserRow>(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING RETURNING *`,
    [body.email, hash, body.name],
  );
  if (!rows[0]) throw new HttpError(409, 'Email is already registered');
  res.status(201).json(await session(rows[0]));
});

const loginSchema = z.object({ email: z.string().transform((e) => e.toLowerCase()), password: z.string() });

authRouter.post('/login', limiter, async (req, res) => {
  const body = parse(loginSchema, req.body);
  const { rows } = await query<UserRow>('SELECT * FROM users WHERE email = $1', [body.email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  res.json(await session(user));
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post('/refresh', limiter, async (req, res) => {
  const { refreshToken } = parse(refreshSchema, req.body);
  const rotated = await rotateRefreshToken(refreshToken);
  if (!rotated) throw new HttpError(401, 'Invalid refresh token');
  const { rows } = await query<UserRow>('SELECT * FROM users WHERE id = $1', [rotated.userId]);
  if (!rows[0]) throw new HttpError(401, 'Invalid refresh token');
  res.json({ user: publicUser(rows[0]), accessToken: signAccessToken({ id: rows[0].id, role: rows[0].role }), refreshToken: rotated.token });
});

authRouter.post('/logout', async (req, res) => {
  const body = refreshSchema.safeParse(req.body);
  if (body.success) await revokeRefreshToken(body.data.refreshToken);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query<UserRow>('SELECT * FROM users WHERE id = $1', [req.user!.id]);
  if (!rows[0]) throw new HttpError(401, 'User no longer exists');
  res.json({ user: publicUser(rows[0]) });
});

const profileSchema = z.object({ name: z.string().trim().min(1).max(100).optional(), avatar: z.url().max(2048).nullable().optional() });

authRouter.patch('/me', requireAuth, async (req, res) => {
  const body = parse(profileSchema, req.body);
  const { rows } = await query<UserRow>(
    `UPDATE users SET name = COALESCE($2, name), avatar = CASE WHEN $3::boolean THEN $4 ELSE avatar END, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [req.user!.id, body.name ?? null, body.avatar !== undefined, body.avatar ?? null],
  );
  res.json({ user: publicUser(rows[0]) });
});
