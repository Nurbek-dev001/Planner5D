import type Konva from 'konva';
import type { Vec2 } from '@spaceplan/shared';

/**
 * Shared handles between the editor panels and the active renderer
 * (catalog "click to add" placement point, screenshot export).
 */
export const viewport = {
  /** World point at the centre of the visible 2D area */
  center: { x: 0, y: 0 } as Vec2,
  stage: null as Konva.Stage | null,
  canvas3d: null as HTMLCanvasElement | null,
};
