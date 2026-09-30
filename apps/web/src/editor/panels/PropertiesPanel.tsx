import { Copy, Lightbulb, RotateCw, Trash2 } from 'lucide-react';
import {
  CATALOG_BY_ID,
  DOOR_PRESETS,
  MATERIALS_BY_ID,
  ROOM_TYPE_LABELS,
  WINDOW_PRESETS,
  defaultFloorMaterial,
  floorArea,
  formatArea,
  formatLength,
  formatPrice,
  normalizeAngle,
  roomArea,
  roomDimensions,
  uid,
  wallLength,
  UNIT_LABELS,
  type Door,
  type Opening,
  type PlacedObject,
  type Room,
  type Units,
  type Wall,
  type WindowOpening,
} from '@spaceplan/shared';
import { findSelected, useEditor, useFloor } from '../store';
import {
  DeleteObjectCommand,
  DeleteOpeningCommand,
  DeleteRoomCommand,
  DeleteWallCommand,
  DuplicateObjectCommand,
  SetWallLengthCommand,
  UpdateFloorCommand,
  UpdateObjectCommand,
  UpdateOpeningCommand,
  UpdateProjectCommand,
  UpdateRoomCommand,
  UpdateWallCommand,
} from '../commands';
import { ColorField, LengthField, NumberField, Section, SelectField, TextField } from './fields';
import { MaterialPicker } from './MaterialPicker';

export function PropertiesPanel() {
  const floor = useFloor();
  const selection = useEditor((s) => s.selection);
  const units = useEditor((s) => s.project.units);
  const selected = selection ? findSelected(floor, selection) : undefined;

  if (!selection || !selected) return <ProjectProperties />;
  switch (selection.kind) {
    case 'wall':
      return <WallProperties wall={selected as Wall} floorId={floor.id} units={units} />;
    case 'opening':
      return <OpeningProperties opening={selected as Opening} floorId={floor.id} units={units} />;
    case 'room':
      return <RoomProperties room={selected as Room} floorId={floor.id} units={units} />;
    case 'object':
      return <ObjectProperties obj={selected as PlacedObject} floorId={floor.id} units={units} />;
  }
}

const exec = (cmd: Parameters<ReturnType<typeof useEditor.getState>['execute']>[0]) => useEditor.getState().execute(cmd);

function Header({ title, subtitle, onDelete, extra }: { title: string; subtitle?: string; onDelete?: () => void; extra?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-gray-100 p-4">
      <div className="min-w-0">
        <h2 className="truncate font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        {extra}
        {onDelete && (
          <button className="btn-ghost px-2 text-red-600 hover:bg-red-50" title="Удалить (Delete)" onClick={onDelete}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function ProjectProperties() {
  const project = useEditor((s) => s.project);
  const floor = useFloor();
  const units = project.units;
  return (
    <div>
      <Header title="Проект" subtitle="Выберите элемент на плане, чтобы изменить его" />
      <Section title="Сводка">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">Площадь этажа</dt>
          <dd className="text-right font-medium">{formatArea(floorArea(floor), units)}</dd>
          <dt className="text-gray-500">Комнат</dt>
          <dd className="text-right font-medium">{floor.rooms.length}</dd>
          <dt className="text-gray-500">Стен</dt>
          <dd className="text-right font-medium">{floor.walls.length}</dd>
          <dt className="text-gray-500">Объектов</dt>
          <dd className="text-right font-medium">{floor.objects.length}</dd>
        </dl>
      </Section>
      <Section title="Единицы и этаж">
        <SelectField<Units>
          label="Единицы измерения"
          value={units}
          options={(['m', 'cm', 'mm', 'ft', 'in'] as Units[]).map((u) => ({ value: u, label: UNIT_LABELS[u] }))}
          onChange={(u) => exec(UpdateProjectCommand({ units: u }, 'Единицы измерения'))}
        />
        <TextField label="Название этажа" value={floor.name} onCommit={(name) => exec(UpdateFloorCommand(floor.id, { name }))} />
        <LengthField label="Высота потолка" valueCm={floor.height} units={units} min={200} onCommit={(height) => exec(UpdateFloorCommand(floor.id, { height }))} />
      </Section>
      <Section title="Освещение 3D">
        <SelectField
          label="Время суток"
          value={project.settings.timeOfDay}
          options={[
            { value: 'day', label: 'День' },
            { value: 'night', label: 'Ночь' },
          ]}
          onChange={(timeOfDay) => exec(UpdateProjectCommand({ settings: { timeOfDay } }, 'День / ночь'))}
        />
        <label className="block">
          <span className="label">Положение солнца: {Math.round(project.settings.sunAngle)}°</span>
          <input
            type="range"
            min={0}
            max={360}
            className="w-full"
            value={project.settings.sunAngle}
            onChange={(e) => exec(UpdateProjectCommand({ settings: { sunAngle: Number(e.target.value) } }, 'Положение солнца'))}
          />
        </label>
      </Section>
    </div>
  );
}

function WallProperties({ wall, floorId, units }: { wall: Wall; floorId: string; units: Units }) {
  return (
    <div>
      <Header title="Стена" subtitle={formatLength(wallLength(wall), units)} onDelete={() => exec(DeleteWallCommand(floorId, wall.id))} />
      <Section title="Размеры">
        <LengthField label="Длина" valueCm={wallLength(wall)} units={units} min={10} onCommit={(v) => exec(SetWallLengthCommand(floorId, wall.id, v))} />
        <LengthField label="Высота" valueCm={wall.height} units={units} min={10} onCommit={(v) => exec(UpdateWallCommand(floorId, wall.id, { height: v }))} />
        <LengthField label="Толщина" valueCm={wall.thickness} units={units} min={2} onCommit={(v) => exec(UpdateWallCommand(floorId, wall.id, { thickness: Math.min(v, 100) }))} />
      </Section>
      <Section title="Отделка">
        <MaterialPicker label="Материал" target="wall" value={wall.materialId} onChange={(materialId) => exec(UpdateWallCommand(floorId, wall.id, { materialId }))} />
      </Section>
    </div>
  );
}

function OpeningProperties({ opening, floorId, units }: { opening: Opening; floorId: string; units: Units }) {
  const update = (patch: Partial<Opening>) => exec(UpdateOpeningCommand(floorId, opening.id, patch));
  const isDoor = opening.kind === 'door';
  return (
    <div>
      <Header title={isDoor ? 'Дверь' : 'Окно'} subtitle={isDoor ? DOOR_PRESETS[opening.type].name : WINDOW_PRESETS[(opening as WindowOpening).type].name} onDelete={() => exec(DeleteOpeningCommand(floorId, opening.id))} />
      <Section title="Параметры">
        {isDoor ? (
          <SelectField
            label="Тип"
            value={opening.type}
            options={Object.entries(DOOR_PRESETS).map(([value, p]) => ({ value: value as Door['type'], label: p.name }))}
            onChange={(type) => update({ type, width: DOOR_PRESETS[type].width, color: DOOR_PRESETS[type].color } as Partial<Door>)}
          />
        ) : (
          <SelectField
            label="Тип"
            value={(opening as WindowOpening).type}
            options={Object.entries(WINDOW_PRESETS).map(([value, p]) => ({ value: value as WindowOpening['type'], label: p.name }))}
            onChange={(type) => update({ type, ...WINDOW_PRESETS[type] } as Partial<WindowOpening>)}
          />
        )}
        <LengthField label="Ширина" valueCm={opening.width} units={units} min={30} onCommit={(width) => update({ width })} />
        <LengthField label="Высота" valueCm={opening.height} units={units} min={30} onCommit={(height) => update({ height })} />
        {!isDoor && <LengthField label="Высота от пола" valueCm={opening.elevation} units={units} onCommit={(elevation) => update({ elevation })} />}
        <LengthField label="Отступ от начала стены" valueCm={opening.offset} units={units} onCommit={(offset) => update({ offset })} />
        {isDoor && (
          <>
            <SelectField
              label="Сторона петель"
              value={(opening as Door).hinge}
              options={[
                { value: 'left', label: 'Слева' },
                { value: 'right', label: 'Справа' },
              ]}
              onChange={(hinge) => update({ hinge } as Partial<Door>)}
            />
            <SelectField
              label="Открывание"
              value={(opening as Door).swing}
              options={[
                { value: 'in', label: 'Внутрь' },
                { value: 'out', label: 'Наружу' },
              ]}
              onChange={(swing) => update({ swing } as Partial<Door>)}
            />
          </>
        )}
        <ColorField label="Цвет" value={opening.color ?? '#ffffff'} onChange={(color) => update({ color })} />
      </Section>
    </div>
  );
}

function RoomProperties({ room, floorId, units }: { room: Room; floorId: string; units: Units }) {
  const floor = useFloor();
  const dims = roomDimensions(room, floor.walls);
  const update = (patch: Partial<Room>) => exec(UpdateRoomCommand(floorId, room.id, patch));
  return (
    <div>
      <Header
        title={room.name}
        subtitle={`${formatLength(dims.width, units)} × ${formatLength(dims.length, units)} · ${formatArea(roomArea(room, floor.walls), units)}`}
        onDelete={() => exec(DeleteRoomCommand(floorId, room.id))}
      />
      <Section title="Комната">
        <TextField label="Название" value={room.name} onCommit={(name) => update({ name })} />
        <SelectField<Room['type']>
          label="Тип"
          value={room.type}
          options={Object.entries(ROOM_TYPE_LABELS).map(([value, label]) => ({ value: value as Room['type'], label }))}
          onChange={(type) => {
            const autoName = Object.values(ROOM_TYPE_LABELS).includes(room.name);
            update({ type, floorMaterialId: defaultFloorMaterial(type), ...(autoName ? { name: ROOM_TYPE_LABELS[type] } : {}) });
          }}
        />
        <LengthField label="Высота потолка" valueCm={room.height ?? floor.height} units={units} min={200} onCommit={(height) => update({ height })} />
      </Section>
      <Section title="Отделка">
        <MaterialPicker label="Пол" target="floor" value={room.floorMaterialId} onChange={(floorMaterialId) => update({ floorMaterialId })} />
        <MaterialPicker label="Стены" target="wall" value={room.wallMaterialId} onChange={(wallMaterialId) => update({ wallMaterialId })} />
      </Section>
    </div>
  );
}

function ObjectProperties({ obj, floorId, units }: { obj: PlacedObject; floorId: string; units: Units }) {
  const item = CATALOG_BY_ID[obj.catalogItemId];
  const update = (patch: Partial<PlacedObject>) => exec(UpdateObjectCommand(floorId, obj.id, patch));
  return (
    <div>
      <Header
        title={item?.name ?? 'Объект'}
        subtitle={item ? `${formatPrice(item.price)}${item.manufacturer ? ` · ${item.manufacturer}` : ''}` : undefined}
        onDelete={() => exec(DeleteObjectCommand(floorId, obj.id))}
        extra={
          <>
            <button className="btn-ghost px-2" title="Повернуть на 90° (R)" onClick={() => update({ rotation: normalizeAngle(obj.rotation + 90) })}>
              <RotateCw size={16} />
            </button>
            <button className="btn-ghost px-2" title="Копировать (Ctrl+D)" onClick={() => exec(DuplicateObjectCommand(floorId, obj, uid('obj')))}>
              <Copy size={16} />
            </button>
          </>
        }
      />
      <Section title="Размер и положение">
        <div className="grid grid-cols-2 gap-2">
          <LengthField label="Ширина" valueCm={obj.width} units={units} min={1} onCommit={(width) => update({ width })} />
          <LengthField label="Глубина" valueCm={obj.depth} units={units} min={1} onCommit={(depth) => update({ depth })} />
          <LengthField label="Высота" valueCm={obj.height} units={units} min={1} onCommit={(height) => update({ height })} />
          <LengthField label="От пола" valueCm={obj.position.z} units={units} onCommit={(z) => update({ position: { ...obj.position, z } })} />
          <LengthField label="X" valueCm={obj.position.x} units={units} min={-1e6} onCommit={(x) => update({ position: { ...obj.position, x } })} />
          <LengthField label="Y" valueCm={obj.position.y} units={units} min={-1e6} onCommit={(y) => update({ position: { ...obj.position, y } })} />
        </div>
        <NumberField label="Поворот" suffix="°" value={Math.round(obj.rotation)} onCommit={(r) => update({ rotation: normalizeAngle(r) })} />
      </Section>
      <Section title="Внешний вид">
        <ColorField label="Цвет" value={obj.color ?? item?.color ?? '#999999'} onChange={(color) => update({ color })} />
        <MaterialPicker
          label="Материал"
          target="furniture"
          value={obj.materialId}
          onChange={(materialId) => update({ materialId, color: MATERIALS_BY_ID[materialId]?.baseColor })}
        />
        {item?.light && (
          <button className="btn-outline w-full" onClick={() => update({ lightOn: obj.lightOn === false })}>
            <Lightbulb size={16} /> {obj.lightOn === false ? 'Включить свет' : 'Выключить свет'}
          </button>
        )}
      </Section>
    </div>
  );
}
