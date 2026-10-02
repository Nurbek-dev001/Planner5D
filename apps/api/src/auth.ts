import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { query } from './db';
import { HttpError } from './http';

export type Role = 'user' | 'premium' | 'designer' | 'admin';

export interface AuthUser {
  id: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, config.jwtSecret, { subject: user.id, expiresIn: config.accessTokenTtl });
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export async function issueRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(48).toString('base64url');
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [userId, hashToken(token), String(config.refreshTokenTtlDays)],
  );
  return token;
}

/** Rotate a refresh token: the old one is revoked, a new one is issued */
export async function rotateRefreshToken(token: string): Promise<{ userId: string; token: string } | null> {
  const { rows } = await query<{ user_id: string }>(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hashToken(token)],
  );
  if (!rows[0]) return null;
  return { userId: rows[0].user_id, token: await issueRefreshToken(rows[0].user_id) };
}

export async function revokeRefreshToken(token: string) {
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(token)]);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Authentication required'));
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    req.user = { id: String(payload.sub), role: payload.role as Role };
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

/** RBAC guard (docs, section 30) */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'Forbidden'));
    next();
  };
}
