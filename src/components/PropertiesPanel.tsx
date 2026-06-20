import { Home, Image as ImageIcon, RotateCw, Ruler, Trash2, Wand2, X } from 'lucide-react';
import type {
  BackgroundImage,
  DesignDocument,
  FurnitureInstance,
  Opening,
  RecognitionSession,
  RenderSettings,
  RoomLabel,
  Selection,
  Wall
} from '../types';
import { pxToMeters, resizeWallByLength, wallLengthPx } from '../utils/geometry';

type PropertiesPanelProps = {
  design: DesignDocument;
  selection: Selection | null;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onDelete: () => void;
  onStartCalibration: () => void;
  onRecognizeFloorplan: () => void;
  onKeepBackgroundReference: () => void;
  onSelectAllRecognitionWalls: () => void;
  onClearRecognitionSelection: () => void;
  onDeleteSelectedRecognitionWalls: () => void;
  onRestoreDeletedRecognitionWalls: () => void;
  onMergeSelectedRecognitionWalls: () => void;
  onMergeAllRecognitionWalls: () => void;
  onPromoteSelectedRecognitionWalls: () => void;
  onPromoteAllRecognitionWalls: () => void;
  onDiscardRecognitionLayer: () => void;
  recognizingFloorplan: boolean;
  importWizardOpen: boolean;
  recognitionLayer: RecognitionSession | null;
};

const numberValue = (value: string) => Number.parseFloat(value) || 0;

const getRoomAreaTotal = (rooms: RoomLabel[]) =>
  rooms.reduce((total, room) => {
    const area = Number.parseFloat(room.area.replace(',', '.'));
    return Number.isFinite(area) ? total + area : total;
  }, 0);

export default function PropertiesPanel({
  design,
  selection,
  onChange,
  onDelete,
  onStartCalibration,
  onRecognizeFloorplan,
  onKeepBackgroundReference,
  onSelectAllRecognitionWalls,
  onClearRecognitionSelection,
  onDeleteSelectedRecognitionWalls,
  onRestoreDeletedRecognitionWalls,
  onMergeSelectedRecognitionWalls,
  onMergeAllRecognitionWalls,
  onPromoteSelectedRecognitionWalls,
  onPromoteAllRecognitionWalls,
  onDiscardRecognitionLayer,
  recognizingFloorplan,
  importWizardOpen,
  recognitionLayer
}: PropertiesPanelProps) {
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

      <ProjectInfoEditor design={design} onChange={onChange} />
      <RenderSettingsEditor design={design} onChange={onChange} />

      {design.backgroundImage && importWizardOpen && (
        <ImportWizardCard
          recognizingFloorplan={recognizingFloorplan}
          onRecognizeFloorplan={onRecognizeFloorplan}
          onKeepBackgroundReference={onKeepBackgroundReference}
        />
      )}

      {recognitionLayer && (
        <RecognitionLayerEditor
          recognitionLayer={recognitionLayer}
          recognizingFloorplan={recognizingFloorplan}
          onChange={onChange}
          onSelectAll={onSelectAllRecognitionWalls}
          onClearSelection={onClearRecognitionSelection}
          onDeleteSelected={onDeleteSelectedRecognitionWalls}
          onRestoreDeleted={onRestoreDeletedRecognitionWalls}
          onMergeSelected={onMergeSelectedRecognitionWalls}
          onMergeAll={onMergeAllRecognitionWalls}
          onPromoteSelected={onPromoteSelectedRecognitionWalls}
          onPromoteAll={onPromoteAllRecognitionWalls}
          onDiscard={onDiscardRecognitionLayer}
          onRecognizeAgain={onRecognizeFloorplan}
        />
      )}

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
        <BackgroundImageEditor
          backgroundImage={design.backgroundImage}
          onChange={onChange}
          onStartCalibration={onStartCalibration}
          onRecognizeFloorplan={onRecognizeFloorplan}
          recognizingFloorplan={recognizingFloorplan}
        />
      )}
    </aside>
  );
}

function ImportWizardCard({
  recognizingFloorplan,
  onRecognizeFloorplan,
  onKeepBackgroundReference
}: {
  recognizingFloorplan: boolean;
  onRecognizeFloorplan: () => void;
  onKeepBackgroundReference: () => void;
}) {
  return (
    <div className="property-stack import-wizard-stack">
      <h2>
        <Wand2 size={16} />
        导入向导
      </h2>
      <button className="primary-button" type="button" onClick={onRecognizeFloorplan} disabled={recognizingFloorplan}>
        <Wand2 size={16} />
        {recognizingFloorplan ? '正在识别' : '识别到图层'}
      </button>
      <button className="secondary-button" type="button" onClick={onKeepBackgroundReference}>
        <ImageIcon size={16} />
        叠加参考
      </button>
    </div>
  );
}

function RecognitionLayerEditor({
  recognitionLayer,
  recognizingFloorplan,
  onChange,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
  onRestoreDeleted,
  onMergeSelected,
  onMergeAll,
  onPromoteSelected,
  onPromoteAll,
  onDiscard,
  onRecognizeAgain
}: {
  recognitionLayer: RecognitionSession;
  recognizingFloorplan: boolean;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onRestoreDeleted: () => void;
  onMergeSelected: () => void;
  onMergeAll: () => void;
  onPromoteSelected: () => void;
  onPromoteAll: () => void;
  onDiscard: () => void;
  onRecognizeAgain: () => void;
}) {
  const activeCount = recognitionLayer.walls.filter((wall) => wall.status === 'active').length;
  const deletedCount = recognitionLayer.walls.filter((wall) => wall.status === 'deleted').length;
  const promotedCount = recognitionLayer.walls.filter((wall) => wall.status === 'promoted').length;
  const selectedCount = recognitionLayer.selectedWallIds.length;

  return (
    <div className="property-stack recognition-stack">
      <h2>
        <Wand2 size={16} />
        识别图层
      </h2>
      <div className="recognition-summary">
        <span>候选 {activeCount} 面 / 已选 {selectedCount} 面</span>
        <span>已写入 {promotedCount} 面 / 已删除 {deletedCount} 面</span>
        <span>置信度：{recognitionLayer.confidence}</span>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={recognitionLayer.visible}
          onChange={(event) => {
            const visible = event.target.checked;
            onChange((current) => ({
              ...current,
              recognition: current.recognition ? { ...current.recognition, visible } : current.recognition
            }));
          }}
        />
        <span>显示识别层</span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={recognitionLayer.locked}
          onChange={(event) => {
            const locked = event.target.checked;
            onChange((current) => ({
              ...current,
              recognition: current.recognition ? { ...current.recognition, locked } : current.recognition
            }));
          }}
        />
        <span>锁定识别层</span>
      </label>
      <label>
        <span>识别层透明度</span>
        <input
          type="range"
          min="0.2"
          max="1"
          step="0.05"
          value={recognitionLayer.opacity}
          onChange={(event) => {
            const opacity = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              recognition: current.recognition ? { ...current.recognition, opacity } : current.recognition
            }));
          }}
        />
      </label>
      <div className="property-button-row">
        <button className="secondary-button" type="button" onClick={onSelectAll} disabled={activeCount === 0}>
          全选
        </button>
        <button className="secondary-button" type="button" onClick={onClearSelection} disabled={selectedCount === 0}>
          清空选择
        </button>
      </div>
      <div className="property-button-row">
        <button className="secondary-button" type="button" onClick={onDeleteSelected} disabled={selectedCount === 0}>
          删除选中
        </button>
        <button className="secondary-button" type="button" onClick={onRestoreDeleted} disabled={deletedCount === 0}>
          恢复删除
        </button>
      </div>
      <div className="property-button-row">
        <button className="secondary-button" type="button" onClick={onMergeSelected} disabled={selectedCount < 2}>
          合并选中
        </button>
        <button className="secondary-button" type="button" onClick={onMergeAll} disabled={activeCount < 2}>
          合并全部
        </button>
      </div>
      <div className="property-button-row">
        <button className="primary-button" type="button" onClick={onPromoteSelected} disabled={selectedCount === 0}>
          写入选中
        </button>
        <button className="primary-button" type="button" onClick={onPromoteAll} disabled={activeCount === 0}>
          写入全部
        </button>
      </div>
      <button className="secondary-button" type="button" onClick={onRecognizeAgain} disabled={recognizingFloorplan}>
        <Wand2 size={16} />
        {recognizingFloorplan ? '正在识别' : '重新识别'}
      </button>
      <button className="danger-button" type="button" onClick={onDiscard}>
        <X size={16} />
        放弃识别层
      </button>
    </div>
  );
}

function ProjectInfoEditor({
  design,
  onChange
}: {
  design: DesignDocument;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
}) {
  const roomAreaTotal = getRoomAreaTotal(design.rooms);

  return (
    <div className="property-stack project-info-stack">
      <h2>
        <Home size={16} />
        方案信息
      </h2>
      <label>
        <span>房屋总面积（㎡）</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={design.homeAreaSqm ?? ''}
          onChange={(event) => {
            const rawValue = event.target.value.trim();
            const homeAreaSqm = rawValue ? numberValue(rawValue) : undefined;

            onChange((current) => ({
              ...current,
              homeAreaSqm
            }));
          }}
          placeholder="例如 89.5"
        />
      </label>
      <div className="area-reference">房间标注合计：{roomAreaTotal.toFixed(1)}㎡</div>
    </div>
  );
}

const materialModes: Array<{ value: RenderSettings['materialMode']; label: string }> = [
  { value: 'clean', label: '清爽' },
  { value: 'warm', label: '暖色' },
  { value: 'contrast', label: '对比' }
];

const lightModes: Array<{ value: RenderSettings['lightMode']; label: string }> = [
  { value: 'daylight', label: '日光' },
  { value: 'warm', label: '暖光' },
  { value: 'studio', label: '影棚' }
];

const cameraPresets: Array<{ value: RenderSettings['cameraPreset']; label: string }> = [
  { value: 'overview', label: '俯视' },
  { value: 'corner', label: '斜角' },
  { value: 'front', label: '正面' }
];

function RenderSettingsEditor({
  design,
  onChange
}: {
  design: DesignDocument;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
}) {
  const settings = design.renderSettings;

  if (!settings) {
    return null;
  }

  return (
    <div className="property-stack render-settings-stack">
      <h2>3D 效果图</h2>
      <label>
        <span>视角</span>
        <select
          value={settings.cameraPreset}
          onChange={(event) => {
            const cameraPreset = event.target.value as RenderSettings['cameraPreset'];
            onChange((current) => ({
              ...current,
              renderSettings: current.renderSettings ? { ...current.renderSettings, cameraPreset } : current.renderSettings
            }));
          }}
        >
          {cameraPresets.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>灯光</span>
        <select
          value={settings.lightMode}
          onChange={(event) => {
            const lightMode = event.target.value as RenderSettings['lightMode'];
            onChange((current) => ({
              ...current,
              renderSettings: current.renderSettings ? { ...current.renderSettings, lightMode } : current.renderSettings
            }));
          }}
        >
          {lightModes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>材质模式</span>
        <select
          value={settings.materialMode}
          onChange={(event) => {
            const materialMode = event.target.value as RenderSettings['materialMode'];
            onChange((current) => ({
              ...current,
              renderSettings: current.renderSettings ? { ...current.renderSettings, materialMode } : current.renderSettings
            }));
          }}
        >
          {materialModes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div className="material-color-row">
        <label>
          <span>墙面</span>
          <input
            type="color"
            value={settings.wallMaterial}
            onChange={(event) => {
              const wallMaterial = event.target.value;
              onChange((current) => ({
                ...current,
                renderSettings: current.renderSettings ? { ...current.renderSettings, wallMaterial } : current.renderSettings
              }));
            }}
          />
        </label>
        <label>
          <span>地面</span>
          <input
            type="color"
            value={settings.floorMaterial}
            onChange={(event) => {
              const floorMaterial = event.target.value;
              onChange((current) => ({
                ...current,
                renderSettings: current.renderSettings ? { ...current.renderSettings, floorMaterial } : current.renderSettings
              }));
            }}
          />
        </label>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.showBackgroundIn3D}
          onChange={(event) => {
            const showBackgroundIn3D = event.target.checked;
            onChange((current) => ({
              ...current,
              renderSettings: current.renderSettings
                ? { ...current.renderSettings, showBackgroundIn3D }
                : current.renderSettings
            }));
          }}
        />
        <span>3D 显示底图</span>
      </label>
      <button
        className="secondary-button ai-draft-button"
        type="button"
        onClick={() => {
          onChange((current) => {
            const inputSnapshot: DesignDocument = {
              ...current,
              cloudTasks: []
            };

            return {
              ...current,
              cloudTasks: [
                {
                  id: `ai-render-${Date.now().toString(36)}`,
                  kind: 'ai-render',
                  status: 'draft',
                  createdAt: new Date().toISOString(),
                  inputDesignId: current.id,
                  inputSnapshot,
                  note: '本地 AI 渲染任务草稿，暂未提交云端服务'
                },
                ...(current.cloudTasks ?? [])
              ]
            };
          });
        }}
      >
        <Wand2 size={16} />
        保存 AI 渲染草稿
      </button>
      <div className="area-reference">草稿任务：{design.cloudTasks?.length ?? 0}</div>
    </div>
  );
}

function BackgroundImageEditor({
  backgroundImage,
  onChange,
  onStartCalibration,
  onRecognizeFloorplan,
  recognizingFloorplan
}: {
  backgroundImage: BackgroundImage;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onStartCalibration: () => void;
  onRecognizeFloorplan: () => void;
  recognizingFloorplan: boolean;
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
      <button className="secondary-button" type="button" onClick={onRecognizeFloorplan} disabled={recognizingFloorplan}>
        <Wand2 size={16} />
        {recognizingFloorplan ? '正在识别' : '识别到图层'}
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
        <span>高度（米）</span>
        <input
          type="number"
          min="0.05"
          step="0.05"
          value={furniture.height ?? 0}
          onChange={(event) => {
            const height = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              furniture: current.furniture.map((item) => (item.instanceId === furniture.instanceId ? { ...item, height } : item))
            }));
          }}
        />
      </label>
      <label>
        <span>材质</span>
        <select
          value={furniture.material ?? '木饰面'}
          onChange={(event) => {
            const material = event.target.value;
            onChange((current) => ({
              ...current,
              furniture: current.furniture.map((item) => (item.instanceId === furniture.instanceId ? { ...item, material } : item))
            }));
          }}
        >
          <option value="木饰面">木饰面</option>
          <option value="布艺">布艺</option>
          <option value="金属">金属</option>
          <option value="陶瓷">陶瓷</option>
          <option value="玻璃">玻璃</option>
        </select>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={Boolean(furniture.favorite)}
          onChange={(event) => {
            const favorite = event.target.checked;
            onChange((current) => ({
              ...current,
              favoriteFurnitureIds: favorite
                ? Array.from(new Set([...(current.favoriteFurnitureIds ?? []), furniture.id]))
                : (current.favoriteFurnitureIds ?? []).filter((id) => id !== furniture.id),
              furniture: current.furniture.map((item) => (item.instanceId === furniture.instanceId ? { ...item, favorite } : item))
            }));
          }}
        />
        <span>收藏到家具库</span>
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
