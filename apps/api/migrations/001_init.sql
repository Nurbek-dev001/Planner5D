-- SpacePlan initial schema (docs, section 36).
-- The editable scene is stored as Project JSON in projects.data (section 37: single source of truth
-- for 2D and 3D); aggregate columns (area, floors_count) are denormalised for the dashboard.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  avatar        text,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'premium', 'designer', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  thumbnail    text,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  area         numeric(12, 2) NOT NULL DEFAULT 0,
  floors_count integer NOT NULL DEFAULT 1,
  unit         text NOT NULL DEFAULT 'm',
  version      integer NOT NULL DEFAULT 1,
  data         jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_user_idx ON projects (user_id, updated_at DESC);

CREATE TABLE project_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version    integer NOT NULL,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE TABLE catalog_categories (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  subcategories text[] NOT NULL DEFAULT '{}',
  sort_order    integer NOT NULL DEFAULT 0
);

CREATE TABLE catalog_items (
  id           text PRIMARY KEY,
  category_id  text NOT NULL REFERENCES catalog_categories(id),
  subcategory  text NOT NULL,
  name         text NOT NULL,
  brand        text,
  model        text NOT NULL,
  model_url    text,
  thumbnail    text,
  width        numeric NOT NULL,
  height       numeric NOT NULL,
  depth        numeric NOT NULL,
  elevation    numeric NOT NULL DEFAULT 0,
  price        numeric(14, 2) NOT NULL DEFAULT 0,
  currency     text NOT NULL DEFAULT 'KZT',
  color        text NOT NULL,
  material_id  text,
  premium      boolean NOT NULL DEFAULT false,
  wall_mounted boolean NOT NULL DEFAULT false,
  light        boolean NOT NULL DEFAULT false,
  hidden       boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0
);
CREATE INDEX catalog_items_category_idx ON catalog_items (category_id);

CREATE TABLE materials (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  target       text NOT NULL,
  base_color   text NOT NULL,
  pattern      text NOT NULL DEFAULT 'none',
  texture_url  text,
  normal_url   text,
  roughness    numeric NOT NULL DEFAULT 0.8,
  metallic     numeric NOT NULL DEFAULT 0,
  scale        numeric NOT NULL DEFAULT 100,
  price_per_m2 numeric(14, 2)
);
