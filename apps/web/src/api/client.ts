import type { CatalogCategory, CatalogItem, Material, ProjectData, TemplateInfo } from '@spaceplan/shared';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: 'user' | 'premium' | 'designer' | 'admin';
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  thumbnail: string | null;
  status: 'draft' | 'active' | 'archived';
  area: number;
  floorsCount: number;
  unit: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends ProjectSummary {
  data: ProjectData;
}

export interface ProjectVersion {
  id: string;
  version: number;
  createdAt: string;
}

interface Session {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const TOKENS_KEY = 'spaceplan:tokens';

function readTokens(): { accessToken: string; refreshToken: string } | null {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function storeTokens(t: { accessToken: string; refreshToken: string } | null) {
  if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken }));
  else localStorage.removeItem(TOKENS_KEY);
}

export const hasTokens = () => readTokens() !== null;

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const tokens = readTokens();
  if (!tokens) return false;
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) {
        storeTokens(null);
        return false;
      }
      storeTokens(await r.json());
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const tokens = readTokens();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry && tokens && (await refresh())) {
    return request<T>(method, path, body, false);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? res.statusText, json.details);
  return json as T;
}

export const api = {
  register: (email: string, password: string, name: string) =>
    request<Session>('POST', '/auth/register', { email, password, name }),
  login: (email: string, password: string) => request<Session>('POST', '/auth/login', { email, password }),
  logout: () => {
    const t = readTokens();
    storeTokens(null);
    return t ? request<void>('POST', '/auth/logout', { refreshToken: t.refreshToken }, false).catch(() => {}) : Promise.resolve();
  },
  me: () => request<{ user: User }>('GET', '/auth/me'),
  updateProfile: (patch: { name?: string }) => request<{ user: User }>('PATCH', '/auth/me', patch),

  templates: () => request<{ templates: TemplateInfo[] }>('GET', '/projects/templates'),
  listProjects: (search?: string) =>
    request<{ projects: ProjectSummary[] }>('GET', `/projects${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createProject: (body: { name: string; templateId?: string; data?: ProjectData }) =>
    request<{ project: Project }>('POST', '/projects', body),
  getProject: (id: string) => request<{ project: Project }>('GET', `/projects/${id}`),
  updateProject: (
    id: string,
    body: Partial<{ name: string; description: string; thumbnail: string | null; data: ProjectData; baseVersion: number; snapshot: boolean }>,
  ) => request<{ project: Project }>('PUT', `/projects/${id}`, body),
  deleteProject: (id: string) => request<void>('DELETE', `/projects/${id}`),
  duplicateProject: (id: string) => request<{ project: Project }>('POST', `/projects/${id}/duplicate`),
  versions: (id: string) => request<{ versions: ProjectVersion[] }>('GET', `/projects/${id}/versions`),
  restoreVersion: (id: string, versionId: string) =>
    request<{ project: Project }>('POST', `/projects/${id}/versions/${versionId}/restore`),

  categories: () => request<{ categories: CatalogCategory[] }>('GET', '/catalog/categories'),
  catalogItems: () => request<{ items: CatalogItem[] }>('GET', '/catalog/items'),
  materials: () => request<{ materials: Material[] }>('GET', '/materials'),
};
