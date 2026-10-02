import { z } from 'zod';

/** Runtime validation of Project JSON (used by the API before persisting user data). */

const num = z.number().finite();
const len = num.min(0).max(1_000_000);
const id = z.string().min(1).max(64);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const vec2 = z.object({ x: num, y: num });
const vec3 = z.object({ x: num, y: num, z: num });

const wall = z.object({
  id,
  start: vec2,
  end: vec2,
  height: len,
  thickness: len,
  materialId: id.optional(),
});

const openingBase = {
  id,
  wallId: id,
  offset: len,
  width: len,
  height: len,
  elevation: len,
  materialId: id.optional(),
  color: color.optional(),
};

const door = z.object({
  ...openingBase,
  kind: z.literal('door'),
  type: z.enum(['single', 'double', 'sliding', 'glass', 'entrance']),
  hinge: z.enum(['left', 'right']),
  swing: z.enum(['in', 'out']),
});

const windowOpening = z.object({
  ...openingBase,
  kind: z.literal('window'),
  type: z.enum(['standard', 'double', 'panoramic', 'corner', 'balcony']),
});

const room = z.object({
  id,
  name: z.string().max(100),
  type: z.enum(['living', 'bedroom', 'kitchen', 'bathroom', 'toilet', 'kids', 'office', 'wardrobe', 'hallway', 'balcony', 'custom']),
  polygon: z.array(vec2).max(1000),
  floorMaterialId: id,
  wallMaterialId: id.optional(),
  height: len.optional(),
});

const placedObject = z.object({
  id,
  catalogItemId: id,
  position: vec3,
  rotation: num,
  width: len,
  depth: len,
  height: len,
  color: color.optional(),
  materialId: id.optional(),
  lightOn: z.boolean().optional(),
});

const floor = z.object({
  id,
  number: z.number().int(),
  name: z.string().max(100),
  height: len,
  walls: z.array(wall).max(5000),
  openings: z.array(z.discriminatedUnion('kind', [door, windowOpening])).max(5000),
  rooms: z.array(room).max(1000),
  objects: z.array(placedObject).max(10000),
});

export const projectDataSchema = z.object({
  schemaVersion: z.literal(1),
  units: z.enum(['mm', 'cm', 'm', 'in', 'ft']),
  floors: z.array(floor).min(1).max(50),
  settings: z.object({
    timeOfDay: z.enum(['day', 'night']),
    sunAngle: num,
    currency: z.literal('KZT'),
  }),
});
