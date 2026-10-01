import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Line, Rect, Shape, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  CATALOG_BY_ID,
  DOOR_PRESETS,
  WINDOW_PRESETS,
  boundingBox,
  clampOpeningOffset,
  createDoor,
  createWall,
  createWindow,
  dist,
  dot,
  formatArea,
  formatLength,
  getMaterial,
  interiorPoint,
  normalizeAngle,
  perp,
  pointOnWall,
  projectOnSegment,
  rectangleWalls,
  roomDimensions,
  roomInnerPolygon,
  roomArea,
  samePoint,
  snapObjectToWall,
  snapToGrid,
  sub,
  wallAngleDeg,
  wallDirection,
  wallLength,
  add,
  scale as vscale,
  DEFAULT_FLOOR_MATERIAL,
  type Floor,
  type Opening,
  type PlacedObject,
  type Units,
  type Vec2,
  type Wall,
} from '@spaceplan/shared';
import { useEditor, useFloor } from './store';
import { placeCatalogItem } from './placement';
import {
  AddOpeningCommand,
  AddWallsCommand,
  MoveObjectCommand,
  MoveWallCommand,
  MoveWallEndpointCommand,
  UpdateObjectCommand,
  UpdateOpeningCommand,
  type Command,
} from './commands';
import { drawSymbol } from './symbols2d';
import { MONO_FONT, PLAN_THEMES, alpha } from './planTheme';
import { drawCrosshair, drawDimensions, drawGrid, drawOpening, drawSelectedWall, drawSnapMarker, drawWalls, wallPolygon, type WorldRect } from './planRender';
import { viewport } from './viewport';

type Drag =
  | { kind: 'pan'; client: Vec2; pos: Vec2 }
  | { kind: 'wall'; wall: Wall; start: Vec2; cmd: Command | null }
  | { kind: 'endpoint'; from: Vec2; cmd: Command | null }
  | { kind: 'opening'; opening: Opening; wall: Wall; cmd: Command | null }
  | { kind: 'object'; obj: PlacedObject; grab: Vec2; cmd: Command | null }
  | { kind: 'room-rect'; start: Vec2; end?: Vec2 };

interface SnapResult {
  point: Vec2;
  kind: 'endpoint' | 'wall' | 'angle' | 'grid' | 'none';
}

const GRID_SNAP = 5; // cm

/** Snap a world point for wall drawing / editing */
function snapPoint(p: Vec2, floor: Floor, scale: number, opts: { from?: Vec2 | null; exclude?: Vec2 | null; free?: boolean }): SnapResult {
  if (opts.free) return { point: p, kind: 'none' };
  const tol = 14 / scale;
  let best: Vec2 | null = null;
  let bestD = tol;
  for (const w of floor.walls) {
    for (const q of [w.start, w.end]) {
      if (opts.exclude && samePoint(q, opts.exclude)) continue;
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  if (best) return { point: { ...best }, kind: 'endpoint' };

  if (opts.from) {
    const d = sub(p, opts.from);
    const l = Math.hypot(d.x, d.y);
    const a = Math.atan2(d.y, d.x);
    const step = Math.PI / 4;
    const snapped = Math.round(a / step) * step;
    if (Math.abs(snapped - a) < (6 * Math.PI) / 180) {
      const len = snapToGrid(l, GRID_SNAP);
      return { point: { x: opts.from.x + Math.cos(snapped) * len, y: opts.from.y + Math.sin(snapped) * len }, kind: 'angle' };
    }
  }

  for (const w of floor.walls) {
    const pr = projectOnSegment(p, w.start, w.end);
    if (pr.distance < 8 / scale && pr.t > 0 && pr.t < 1) return { point: pr.point, kind: 'wall' };
  }
  return { point: { x: snapToGrid(p.x, GRID_SNAP), y: snapToGrid(p.y, GRID_SNAP) }, kind: 'grid' };
}

/** Nearest wall to a point for placing doors/windows */
function wallUnder(p: Vec2, walls: Wall[], scale: number) {
  let best: { wall: Wall; offset: number; distance: number } | null = null;
  for (const w of walls) {
    const pr = projectOnSegment(p, w.start, w.end);
    if (pr.distance > w.thickness / 2 + 16 / scale) continue;
    if (!best || pr.distance < best.distance) best = { wall: w, offset: pr.t * wallLength(w), distance: pr.distance };
  }
  return best;
}

export default function Canvas2D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState({ scale: 0.8, x: 100, y: 100 });
  const [cursor, setCursor] = useState<SnapResult | null>(null);
  const [drawStart, setDrawStart] = useState<Vec2 | null>(null);
  const [chainStart, setChainStart] = useState<Vec2 | null>(null);
  const [rect, setRect] = useState<{ a: Vec2; b: Vec2 } | null>(null);
  const [ghost, setGhost] = useState<{ wall: Wall; offset: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const lastClick = useRef<{ t: number; x: number; y: number } | null>(null);

  const floor = useFloor();
  const project = useEditor((s) => s.project);
  const units: Units = project.units;
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const showDimensions = useEditor((s) => s.showDimensions);
  const planStyle = useEditor((s) => s.planStyle);
  const coordsRef = useRef<HTMLSpanElement>(null);
  const floorId = floor.id;
  const scale = view.scale;
  const px = (v: number) => v / scale; // screen pixels → world units

  // ------------------------------------------------------------------ layout
  useEffect(() => {
    const el = containerRef.current!;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = () => {
    const el = containerRef.current;
    if (!el) return;
    const pts = floor.walls.flatMap((w) => [w.start, w.end]);
    const w = el.clientWidth || 800;
    const h = el.clientHeight || 600;
    if (!pts.length) {
      setView({ scale: 0.8, x: w / 2 - 400, y: h / 2 - 250 });
      return;
    }
    const bb = boundingBox(pts);
    const s = Math.min((w - 220) / Math.max(bb.width, 100), (h - 220) / Math.max(bb.height, 100), 3);
    setView({ scale: s, x: w / 2 - (bb.minX + bb.width / 2) * s, y: h / 2 - (bb.minY + bb.height / 2) * s });
  };

  useEffect(fit, [floorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    viewport.center = { x: (size.width / 2 - view.x) / view.scale, y: (size.height / 2 - view.y) / view.scale };
  }, [size, view]);

  useEffect(() => {
    viewport.stage = stageRef.current;
    const onFit = () => fit();
    window.addEventListener('spaceplan:fit', onFit);
    return () => {
      viewport.stage = null;
      window.removeEventListener('spaceplan:fit', onFit);
    };
  });

  // Reset in-progress drawing when the tool changes
  useEffect(() => {
    setDrawStart(null);
    setChainStart(null);
    setRect(null);
    setGhost(null);
  }, [tool, floorId]);

  // Keyboard: Escape finishes a wall chain, Space pans
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) spaceDown.current = true;
      if (e.key === 'Escape') {
        setDrawStart(null);
        setChainStart(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Attach transformer to the selected object
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = selection?.kind === 'object' && tool === 'select' ? stage.findOne(`#${selection.id}`) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selection, tool, floor.objects]);

  // ------------------------------------------------------------------ helpers
  const store = useEditor.getState;

  const worldPointer = (): Vec2 => {
    const p = stageRef.current!.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
  };

  /** Find the semantic target (wall / opening / object / room / handle) of a Konva event */
  const targetOf = (node: Konva.Node | null): { name: string; id: string; node: Konva.Node } | null => {
    let n: Konva.Node | null = node;
    while (n && n !== stageRef.current) {
      if (n.getParent()?.getClassName() === 'Transformer' || n.getClassName() === 'Transformer') return { name: 'transformer', id: '', node: n };
      const name = n.name();
      if (['wall', 'opening', 'object', 'room', 'handle'].includes(name)) return { name, id: n.id(), node: n };
      n = n.getParent();
    }
    return null;
  };

  const finishChain = () => {
    setDrawStart(null);
    setChainStart(null);
  };

  // ------------------------------------------------------------------ pointer handlers
  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (drag.current) return;
    handlePointerDown(e);
    if (drag.current) startDrag();
  };

  const handlePointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const evt = e.evt;
    const p = worldPointer();
    if (evt.button === 1 || evt.button === 2 || tool === 'pan' || spaceDown.current) {
      if (evt.button === 2 && tool === 'wall') {
        finishChain();
        return;
      }
      drag.current = { kind: 'pan', client: { x: evt.clientX, y: evt.clientY }, pos: { x: view.x, y: view.y } };
      return;
    }
    if (evt.button !== 0) return;

    if (tool === 'wall') {
      // Double click (same spot, quick succession) finishes the chain
      const last = lastClick.current;
      lastClick.current = { t: evt.timeStamp, x: evt.clientX, y: evt.clientY };
      if (last && evt.timeStamp - last.t < 350 && Math.hypot(evt.clientX - last.x, evt.clientY - last.y) < 6) {
        finishChain();
        return;
      }
      const snap = snapPoint(p, floor, scale, { from: drawStart, free: evt.shiftKey });
      if (!drawStart) {
        setDrawStart(snap.point);
        setChainStart(snap.point);
        return;
      }
      if (dist(snap.point, drawStart) < 5) return;
      const wall = createWall(drawStart, snap.point, { height: floor.height });
      store().execute(AddWallsCommand(floorId, [wall]));
      if (chainStart && samePoint(snap.point, chainStart)) finishChain();
      else setDrawStart(snap.point);
      return;
    }

    if (tool === 'room') {
      const snap = snapPoint(p, floor, scale, { free: evt.shiftKey });
      drag.current = { kind: 'room-rect', start: snap.point };
      setRect({ a: snap.point, b: snap.point });
      return;
    }

    if (tool === 'door' || tool === 'window') {
      const hit = wallUnder(p, floor.walls, scale);
      if (!hit) return;
      const s = store();
      const opening =
        tool === 'door'
          ? createDoor(hit.wall, hit.offset, { type: s.doorType, ...pick(DOOR_PRESETS[s.doorType], ['width', 'height', 'color']) })
          : createWindow(hit.wall, hit.offset, { type: s.windowType, ...pick(WINDOW_PRESETS[s.windowType], ['width', 'height', 'elevation']) });
      if (wallLength(hit.wall) < opening.width) return;
      opening.height = Math.min(opening.height, hit.wall.height - opening.elevation);
      opening.offset = clampOpeningOffset(hit.wall, opening);
      s.execute(AddOpeningCommand(floorId, opening));
      s.select({ kind: 'opening', id: opening.id });
      return;
    }

    // Select tool
    const target = targetOf(e.target);
    if (!target) {
      store().select(null);
      drag.current = { kind: 'pan', client: { x: evt.clientX, y: evt.clientY }, pos: { x: view.x, y: view.y } };
      return;
    }
    if (target.name === 'transformer') return;
    const s = store();
    switch (target.name) {
      case 'wall': {
        const wall = floor.walls.find((w) => w.id === target.id)!;
        s.select({ kind: 'wall', id: wall.id });
        s.beginPreview();
        drag.current = { kind: 'wall', wall, start: p, cmd: null };
        break;
      }
      case 'handle': {
        const from = { x: target.node.getAttr('px') as number, y: target.node.getAttr('py') as number };
        s.beginPreview();
        drag.current = { kind: 'endpoint', from, cmd: null };
        break;
      }
      case 'opening': {
        const opening = floor.openings.find((o) => o.id === target.id)!;
        const wall = floor.walls.find((w) => w.id === opening.wallId)!;
        s.select({ kind: 'opening', id: opening.id });
        s.beginPreview();
        drag.current = { kind: 'opening', opening, wall, cmd: null };
        break;
      }
      case 'object': {
        const obj = floor.objects.find((o) => o.id === target.id)!;
        s.select({ kind: 'object', id: obj.id });
        s.beginPreview();
        drag.current = { kind: 'object', obj, grab: sub(p, obj.position), cmd: null };
        break;
      }
      case 'room':
        s.select({ kind: 'room', id: target.id });
        drag.current = { kind: 'pan', client: { x: evt.clientX, y: evt.clientY }, pos: { x: view.x, y: view.y } };
        break;
    }
  };

  /** Hover feedback for drawing tools (no button pressed) */
  const onPointerMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (drag.current) return;
    const p = worldPointer();
    if (tool === 'wall') setCursor(snapPoint(p, floor, scale, { from: drawStart, free: e.evt.shiftKey }));
    else if (tool === 'door' || tool === 'window') {
      const hit = wallUnder(p, floor.walls, scale);
      setGhost(hit ? { wall: hit.wall, offset: hit.offset } : null);
    }
  };

  // Always-fresh values for window-level drag listeners
  const live = useRef({ floor, floorId, scale });
  live.current = { floor, floorId, scale };

  /** Drag in progress: listen on window so moves / releases outside the stage are not lost */
  const startDrag = () => {
    const move = (evt: PointerEvent) => {
      stageRef.current?.setPointersPositions(evt);
      dragMove(evt);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      dragEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const dragMove = (evt: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { floor, floorId, scale } = live.current;
    const p = worldPointer();
    const s = store();

    if (d.kind === 'pan') {
      setView((v) => ({ ...v, x: d.pos.x + evt.clientX - d.client.x, y: d.pos.y + evt.clientY - d.client.y }));
    } else if (d.kind === 'room-rect') {
      const snap = snapPoint(p, floor, scale, { free: evt.shiftKey });
      d.end = snap.point;
      setRect({ a: d.start, b: snap.point });
      setCursor(snap);
    } else if (d.kind === 'wall') {
      const n = perp(wallDirection(d.wall));
      const along = snapToGrid(dot(sub(p, d.start), n), GRID_SNAP);
      d.cmd = MoveWallCommand(floorId, d.wall.id, d.wall, vscale(n, along));
      s.preview(d.cmd);
    } else if (d.kind === 'endpoint') {
      const base = s.previewBase?.floors.find((f) => f.id === floorId) ?? floor;
      const snap = snapPoint(p, base, scale, { exclude: d.from, free: evt.shiftKey });
      setCursor(snap);
      d.cmd = MoveWallEndpointCommand(floorId, d.from, snap.point);
      s.preview(d.cmd);
    } else if (d.kind === 'opening') {
      const pr = projectOnSegment(p, d.wall.start, d.wall.end);
      d.cmd = UpdateOpeningCommand(floorId, d.opening.id, { offset: snapToGrid(pr.t * wallLength(d.wall), 1) });
      s.preview(d.cmd);
    } else if (d.kind === 'object') {
      const target = sub(p, d.grab);
      let pos = { x: snapToGrid(target.x, 1), y: snapToGrid(target.y, 1) };
      let rotation: number | undefined;
      const item = CATALOG_BY_ID[d.obj.catalogItemId];
      if ((s.snapToWalls || item?.wallMounted) && !evt.shiftKey) {
        const snap = snapObjectToWall({ ...d.obj, position: { ...d.obj.position, ...pos } }, floor.walls, 25);
        if (snap) {
          pos = snap.position;
          rotation = snap.rotation;
        }
      }
      d.cmd = MoveObjectCommand(floorId, d.obj.id, pos.x, pos.y, rotation);
      s.preview(d.cmd);
    }
  };

  const dragEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const { floor, floorId } = live.current;
    const s = store();
    setCursor(null);
    if (d.kind === 'room-rect') {
      setRect(null);
      const b = d.end ?? d.start;
      const w = Math.abs(b.x - d.start.x);
      const h = Math.abs(b.y - d.start.y);
      if (w >= 50 && h >= 50) {
        s.execute(AddWallsCommand(floorId, rectangleWalls(Math.min(d.start.x, b.x), Math.min(d.start.y, b.y), w, h, { height: floor.height })));
      }
      return;
    }
    if (d.kind === 'pan') return;
    s.endPreview(d.cmd);
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current!;
    const pointer = stage.getPointerPosition()!;
    const factor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    const s = Math.max(0.05, Math.min(8, view.scale * factor));
    const wx = (pointer.x - view.x) / view.scale;
    const wy = (pointer.y - view.y) / view.scale;
    setView({ scale: s, x: pointer.x - wx * s, y: pointer.y - wy * s });
  };

  const onTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const obj = floor.objects.find((o) => o.id === node.id());
    if (!obj) return;
    const sx = Math.abs(node.scaleX());
    const sy = Math.abs(node.scaleY());
    node.scaleX(1);
    node.scaleY(1);
    store().execute(
      UpdateObjectCommand(floorId, obj.id, {
        width: Math.max(5, Math.round(obj.width * sx)),
        depth: Math.max(1, Math.round(obj.depth * sy)),
        rotation: normalizeAngle(node.rotation()),
        position: { ...obj.position, x: Math.round(node.x()), y: Math.round(node.y()) },
      }),
    );
  };

  // Drag & drop from the catalog (docs, section 13)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('application/x-spaceplan-item');
    if (!itemId) return;
    const stage = stageRef.current!;
    stage.setPointersPositions(e.nativeEvent);
    placeCatalogItem(itemId, worldPointer());
  };

  // ------------------------------------------------------------------ render data
  const theme = PLAN_THEMES[planStyle];
  const selectedWall = selection?.kind === 'wall' ? floor.walls.find((w) => w.id === selection.id) : undefined;
  const wallsById = useMemo(() => new Map(floor.walls.map((w) => [w.id, w])), [floor.walls]);
  const rooms = useMemo(
    () =>
      floor.rooms.map((r) => {
        const inner = roomInnerPolygon(r.polygon, floor.walls);
        const dims = roomDimensions(r, floor.walls);
        return { room: r, inner, label: interiorPoint(inner), area: roomArea(r, floor.walls), dims };
      }),
    [floor.rooms, floor.walls],
  );
  const drawing = tool === 'wall' && drawStart && cursor ? { a: drawStart, b: cursor.point } : null;
  const cursorStyle = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  const worldRect: WorldRect = {
    minX: -view.x / scale,
    minY: -view.y / scale,
    maxX: (size.width - view.x) / scale,
    maxY: (size.height - view.y) / scale,
  };
  const showCrosshair = cursor && (tool === 'wall' || tool === 'room');

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ cursor: cursorStyle, background: theme.bg }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={(e) => {
        const el = coordsRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!el || !rect) return;
        const x = (e.clientX - rect.left - view.x) / scale;
        const y = (e.clientY - rect.top - view.y) / scale;
        el.textContent = `X ${formatCoord(x, units)}  Y ${formatCoord(y, units)}`;
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => tool !== 'wall' && setCursor(null)}
        onWheel={onWheel}
      >
        <Layer listening={false}>
          <Shape sceneFunc={(ctx) => drawGrid(ctx._context, worldRect, px(1), theme)} />
        </Layer>

        <Layer>
          {rooms.map(({ room, inner }) => (
            <Line
              key={room.id}
              id={room.id}
              name="room"
              points={inner.flatMap((p) => [p.x, p.y])}
              closed
              fill={alpha(getMaterial(room.floorMaterialId, DEFAULT_FLOOR_MATERIAL).baseColor, theme.roomAlpha)}
              stroke={selection?.id === room.id ? theme.accent : undefined}
              strokeWidth={px(1.5)}
              dash={[px(6), px(4)]}
            />
          ))}

          <Shape
            listening={false}
            sceneFunc={(ctx) => {
              drawWalls(ctx._context, floor.walls, px(1), theme);
              if (selectedWall) drawSelectedWall(ctx._context, selectedWall, floor.walls, px(1), theme);
            }}
          />
          {/* Invisible hit areas: the walls themselves are drawn as one hatched solid above */}
          {floor.walls.map((w) => (
            <Line
              key={w.id}
              id={w.id}
              name="wall"
              points={wallPolygon(w, floor.walls).flatMap((p) => [p.x, p.y])}
              closed
              fill="#000"
              opacity={0}
              hitStrokeWidth={px(8)}
            />
          ))}

          {floor.openings.map((o) => {
            const w = wallsById.get(o.wallId);
            if (!w) return null;
            const pos = pointOnWall(w, o.offset);
            return (
              <Shape
                key={o.id}
                id={o.id}
                name="opening"
                x={pos.x}
                y={pos.y}
                rotation={wallAngleDeg(w)}
                sceneFunc={(ctx) => drawOpening(ctx._context, o, w.thickness, selection?.id === o.id, px(1), theme)}
                hitFunc={(ctx, shape) => {
                  ctx.beginPath();
                  ctx.rect(-o.width / 2, -w.thickness / 2 - px(4), o.width, w.thickness + px(8));
                  ctx.fillStrokeShape(shape);
                }}
              />
            );
          })}

          {floor.objects.map((o) => {
            const item = CATALOG_BY_ID[o.catalogItemId];
            return (
              <Shape
                key={o.id}
                id={o.id}
                name="object"
                x={o.position.x}
                y={o.position.y}
                rotation={o.rotation}
                // Size + centred offset give the transformer a real frame; drawing stays centre-based
                width={o.width}
                height={o.depth}
                offsetX={o.width / 2}
                offsetY={o.depth / 2}
                sceneFunc={(ctx) => {
                  ctx.translate(o.width / 2, o.depth / 2);
                  drawSymbol(ctx._context, item?.model ?? 'desk', o.width, o.depth, o.color ?? item?.color ?? '#999999', px(1), theme.symbol);
                }}
                hitFunc={(ctx, shape) => {
                  ctx.beginPath();
                  ctx.rect(0, Math.min(0, (o.depth - px(6)) / 2), o.width, Math.max(o.depth, px(6)));
                  ctx.fillStrokeShape(shape);
                }}
              />
            );
          })}

          {showDimensions && <Shape listening={false} sceneFunc={(ctx) => drawDimensions(ctx._context, floor, units, px(1), theme, selectedWall?.id)} />}

          {rooms.map(({ room, label, area, dims }) => {
            const name = room.name.toUpperCase();
            const areaText = formatArea(area, units);
            const dimsText = `${formatLength(dims.width, units)} × ${formatLength(dims.length, units)}`;
            // Approximate text widths (monospace digits) for the backing plate
            const plateW = px(Math.max(name.length * 9.2, areaText.length * 10.6, dimsText.length * 6.3) + 18);
            const plateH = px(56);
            const width = px(200);
            const common = { x: label.x, width, offsetX: width / 2, align: 'center' as const, listening: false };
            return (
              <Fragment key={`label-${room.id}`}>
                <Rect
                  x={label.x}
                  y={label.y}
                  width={plateW}
                  height={plateH}
                  offsetX={plateW / 2}
                  offsetY={px(28)}
                  fill={alpha(theme.bg === '#ffffff' ? '#ffffff' : '#0b1626', 0.72)}
                  stroke={selection?.id === room.id ? theme.accent : alpha(theme.accent, 0.25)}
                  strokeWidth={px(1)}
                  cornerRadius={px(2)}
                  listening={false}
                />
                <Text {...common} y={label.y - px(21)} text={name} fontSize={px(10.5)} fontStyle="600" letterSpacing={px(1.5)} fill={theme.textMuted} />
                <Text {...common} y={label.y - px(7)} text={areaText} fontSize={px(17)} fontStyle="600" fontFamily={MONO_FONT} fill={theme.text} />
                <Text {...common} y={label.y + px(13)} text={dimsText} fontSize={px(10)} fontFamily={MONO_FONT} fill={theme.textMuted} />
              </Fragment>
            );
          })}

          {selectedWall &&
            tool === 'select' &&
            [selectedWall.start, selectedWall.end].map((p, i) => (
              <Rect
                key={i}
                name="handle"
                px={p.x}
                py={p.y}
                x={p.x}
                y={p.y}
                width={px(10)}
                height={px(10)}
                offsetX={px(5)}
                offsetY={px(5)}
                fill={theme.bg}
                stroke={theme.accent}
                strokeWidth={px(1.5)}
                hitStrokeWidth={px(8)}
              />
            ))}

          <Transformer
            ref={trRef}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={6}
            anchorSize={8}
            anchorCornerRadius={0}
            anchorFill={theme.bg}
            anchorStroke={theme.accent}
            borderStroke={theme.accent}
            borderDash={[4, 3]}
            rotateAnchorOffset={24}
            keepRatio={false}
            flipEnabled={false}
            enabledAnchors={['middle-left', 'middle-right', 'top-center', 'bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']}
            onTransformEnd={onTransformEnd}
          />
        </Layer>

        <Layer listening={false}>
          {showCrosshair && <Shape sceneFunc={(ctx) => drawCrosshair(ctx._context, cursor.point, worldRect, px(1), theme)} />}
          {drawing && (
            <>
              <Shape
                sceneFunc={(ctx) => {
                  const c = ctx._context;
                  const l = dist(drawing.a, drawing.b);
                  if (l < 1) return;
                  const wall = createWall(drawing.a, drawing.b);
                  const poly = wallPolygon(wall, []);
                  c.beginPath();
                  poly.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
                  c.closePath();
                  c.fillStyle = theme.selFill;
                  c.fill();
                  c.setLineDash([px(5), px(3)]);
                  c.lineWidth = px(1.5);
                  c.strokeStyle = theme.accent;
                  c.stroke();
                }}
              />
              <MeasureTag
                at={{ x: (drawing.a.x + drawing.b.x) / 2, y: (drawing.a.y + drawing.b.y) / 2 }}
                text={`${formatLength(dist(drawing.a, drawing.b), units)}  ${Math.round(normalizeAngle(-wallAngleDeg({ start: drawing.a, end: drawing.b })))}°`}
                px={px}
                color={theme.accent}
                bg={theme.bg}
              />
            </>
          )}
          {rect && (
            <>
              <Rect
                x={Math.min(rect.a.x, rect.b.x)}
                y={Math.min(rect.a.y, rect.b.y)}
                width={Math.abs(rect.b.x - rect.a.x)}
                height={Math.abs(rect.b.y - rect.a.y)}
                fill={theme.selFill}
                stroke={theme.accent}
                strokeWidth={px(1.5)}
                dash={[px(5), px(3)]}
              />
              <MeasureTag
                at={{ x: (rect.a.x + rect.b.x) / 2, y: Math.min(rect.a.y, rect.b.y) - px(18) }}
                text={`${formatLength(Math.abs(rect.b.x - rect.a.x), units)} × ${formatLength(Math.abs(rect.b.y - rect.a.y), units)}`}
                px={px}
                color={theme.accent}
                bg={theme.bg}
              />
            </>
          )}
          {ghost && (tool === 'door' || tool === 'window') && <GhostOpening wall={ghost.wall} offset={ghost.offset} tool={tool} px={px} color={tool === 'door' ? theme.door : theme.window} />}
          {cursor && cursor.kind !== 'none' && (tool === 'wall' || tool === 'room' || drag.current?.kind === 'endpoint') && (
            <Shape sceneFunc={(ctx) => drawSnapMarker(ctx._context, cursor.point, cursor.kind, px(1), theme)} />
          )}
        </Layer>
      </Stage>

      <Hud theme={theme} hint={hintFor(tool, !!drawStart)} scale={scale} units={units} coordsRef={coordsRef} />
    </div>
  );
}

/** Screen-space overlay: tool hint, pointer coordinates and a scale bar */
function Hud({
  theme,
  hint,
  scale,
  units,
  coordsRef,
}: {
  theme: (typeof PLAN_THEMES)[keyof typeof PLAN_THEMES];
  hint: string;
  scale: number;
  units: Units;
  coordsRef: React.RefObject<HTMLSpanElement | null>;
}) {
  // Scale bar: a round length that is 70–180 px long on screen
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const len = nice.find((l) => l * scale >= 70) ?? 10000;
  return (
    <>
      <div className="hud pointer-events-none absolute bottom-3 left-3 max-w-[55%] px-2.5 py-1.5 font-mono text-[11px]">
        {hint}
      </div>
      <div className="hud pointer-events-none absolute right-3 bottom-3 flex items-center gap-3 px-2.5 py-1.5 font-mono text-[11px]">
        <span ref={coordsRef} className="tabular-nums" style={{ color: theme.text }}>
          X —  Y —
        </span>
        <span className="h-5 w-px bg-[var(--hud-border)]" />
        <span className="flex flex-col items-start gap-0.5">
          <span className="flex" style={{ width: len * scale }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-1.5 flex-1 border" style={{ borderColor: theme.text, background: i % 2 ? 'transparent' : theme.text }} />
            ))}
          </span>
          <span style={{ color: theme.text }}>{formatLength(len, units)}</span>
        </span>
        <span className="tabular-nums" style={{ color: theme.textMuted }}>{Math.round(scale * 100)}%</span>
      </div>
    </>
  );
}

function formatCoord(v: number, units: Units) {
  return units === 'in' || units === 'ft' ? formatLength(v, units) : `${(v / 100).toFixed(2)} м`;
}

/** Live measurement shown while drawing */
function MeasureTag({ at, text, px, color, bg }: { at: Vec2; text: string; px: (v: number) => number; color: string; bg: string }) {
  const fs = px(11.5);
  const w = fs * 0.62 * text.length + px(14);
  const h = px(20);
  return (
    <>
      <Rect x={at.x} y={at.y} width={w} height={h} offsetX={w / 2} offsetY={h / 2} fill={bg} stroke={color} strokeWidth={px(1)} cornerRadius={px(2)} />
      <Text x={at.x} y={at.y} width={w} offsetX={w / 2} offsetY={fs / 2 - px(0.5)} text={text} fontSize={fs} fontStyle="600" fontFamily={MONO_FONT} fill={color} align="center" />
    </>
  );
}

function pick<T extends object, K extends keyof T>(o: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((k) => [k, o[k]])) as Pick<T, K>;
}

function hintFor(tool: string, drawing: boolean) {
  switch (tool) {
    case 'wall':
      return drawing ? 'Клик — следующая точка, двойной клик / Esc — завершить, Shift — без привязки' : 'Клик — начать стену';
    case 'room':
      return 'Потяните, чтобы нарисовать прямоугольную комнату';
    case 'door':
    case 'window':
      return 'Кликните по стене, чтобы вставить';
    case 'pan':
      return 'Перетаскивайте холст';
    default:
      return 'Выделение: клик по объекту, перетаскивание; колесо — масштаб, пробел/правая кнопка — панорама';
  }
}

function GhostOpening({ wall, offset, tool, px, color }: { wall: Wall; offset: number; tool: 'door' | 'window'; px: (v: number) => number; color: string }) {
  const s = useEditor.getState();
  const width = tool === 'door' ? DOOR_PRESETS[s.doorType].width : WINDOW_PRESETS[s.windowType].width;
  const l = wallLength(wall);
  const o = Math.max(width / 2, Math.min(l - width / 2, offset));
  const p = pointOnWall(wall, o);
  return (
    <Rect
      x={p.x}
      y={p.y}
      width={width}
      height={wall.thickness + px(6)}
      offsetX={width / 2}
      offsetY={(wall.thickness + px(6)) / 2}
      rotation={wallAngleDeg(wall)}
      fill={alpha(color, 0.35)}
      stroke={color}
      strokeWidth={px(1.5)}
      dash={[px(4), px(3)]}
    />
  );
}
