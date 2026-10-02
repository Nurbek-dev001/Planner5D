/**
 * SpacePlan Project JSON — the single source of truth for both the 2D and 3D renderers
 * (see docs, section 37). All linear dimensions are stored in centimetres; the `units`
 * field only controls how values are displayed and entered.
 *
 * Coordinate system: the 2D plan lives in the X/Y plane (Y grows "down" on screen).
 * In 3D the plan X maps to world X, the plan Y maps to world Z and height is world Y.
 */

export type Units = 'mm' | 'cm' | 'm' | 'in' | 'ft';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Wall {
  id: string;
  start: Vec2;
  end: Vec2;
  /** cm */
  height: number;
  /** cm */
  thickness: number;
  materialId?: string;
}

export type DoorType = 'single' | 'double' | 'sliding' | 'glass' | 'entrance';
export type WindowType = 'standard' | 'double' | 'panoramic' | 'corner' | 'balcony';

interface OpeningBase {
  id: string;
  wallId: string;
  /** Distance from wall start to the opening centre, cm */
  offset: number;
  /** cm */
  width: number;
  /** cm */
  height: number;
  /** Height of the opening bottom above the floor, cm (0 for doors) */
  elevation: number;
  materialId?: string;
  color?: string;
}

export interface Door extends OpeningBase {
  kind: 'door';
  type: DoorType;
  /** Hinge side, looking from the wall start towards the wall end */
  hinge: 'left' | 'right';
  /** Which side of the wall the leaf swings to */
  swing: 'in' | 'out';
}

export interface WindowOpening extends OpeningBase {
  kind: 'window';
  type: WindowType;
}

export type Opening = Door | WindowOpening;

export type RoomType =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'toilet'
  | 'kids'
  | 'office'
  | 'wardrobe'
  | 'hallway'
  | 'balcony'
  | 'custom';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  /** Polygon along wall centre lines (derived from walls, recomputed automatically) */
  polygon: Vec2[];
  floorMaterialId: string;
  wallMaterialId?: string;
  /** Ceiling height override, cm */
  height?: number;
}

export interface PlacedObject {
  id: string;
  catalogItemId: string;
  /** Centre of the object footprint on the plan (x, y) and elevation above the floor (z), cm */
  position: Vec3;
  /** Rotation around the vertical axis, degrees, clockwise on the plan */
  rotation: number;
  /** Actual dimensions, cm (start from catalog defaults, user can resize) */
  width: number;
  depth: number;
  height: number;
  color?: string;
  materialId?: string;
  /** Lights only */
  lightOn?: boolean;
}

export interface Floor {
  id: string;
  number: number;
  name: string;
  /** Default wall/ceiling height for this floor, cm */
  height: number;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  objects: PlacedObject[];
}

export interface ProjectSettings {
  /** Day or night lighting preset for 3D */
  timeOfDay: 'day' | 'night';
  /** Sun azimuth, degrees */
  sunAngle: number;
  currency: 'KZT';
}

export interface ProjectData {
  schemaVersion: 1;
  units: Units;
  floors: Floor[];
  settings: ProjectSettings;
}

export type CatalogCategoryId =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'office'
  | 'decor'
  | 'lighting';

/**
 * Procedural 3D model kinds. Used when a catalog item has no GLB `modelUrl` yet;
 * the web client builds a low-poly model from primitives.
 */
export type ModelKind =
  | 'sofa'
  | 'corner-sofa'
  | 'armchair'
  | 'coffee-table'
  | 'tv'
  | 'tv-stand'
  | 'bookshelf'
  | 'wardrobe'
  | 'bed'
  | 'nightstand'
  | 'dresser'
  | 'desk'
  | 'office-chair'
  | 'dining-table'
  | 'round-table'
  | 'chair'
  | 'kitchen-base'
  | 'kitchen-wall'
  | 'fridge'
  | 'stove'
  | 'sink-cabinet'
  | 'bathtub'
  | 'shower'
  | 'washbasin'
  | 'toilet'
  | 'washing-machine'
  | 'plant'
  | 'rug'
  | 'mirror'
  | 'painting'
  | 'ceiling-light'
  | 'floor-lamp'
  | 'wall-lamp'
  | 'computer';

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategoryId;
  subcategory: string;
  model: ModelKind;
  modelUrl?: string | null;
  thumbnail?: string | null;
  /** cm */
  width: number;
  depth: number;
  height: number;
  /** Default elevation above the floor, cm */
  elevation?: number;
  manufacturer?: string;
  /** Price in KZT */
  price: number;
  currency: 'KZT';
  color: string;
  materialId?: string;
  premium: boolean;
  /** Mounted on a wall (paintings, wall cabinets, wall lamps) */
  wallMounted?: boolean;
  /** Emits light in 3D */
  light?: boolean;
}

export interface CatalogCategory {
  id: CatalogCategoryId;
  name: string;
  subcategories: string[];
}

export type MaterialTarget = 'wall' | 'floor' | 'furniture';

export type TexturePattern =
  | 'none'
  | 'planks'
  | 'parquet'
  | 'tiles'
  | 'brick'
  | 'marble'
  | 'concrete'
  | 'carpet'
  | 'wallpaper'
  | 'plaster'
  | 'fabric'
  | 'leather';

export interface Material {
  id: string;
  name: string;
  target: MaterialTarget;
  baseColor: string;
  /** Procedural texture pattern (textures are generated client-side for the MVP) */
  pattern: TexturePattern;
  textureUrl?: string | null;
  normalUrl?: string | null;
  roughness: number;
  metallic: number;
  /** Texture repeat size, cm */
  scale: number;
  /** Price per m² in KZT (floor / wall finishing), used by the budget calculator */
  pricePerM2?: number;
}
