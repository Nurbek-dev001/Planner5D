import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Layer, Line, Rect, Shape, Stage, Text, Transformer } from 'react-konva';
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
import { drawSymbol, tint } from './symbols2d';
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

/** Outline polygon of a wall, extended by half thickness at joined ends to close corners */
function wallPolygon(w: Wall, walls: Wall[]): number[] {
  const dir = wallDirection(w);
  const n = vscale(perp(dir), w.thickness / 2);
  const joined = (p: Vec2) => walls.some((o) => o.id !== w.id && (samePoint(o.start, p) || samePoint(o.end, p)));
  const s = joined(w.start) ? sub(w.start, vscale(dir, w.thickness / 2)) : w.start;
  const e = joined(w.end) ? add(w.end, vscale(dir, w.thickness / 2)) : w.end;
  const pts = [add(s, n), add(e, n), sub(e, n), sub(s, n)];
  return pts.flatMap((p) => [p.x, p.y]);
}

function readableAngle(deg: number) {
  let a = deg;
  if (a > 90) a -= 180;
  if (a <= -90) a += 180;
  return a;
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
    const s = Math.min((w - 120) / Math.max(bb.width, 100), (h - 120) / Math.max(bb.height, 100), 3);
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

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#fbfbfc]"
      style={{ cursor: cursorStyle }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
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
          <Grid width={size.width} height={size.height} view={view} />
        </Layer>

        <Layer>
          {rooms.map(({ room, inner }) => (
            <Line
              key={room.id}
              id={room.id}
              name="room"
              points={inner.flatMap((p) => [p.x, p.y])}
              closed
              fill={tint(getMaterial(room.floorMaterialId, DEFAULT_FLOOR_MATERIAL).baseColor, 0.3)}
              stroke={selection?.id === room.id ? '#2563eb' : undefined}
              strokeWidth={px(2)}
              dash={[px(6), px(4)]}
            />
          ))}

          {floor.walls.map((w) => (
            <Line
              key={w.id}
              id={w.id}
              name="wall"
              points={wallPolygon(w, floor.walls)}
              closed
              fill={selection?.id === w.id ? '#3b82f6' : '#374151'}
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
                sceneFunc={(ctx) => drawOpening(ctx._context, o, w.thickness, selection?.id === o.id, px(1.2))}
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
                sceneFunc={(ctx) => {
                  drawSymbol(ctx._context, item?.model ?? 'desk', o.width, o.depth, o.color ?? item?.color ?? '#999999', px(1));
                }}
                hitFunc={(ctx, shape) => {
                  ctx.beginPath();
                  ctx.rect(-o.width / 2, -o.depth / 2, o.width, Math.max(o.depth, px(6)));
                  ctx.fillStrokeShape(shape);
                }}
              />
            );
          })}

          {showDimensions &&
            floor.walls.map((w) => {
              const mid = pointOnWall(w, wallLength(w) / 2);
              const n = perp(wallDirection(w));
              const at = add(mid, vscale(n, -(w.thickness / 2 + px(12))));
              const fs = px(11);
              const label = formatLength(wallLength(w), units);
              const width = fs * 0.6 * label.length;
              return (
                <Text
                  key={`dim-${w.id}`}
                  x={at.x}
                  y={at.y}
                  text={label}
                  fontSize={fs}
                  fill="#6b7280"
                  rotation={readableAngle(wallAngleDeg(w))}
                  offsetX={width / 2}
                  offsetY={fs / 2}
                  width={width}
                  align="center"
                  listening={false}
                />
              );
            })}

          {rooms.map(({ room, label, area, dims }) => {
            const fs = px(12);
            const text = `${room.name}\n${formatLength(dims.width, units)} × ${formatLength(dims.length, units)}\n${formatArea(area, units)}`;
            const width = px(170);
            return (
              <Text
                key={`label-${room.id}`}
                x={label.x}
                y={label.y}
                text={text}
                fontSize={fs}
                lineHeight={1.3}
                fill="#1f2937"
                align="center"
                width={width}
                offsetX={width / 2}
                offsetY={fs * 2}
                listening={false}
              />
            );
          })}

          {selectedWall &&
            tool === 'select' &&
            [selectedWall.start, selectedWall.end].map((p, i) => (
              <Circle key={i} name="handle" px={p.x} py={p.y} x={p.x} y={p.y} radius={px(7)} fill="#fff" stroke="#2563eb" strokeWidth={px(2)} />
            ))}

          <Transformer
            ref={trRef}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={6}
            anchorSize={8}
            keepRatio={false}
            flipEnabled={false}
            borderStroke="#2563eb"
            anchorStroke="#2563eb"
            enabledAnchors={['middle-left', 'middle-right', 'top-center', 'bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']}
            onTransformEnd={onTransformEnd}
          />
        </Layer>

        <Layer listening={false}>
          {drawing && (
            <>
              <Line points={[drawing.a.x, drawing.a.y, drawing.b.x, drawing.b.y]} stroke="#2563eb" strokeWidth={20} opacity={0.35} lineCap="square" />
              <Line points={[drawing.a.x, drawing.a.y, drawing.b.x, drawing.b.y]} stroke="#2563eb" strokeWidth={px(1.5)} dash={[px(6), px(4)]} />
              <Text
                x={(drawing.a.x + drawing.b.x) / 2 + px(10)}
                y={(drawing.a.y + drawing.b.y) / 2 + px(10)}
                text={formatLength(dist(drawing.a, drawing.b), units)}
                fontSize={px(13)}
                fontStyle="bold"
                fill="#1d4ed8"
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
                stroke="#2563eb"
                strokeWidth={20}
                opacity={0.35}
              />
              <Text
                x={Math.min(rect.a.x, rect.b.x)}
                y={Math.min(rect.a.y, rect.b.y) - px(20)}
                text={`${formatLength(Math.abs(rect.b.x - rect.a.x), units)} × ${formatLength(Math.abs(rect.b.y - rect.a.y), units)}`}
                fontSize={px(13)}
                fontStyle="bold"
                fill="#1d4ed8"
              />
            </>
          )}
          {ghost && (tool === 'door' || tool === 'window') && (
            <GhostOpening wall={ghost.wall} offset={ghost.offset} tool={tool} px={px} />
          )}
          {cursor && cursor.kind !== 'none' && (tool === 'wall' || tool === 'room' || drag.current?.kind === 'endpoint') && (
            <Circle
              x={cursor.point.x}
              y={cursor.point.y}
              radius={px(cursor.kind === 'endpoint' ? 6 : 4)}
              fill={cursor.kind === 'endpoint' ? '#f59e0b' : cursor.kind === 'wall' ? '#10b981' : '#2563eb'}
            />
          )}
        </Layer>
      </Stage>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/90 px-2 py-1 text-xs text-gray-500 shadow-sm">
        {hintFor(tool, !!drawStart)} · масштаб {Math.round(view.scale * 100)}%
      </div>
    </div>
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

function GhostOpening({ wall, offset, tool, px }: { wall: Wall; offset: number; tool: 'door' | 'window'; px: (v: number) => number }) {
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
      fill={tool === 'door' ? '#f59e0b' : '#38bdf8'}
      opacity={0.6}
    />
  );
}

function drawOpening(c: CanvasRenderingContext2D, o: Opening, t: number, selected: boolean, lw: number) {
  const w = o.width;
  const stroke = selected ? '#2563eb' : '#374151';
  c.save();
  c.fillStyle = '#ffffff';
  c.fillRect(-w / 2, -t / 2 - 0.5, w, t + 1);
  c.lineWidth = lw;
  c.strokeStyle = stroke;
  if (o.kind === 'window') {
    c.fillStyle = selected ? '#bfdbfe' : '#e0f2fe';
    c.fillRect(-w / 2, -t / 4, w, t / 2);
    c.strokeRect(-w / 2, -t / 2, w, t);
    c.beginPath();
    c.moveTo(-w / 2, 0);
    c.lineTo(w / 2, 0);
    c.stroke();
  } else {
    const side = o.swing === 'in' ? 1 : -1;
    c.beginPath();
    c.moveTo(-w / 2, -t / 2);
    c.lineTo(-w / 2, t / 2);
    c.moveTo(w / 2, -t / 2);
    c.lineTo(w / 2, t / 2);
    c.stroke();
    if (o.type === 'sliding') {
      c.fillStyle = selected ? '#bfdbfe' : '#f3f4f6';
      c.fillRect(-w / 2, -t / 4, w * 0.55, t / 4);
      c.strokeRect(-w / 2, -t / 4, w * 0.55, t / 4);
      c.fillRect(w / 2 - w * 0.55, 0, w * 0.55, t / 4);
      c.strokeRect(w / 2 - w * 0.55, 0, w * 0.55, t / 4);
    } else {
      const leaves: [number, number, number][] =
        o.type === 'double'
          ? [
              [-w / 2, w / 2, 1],
              [w / 2, w / 2, -1],
            ]
          : [[o.hinge === 'left' ? -w / 2 : w / 2, w, o.hinge === 'left' ? 1 : -1]];
      for (const [hx, lw2, dir] of leaves) {
        const y0 = (side * t) / 2;
        c.beginPath();
        c.moveTo(hx, y0);
        c.lineTo(hx, y0 + side * lw2);
        c.stroke();
        c.beginPath();
        c.setLineDash([lw * 3, lw * 2]);
        const start = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        const end = dir > 0 ? 0 : Math.PI;
        c.arc(hx, y0, lw2, start, end, (side > 0) === dir > 0);
        c.stroke();
        c.setLineDash([]);
      }
    }
  }
  c.restore();
}

function Grid({ width, height, view }: { width: number; height: number; view: { scale: number; x: number; y: number } }) {
  return (
    <Shape
      sceneFunc={(ctx) => {
        const c = ctx._context;
        const s = view.scale;
        const minX = -view.x / s;
        const minY = -view.y / s;
        const maxX = minX + width / s;
        const maxY = minY + height / s;
        const steps = [10, 50, 100, 500, 1000];
        const minor = steps.find((st) => st * s >= 8) ?? 1000;
        const major = minor * (minor === 10 ? 10 : minor === 50 ? 2 : 5);
        const drawLines = (step: number, color: string) => {
          c.beginPath();
          c.strokeStyle = color;
          c.lineWidth = 1 / s;
          for (let x = Math.floor(minX / step) * step; x <= maxX; x += step) {
            c.moveTo(x, minY);
            c.lineTo(x, maxY);
          }
          for (let y = Math.floor(minY / step) * step; y <= maxY; y += step) {
            c.moveTo(minX, y);
            c.lineTo(maxX, y);
          }
          c.stroke();
        };
        drawLines(minor, '#eef0f3');
        drawLines(major, '#dde1e6');
      }}
    />
  );
}
