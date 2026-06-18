import { Image as ImageIcon, RotateCw, Ruler, Trash2 } from 'lucide-react';
import type { BackgroundImage, DesignDocument, FurnitureInstance, Opening, RoomLabel, Selection, Wall } from '../types';
import { pxToMeters, resizeWallByLength, wallLengthPx } from '../utils/geometry';

type PropertiesPanelProps = {
  design: DesignDocument;
  selection: Selection | null;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onDelete: () => void;
  onStartCalibration: () => void;
};

const numberValue = (value: string) => Number.parseFloat(value) || 0;

export default function PropertiesPanel({ design, selection, onChange, onDelete, onStartCalibration }: PropertiesPanelProps) {
  const selectedWall = selection?.type === 'wall' ? design.walls.find((item) => item.id === selection.id) : undefined;
  const selectedOpening =
    selection?.type === 'opening' ? design.openings.find((item) => item.id === selection.id) : undefined;
  const selectedFurniture =
    selection?.type === 'furniture' ? design.furniture.find((item) => item.instanceId === selection.id) : undefined;
  const selectedRoom = selection?.type === 'room' ? design.rooms.find((item) => item.id === selection.id) : undefined;

  return (
    <aside className="properties-panel">
      <div className="section-title">
        <RotateCw size={16} />
        <span>属性</span>
      </div>

      {!selection && (
        <div className="empty-properties">
          <strong>{design.name}</strong>
          <span>{design.walls.length} 面墙</span>
          <span>{design.openings.length} 个门窗</span>
          <span>{design.furniture.length} 件家具</span>
        </div>
      )}

      {selectedWall && (
        <WallEditor
          design={design}
          wall={selectedWall}
          onChange={onChange}
          onDelete={onDelete}
        />
      )}

      {selectedOpening && (
        <OpeningEditor
          opening={selectedOpening}
          onChange={onChange}
          onDelete={onDelete}
        />
      )}

      {selectedFurniture && (
        <FurnitureEditor
          furniture={selectedFurniture}
          onChange={onChange}
          onDelete={onDelete}
        />
      )}

      {selectedRoom && (
        <RoomEditor
          room={selectedRoom}
          onChange={onChange}
          onDelete={onDelete}
        />
      )}

      {design.backgroundImage && (
        <BackgroundImageEditor backgroundImage={design.backgroundImage} onChange={onChange} onStartCalibration={onStartCalibration} />
      )}
    </aside>
  );
}

function BackgroundImageEditor({
  backgroundImage,
  onChange,
  onStartCalibration
}: {
  backgroundImage: BackgroundImage;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onStartCalibration: () => void;
}) {
  const calibration = backgroundImage.calibration ?? {};
  const hasCalibrationPoints = Boolean(calibration.start && calibration.end);
  const pixelLength =
    calibration.start && calibration.end
      ? Math.hypot(calibration.end.x - calibration.start.x, calibration.end.y - calibration.start.y)
      : 0;

  return (
    <div className="property-stack background-property-stack">
      <h2>
        <ImageIcon size={16} />
        户型底图
      </h2>
      <div className="background-file-name">{backgroundImage.fileName}</div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={backgroundImage.visible}
          onChange={(event) => {
            const visible = event.target.checked;
            onChange((current) => ({
              ...current,
              backgroundImage: current.backgroundImage ? { ...current.backgroundImage, visible } : current.backgroundImage
            }));
          }}
        />
        <span>显示底图</span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={backgroundImage.locked}
          onChange={(event) => {
            const locked = event.target.checked;
            onChange((current) => ({
              ...current,
              backgroundImage: current.backgroundImage ? { ...current.backgroundImage, locked } : current.backgroundImage
            }));
          }}
        />
        <span>锁定底图</span>
      </label>
      <label>
        <span>透明度</span>
        <input
          type="range"
          min="0.15"
          max="1"
          step="0.05"
          value={backgroundImage.opacity}
          onChange={(event) => {
            const opacity = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              backgroundImage: current.backgroundImage ? { ...current.backgroundImage, opacity } : current.backgroundImage
            }));
          }}
        />
      </label>
      <label>
        <span>标定长度（米）</span>
        <input
          type="number"
          min="0.1"
          step="0.1"
          value={calibration.realLengthMeters ?? ''}
          onChange={(event) => {
            const realLengthMeters = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              backgroundImage: current.backgroundImage
                ? {
                    ...current.backgroundImage,
                    calibration: {
                      ...(current.backgroundImage.calibration ?? {}),
                      realLengthMeters
                    }
                  }
                : current.backgroundImage
            }));
          }}
          placeholder="例如 3.6"
        />
      </label>
      <button
        className="secondary-button"
        type="button"
        disabled={!hasCalibrationPoints || !calibration.realLengthMeters}
        onClick={() => {
          const realLengthMeters = calibration.realLengthMeters ?? 0;

          if (!calibration.start || !calibration.end || realLengthMeters <= 0) {
            return;
          }

          const pixelsPerMeter = pixelLength / realLengthMeters;
          onChange((current) => ({
            ...current,
            canvas: {
              ...current.canvas,
              scalePxPerMeter: pixelsPerMeter
            },
            backgroundImage: current.backgroundImage
              ? {
                  ...current.backgroundImage,
                  calibration: {
                    ...(current.backgroundImage.calibration ?? {}),
                    realLengthMeters,
                    pixelsPerMeter,
                    calibratedAt: new Date().toISOString()
                  }
                }
              : current.backgroundImage
          }));
        }}
      >
        <Ruler size={16} />
        应用比例
      </button>
      <button className="secondary-button" type="button" onClick={onStartCalibration}>
        <Ruler size={16} />
        重新标定
      </button>
      <button
        className="danger-button"
        type="button"
        onClick={() => {
          onChange((current) => {
            const { backgroundImage: _backgroundImage, ...rest } = current;
            return rest;
          });
        }}
      >
        <Trash2 size={16} />
        删除底图
      </button>
    </div>
  );
}

function WallEditor({
  design,
  wall,
  onChange,
  onDelete
}: {
  design: DesignDocument;
  wall: Wall;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onDelete: () => void;
}) {
  const length = pxToMeters(wallLengthPx(wall), design.canvas.scalePxPerMeter);

  return (
    <div className="property-stack">
      <h2>墙体</h2>
      <label>
        <span>长度（米）</span>
        <input
          type="number"
          min="0.25"
          step="0.05"
          value={length.toFixed(2)}
          onChange={(event) => {
            const meters = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              walls: current.walls.map((item) =>
                item.id === wall.id ? resizeWallByLength(item, meters, current.canvas.scalePxPerMeter) : item
              )
            }));
          }}
        />
      </label>
      <label>
        <span>墙厚（像素）</span>
        <input
          type="number"
          min="6"
          max="32"
          value={wall.thickness}
          onChange={(event) => {
            const thickness = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              walls: current.walls.map((item) => (item.id === wall.id ? { ...item, thickness } : item))
            }));
          }}
        />
      </label>
      <button className="danger-button" type="button" onClick={onDelete}>
        <Trash2 size={16} />
        删除墙体
      </button>
    </div>
  );
}

function OpeningEditor({
  opening,
  onChange,
  onDelete
}: {
  opening: Opening;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onDelete: () => void;
}) {
  return (
    <div className="property-stack">
      <h2>{opening.kind === 'door' ? '门' : '窗'}</h2>
      <label>
        <span>宽度（厘米）</span>
        <input
          type="number"
          min="40"
          step="5"
          value={opening.width}
          onChange={(event) => {
            const width = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              openings: current.openings.map((item) => (item.id === opening.id ? { ...item, width } : item))
            }));
          }}
        />
      </label>
      <label>
        <span>角度</span>
        <input
          type="number"
          step="1"
          value={Math.round(opening.rotation)}
          onChange={(event) => {
            const rotation = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              openings: current.openings.map((item) => (item.id === opening.id ? { ...item, rotation } : item))
            }));
          }}
        />
      </label>
      <button className="danger-button" type="button" onClick={onDelete}>
        <Trash2 size={16} />
        删除门窗
      </button>
    </div>
  );
}

function FurnitureEditor({
  furniture,
  onChange,
  onDelete
}: {
  furniture: FurnitureInstance;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onDelete: () => void;
}) {
  return (
    <div className="property-stack">
      <h2>{furniture.name}</h2>
      <label>
        <span>名称</span>
        <input
          value={furniture.name}
          onChange={(event) => {
            const name = event.target.value;
            onChange((current) => ({
              ...current,
              furniture: current.furniture.map((item) => (item.instanceId === furniture.instanceId ? { ...item, name } : item))
            }));
          }}
        />
      </label>
      <label>
        <span>宽度（厘米）</span>
        <input
          type="number"
          min="10"
          step="5"
          value={furniture.width}
          onChange={(event) => {
            const width = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              furniture: current.furniture.map((item) => (item.instanceId === furniture.instanceId ? { ...item, width } : item))
            }));
          }}
        />
      </label>
      <label>
        <span>深度（厘米）</span>
        <input
          type="number"
          min="10"
          step="5"
          value={furniture.depth}
          onChange={(event) => {
            const depth = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              furniture: current.furniture.map((item) => (item.instanceId === furniture.instanceId ? { ...item, depth } : item))
            }));
          }}
        />
      </label>
      <label>
        <span>旋转角度</span>
        <input
          type="number"
          step="15"
          value={Math.round(furniture.rotation)}
          onChange={(event) => {
            const rotation = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              furniture: current.furniture.map((item) =>
                item.instanceId === furniture.instanceId ? { ...item, rotation } : item
              )
            }));
          }}
        />
      </label>
      <button
        className="secondary-button"
        type="button"
        onClick={() => {
          onChange((current) => ({
            ...current,
            furniture: current.furniture.map((item) =>
              item.instanceId === furniture.instanceId ? { ...item, rotation: (item.rotation + 90) % 360 } : item
            )
          }));
        }}
      >
        <RotateCw size={16} />
        旋转 90°
      </button>
      <button className="danger-button" type="button" onClick={onDelete}>
        <Trash2 size={16} />
        删除家具
      </button>
    </div>
  );
}

function RoomEditor({
  room,
  onChange,
  onDelete
}: {
  room: RoomLabel;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onDelete: () => void;
}) {
  return (
    <div className="property-stack">
      <h2>房间标签</h2>
      <label>
        <span>名称</span>
        <input
          value={room.name}
          onChange={(event) => {
            const name = event.target.value;
            onChange((current) => ({
              ...current,
              rooms: current.rooms.map((item) => (item.id === room.id ? { ...item, name } : item))
            }));
          }}
        />
      </label>
      <label>
        <span>面积</span>
        <input
          value={room.area}
          onChange={(event) => {
            const area = event.target.value;
            onChange((current) => ({
              ...current,
              rooms: current.rooms.map((item) => (item.id === room.id ? { ...item, area } : item))
            }));
          }}
        />
      </label>
      <button className="danger-button" type="button" onClick={onDelete}>
        <Trash2 size={16} />
        删除标签
      </button>
    </div>
  );
}
