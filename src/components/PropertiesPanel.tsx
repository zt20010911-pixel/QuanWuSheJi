import { ClipboardList, FileSpreadsheet, FileText, Home, Image as ImageIcon, Plus, RotateCw, Ruler, Trash2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  BackgroundImage,
  MaterialCategory,
  DesignDocument,
  FeatureModuleKey,
  FeatureModuleStatus,
  FurnitureInstance,
  Opening,
  RecognitionMode,
  RecognitionSession,
  RenderSettings,
  RoomLabel,
  RoomZone,
  Selection,
  Wall,
  WallDrawMode
} from '../types';
import { DEFAULT_ROOM_ZONE_MATERIAL_IDS, MATERIAL_LIBRARY } from '../data/materials';
import { ROADMAP_MODULES } from '../data/roadmap';
import { createId, pxToMeters, resizeWallByLength, wallLengthPx } from '../utils/geometry';
import { createEstimateItems, formatCurrency, getEstimateTotal, getRoomZoneAreaSqm } from '../utils/roomMetrics';

type PropertiesPanelProps = {
  design: DesignDocument;
  selection: Selection | null;
  wallDrawMode: WallDrawMode;
  showWallLengths: boolean;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onDelete: () => void;
  onWallDrawModeChange: (mode: WallDrawMode) => void;
  onToggleWallLengths: () => void;
  onExportJson: () => void;
  onExportEstimateCsv: () => void;
  onExportHtmlReport: () => void;
  onStartCalibration: () => void;
  onRecognizeFloorplan: () => void;
  recognitionMode: RecognitionMode;
  onRecognitionModeChange: (mode: RecognitionMode) => void;
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

type PropertiesPanelTab = 'common' | 'recognition' | 'object' | 'delivery';

const getPreferredTab = (
  selection: Selection | null,
  recognitionLayer: RecognitionSession | null,
  importWizardOpen: boolean
): PropertiesPanelTab => {
  if (importWizardOpen || selection?.type === 'recognitionWall') {
    return 'recognition';
  }

  if (selection) {
    return 'object';
  }

  if (recognitionLayer) {
    return 'recognition';
  }

  return 'common';
};

export default function PropertiesPanel({
  design,
  selection,
  wallDrawMode,
  showWallLengths,
  onChange,
  onDelete,
  onWallDrawModeChange,
  onToggleWallLengths,
  onExportJson,
  onExportEstimateCsv,
  onExportHtmlReport,
  onStartCalibration,
  onRecognizeFloorplan,
  recognitionMode,
  onRecognitionModeChange,
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
  const selectedRoomZone = selection?.type === 'roomZone' ? (design.roomZones ?? []).find((item) => item.id === selection.id) : undefined;
  const preferredTab = useMemo(
    () => getPreferredTab(selection, recognitionLayer, importWizardOpen),
    [selection, recognitionLayer, importWizardOpen]
  );
  const [activeTab, setActiveTab] = useState<PropertiesPanelTab>(preferredTab);

  useEffect(() => {
    setActiveTab(preferredTab);
  }, [preferredTab]);

  return (
    <aside className="properties-panel">
      <div className="section-title">
        <RotateCw size={16} />
        <span>属性</span>
      </div>

      <div className="properties-tabs" role="tablist" aria-label="属性面板分组">
        {[
          { key: 'common', label: '常用' },
          { key: 'recognition', label: '识别' },
          { key: 'object', label: '属性' },
          { key: 'delivery', label: '交付' }
        ].map((tab) => (
          <button
            className={activeTab === tab.key ? 'is-active' : ''}
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as PropertiesPanelTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="properties-tab-content">
        {activeTab === 'common' && (
          <>
            <ProjectInfoEditor design={design} onChange={onChange} />
            <EditingStateCard
              design={design}
              selectedWall={selectedWall}
              wallDrawMode={wallDrawMode}
              showWallLengths={showWallLengths}
              onWallDrawModeChange={onWallDrawModeChange}
              onToggleWallLengths={onToggleWallLengths}
            />
            <CurrentPlanSummary design={design} />
          </>
        )}

        {activeTab === 'recognition' && (
          <>
            <RecognitionModeCard
              recognitionMode={recognitionMode}
              recognizingFloorplan={recognizingFloorplan}
              hasBackgroundImage={Boolean(design.backgroundImage)}
              onRecognitionModeChange={onRecognitionModeChange}
              onRecognizeFloorplan={onRecognizeFloorplan}
            />
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
            {design.backgroundImage ? (
              <BackgroundImageEditor
                backgroundImage={design.backgroundImage}
                onChange={onChange}
                onStartCalibration={onStartCalibration}
                onRecognizeFloorplan={onRecognizeFloorplan}
                recognizingFloorplan={recognizingFloorplan}
              />
            ) : (
              <div className="empty-properties">
                <strong>还没有户型底图</strong>
                <span>请在左侧上传户型图后再识别。</span>
              </div>
            )}
          </>
        )}

        {activeTab === 'object' && (
          <>
            {!selection && (
              <div className="empty-properties">
                <strong>未选中对象</strong>
                <span>点击墙体、家具、门窗或房间区域后，这里会显示可编辑属性。</span>
              </div>
            )}
            {selectedWall && <WallEditor design={design} wall={selectedWall} onChange={onChange} onDelete={onDelete} />}
            {selectedOpening && <OpeningEditor opening={selectedOpening} onChange={onChange} onDelete={onDelete} />}
            {selectedFurniture && <FurnitureEditor furniture={selectedFurniture} onChange={onChange} onDelete={onDelete} />}
            {selectedRoom && <RoomEditor room={selectedRoom} onChange={onChange} onDelete={onDelete} />}
            {selectedRoomZone && (
              <RoomZoneEditor zone={selectedRoomZone} design={design} onChange={onChange} onDelete={onDelete} />
            )}
          </>
        )}

        {activeTab === 'delivery' && (
          <>
            <DeliverySummaryCard
              design={design}
              onExportJson={onExportJson}
              onExportEstimateCsv={onExportEstimateCsv}
              onExportHtmlReport={onExportHtmlReport}
            />
            <EstimatePanel
              design={design}
              onChange={onChange}
              onExportEstimateCsv={onExportEstimateCsv}
              onExportHtmlReport={onExportHtmlReport}
            />
            <RenderSettingsEditor design={design} onChange={onChange} />
            <FeatureCenterPanel design={design} collapsed />
          </>
        )}
      </div>
    </aside>
  );
}

function CurrentPlanSummary({ design }: { design: DesignDocument }) {
  return (
    <div className="empty-properties">
      <strong>{design.name}</strong>
      <span>{design.walls.length} 面正式墙体</span>
      <span>{design.openings.length} 个门窗</span>
      <span>{design.furniture.length} 件家具</span>
      <span>{design.recognition?.walls.filter((wall) => wall.status === 'active').length ?? 0} 面识别候选墙</span>
    </div>
  );
}

function RecognitionModeCard({
  recognitionMode,
  recognizingFloorplan,
  hasBackgroundImage,
  onRecognitionModeChange,
  onRecognizeFloorplan
}: {
  recognitionMode: RecognitionMode;
  recognizingFloorplan: boolean;
  hasBackgroundImage: boolean;
  onRecognitionModeChange: (mode: RecognitionMode) => void;
  onRecognizeFloorplan: () => void;
}) {
  return (
    <div className="property-stack recognition-mode-stack">
      <h2>
        <Wand2 size={16} />
        识别模式
      </h2>
      <div className="draw-mode-toggle" aria-label="户型识别模式">
        <button
          className={recognitionMode === 'complete' ? 'is-active' : ''}
          type="button"
          onClick={() => onRecognitionModeChange('complete')}
        >
          完整
        </button>
        <button
          className={recognitionMode === 'precise' ? 'is-active' : ''}
          type="button"
          onClick={() => onRecognitionModeChange('precise')}
        >
          精准
        </button>
      </div>
      <div className="editing-hint">
        完整模式优先补全外墙、阳台和断开的墙段；精准模式更克制，适合家具线条很多的图。
      </div>
      <button className="primary-button" type="button" onClick={onRecognizeFloorplan} disabled={!hasBackgroundImage || recognizingFloorplan}>
        <Wand2 size={16} />
        {recognizingFloorplan ? '正在识别' : '按当前模式重新识别'}
      </button>
    </div>
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
  const inferredCount = recognitionLayer.walls.filter((wall) => wall.source === 'inferred').length;
  const modeLabel = recognitionLayer.parameters.mode === 'complete' ? '完整模式' : '精准模式';

  return (
    <div className="property-stack recognition-stack">
      <h2>
        <Wand2 size={16} />
        识别图层
      </h2>
      <div className="recognition-summary">
        <span>{modeLabel} · 原始 {recognitionLayer.parameters.rawWallCount} 条 / 候选 {recognitionLayer.parameters.candidateWallCount} 条</span>
        <span>候选 {activeCount} 面 / 已选 {selectedCount} 面</span>
        <span>已写入 {promotedCount} 面 / 已删除 {deletedCount} 面</span>
        <span>补全 {recognitionLayer.parameters.inferredWallCount || inferredCount} 面 / 置信度：{recognitionLayer.confidence}</span>
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
  const roomZoneAreaTotal = (design.roomZones ?? []).reduce(
    (total, zone) => total + (zone.manualAreaSqm ?? getRoomZoneAreaSqm(zone, design.canvas.scalePxPerMeter)),
    0
  );

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
      <div className="area-reference">房间标签合计：{roomAreaTotal.toFixed(1)}㎡ · 房间区域合计：{roomZoneAreaTotal.toFixed(1)}㎡</div>
      <button
        className="secondary-button"
        type="button"
        onClick={() => {
          onChange((current) => {
            const id = createId('room');
            const roomIndex = current.rooms.length + 1;

            return {
              ...current,
              rooms: [
                ...current.rooms,
                {
                  id,
                  name: `房间${roomIndex}`,
                  x: current.canvas.width / 2,
                  y: current.canvas.height / 2,
                  area: '0㎡'
                }
              ]
            };
          });
        }}
      >
        <Plus size={16} />
        新增房间标签
      </button>
    </div>
  );
}


function EditingStateCard({
  design,
  selectedWall,
  wallDrawMode,
  showWallLengths,
  onWallDrawModeChange,
  onToggleWallLengths
}: {
  design: DesignDocument;
  selectedWall?: Wall;
  wallDrawMode: WallDrawMode;
  showWallLengths: boolean;
  onWallDrawModeChange: (mode: WallDrawMode) => void;
  onToggleWallLengths: () => void;
}) {
  const selectedWallLength = selectedWall ? pxToMeters(wallLengthPx(selectedWall), design.canvas.scalePxPerMeter) : null;

  return (
    <div className="property-stack editing-state-stack">
      <h2>
        <Ruler size={16} />
        编辑状态
      </h2>
      <div className="draw-mode-toggle" aria-label="右侧墙体绘制模式">
        <button
          className={wallDrawMode === 'single' ? 'is-active' : ''}
          type="button"
          onClick={() => onWallDrawModeChange('single')}
        >
          单段
        </button>
        <button
          className={wallDrawMode === 'continuous' ? 'is-active' : ''}
          type="button"
          onClick={() => onWallDrawModeChange('continuous')}
        >
          连续
        </button>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={showWallLengths} onChange={onToggleWallLengths} />
        <span>显示全部墙体长度</span>
      </label>
      <div className="editing-hint">Esc 取消当前起点，Enter 结束连续绘制。</div>
      <div className="area-reference">
        {selectedWallLength === null ? '未选中墙体' : `选中墙长：${selectedWallLength.toFixed(2)}m`}
      </div>
    </div>
  );
}

function DeliverySummaryCard({
  design,
  onExportJson,
  onExportEstimateCsv,
  onExportHtmlReport
}: {
  design: DesignDocument;
  onExportJson: () => void;
  onExportEstimateCsv: () => void;
  onExportHtmlReport: () => void;
}) {
  const roomAreaTotal = getRoomAreaTotal(design.rooms);
  const roomZoneAreaTotal = (design.roomZones ?? []).reduce(
    (total, zone) => total + (zone.manualAreaSqm ?? getRoomZoneAreaSqm(zone, design.canvas.scalePxPerMeter)),
    0
  );
  const estimateItems = createEstimateItems(design);
  const estimateTotal = getEstimateTotal(estimateItems);
  const doorCount = design.openings.filter((opening) => opening.kind === 'door').length;
  const windowCount = design.openings.filter((opening) => opening.kind === 'window').length;
  const activeRecognitionCount = design.recognition?.walls.filter((wall) => wall.status === 'active').length ?? 0;

  return (
    <div className="property-stack delivery-stack">
      <h2>
        <ClipboardList size={16} />
        项目交付
      </h2>
      <div className="delivery-grid">
        <span>正式墙体</span>
        <strong>{design.walls.length} 面</strong>
        <span>门窗</span>
        <strong>{doorCount} 门 / {windowCount} 窗</strong>
        <span>家具</span>
        <strong>{design.furniture.length} 件</strong>
        <span>房屋总面积</span>
        <strong>{design.homeAreaSqm ? `${design.homeAreaSqm.toFixed(1)}㎡` : '未填写'}</strong>
        <span>标签面积合计</span>
        <strong>{roomAreaTotal.toFixed(1)}㎡</strong>
        <span>房间区域</span>
        <strong>{(design.roomZones ?? []).length} 个 / {roomZoneAreaTotal.toFixed(1)}㎡</strong>
        <span>预算合计</span>
        <strong>{formatCurrency(estimateTotal)}</strong>
        <span>识别候选墙</span>
        <strong>{activeRecognitionCount} 面</strong>
      </div>
      <div className="inline-actions">
        <button className="secondary-button" type="button" onClick={onExportJson}>
          导出 JSON
        </button>
        <button className="secondary-button" type="button" onClick={onExportEstimateCsv}>
          <FileSpreadsheet size={16} />
          预算 CSV
        </button>
        <button className="secondary-button" type="button" onClick={onExportHtmlReport}>
          <FileText size={16} />
          HTML 报告
        </button>
      </div>
    </div>
  );
}

const roadmapStatusLabels = {
  available: '已可用',
  beta: '测试中',
  planned: '计划中',
  'external-required': '需外部服务'
};

function FeatureCenterPanel({ design, collapsed = false }: { design: DesignDocument; collapsed?: boolean }) {
  const features: Partial<Record<FeatureModuleKey, FeatureModuleStatus>> = design.features ?? {};

  return (
    <details className="property-stack feature-center-stack" open={!collapsed}>
      <summary>
        <ClipboardList size={16} />
        功能中心
      </summary>
      <div className="roadmap-grid">
        {ROADMAP_MODULES.map((module) => {
          const status = features[module.key] ?? module.status;

          return (
            <div className={`roadmap-item status-${status}`} key={module.key}>
              <strong>{module.title}</strong>
              <span>{roadmapStatusLabels[status]}</span>
              <small>{module.description}</small>
            </div>
          );
        })}
      </div>
    </details>
  );
}

const getMaterialsByCategory = (category: MaterialCategory) =>
  MATERIAL_LIBRARY.filter((material) => material.category === category);

function EstimatePanel({
  design,
  onChange,
  onExportEstimateCsv,
  onExportHtmlReport
}: {
  design: DesignDocument;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onExportEstimateCsv: () => void;
  onExportHtmlReport: () => void;
}) {
  const settings = design.estimateSettings;
  const items = createEstimateItems(design);
  const total = getEstimateTotal(items);
  const previewItems = items.slice(0, 6);

  if (!settings) {
    return null;
  }

  return (
    <div className="property-stack estimate-stack">
      <h2>
        <ClipboardList size={16} />
        材料预算
      </h2>
      <div className="estimate-total">
        <span>本地估算合计</span>
        <strong>{formatCurrency(total)}</strong>
      </div>
      <label>
        <span>墙面高度（米）</span>
        <input
          type="number"
          min="2"
          step="0.1"
          value={settings.wallHeightMeters}
          onChange={(event) => {
            const wallHeightMeters = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              estimateSettings: {
                ...(current.estimateSettings ?? settings),
                wallHeightMeters
              }
            }));
          }}
        />
      </label>
      <label>
        <span>损耗率</span>
        <input
          type="number"
          min="0"
          max="0.5"
          step="0.01"
          value={settings.wasteRate}
          onChange={(event) => {
            const wasteRate = numberValue(event.target.value);
            onChange((current) => ({
              ...current,
              estimateSettings: {
                ...(current.estimateSettings ?? settings),
                wasteRate
              }
            }));
          }}
        />
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.includeWaste}
          onChange={(event) => {
            const includeWaste = event.target.checked;
            onChange((current) => ({
              ...current,
              estimateSettings: {
                ...(current.estimateSettings ?? settings),
                includeWaste
              }
            }));
          }}
        />
        <span>预算计入损耗</span>
      </label>
      <div className="material-price-list">
        {MATERIAL_LIBRARY.map((material) => (
          <label key={material.id}>
            <span>{material.name}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={settings.materialOverrides[material.id] ?? material.unitPrice}
              onChange={(event) => {
                const price = numberValue(event.target.value);
                onChange((current) => {
                  const currentSettings = current.estimateSettings ?? settings;

                  return {
                    ...current,
                    estimateSettings: {
                      ...currentSettings,
                      materialOverrides: {
                        ...currentSettings.materialOverrides,
                        [material.id]: price
                      }
                    }
                  };
                });
              }}
            />
          </label>
        ))}
      </div>
      <div className="estimate-table">
        {previewItems.length === 0 ? (
          <span className="muted-line">绘制房间区域后自动生成材料估算。</span>
        ) : (
          previewItems.map((item) => (
            <div key={item.id}>
              <span>{item.roomName} · {item.name}</span>
              <strong>{formatCurrency(item.total)}</strong>
            </div>
          ))
        )}
      </div>
      <div className="inline-actions">
        <button className="secondary-button" type="button" onClick={onExportEstimateCsv}>
          <FileSpreadsheet size={16} />
          导出 CSV
        </button>
        <button className="secondary-button" type="button" onClick={onExportHtmlReport}>
          <FileText size={16} />
          导出报告
        </button>
      </div>
    </div>
  );
}

function RoomZoneEditor({
  zone,
  design,
  onChange,
  onDelete
}: {
  zone: RoomZone;
  design: DesignDocument;
  onChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onDelete: () => void;
}) {
  const autoArea = getRoomZoneAreaSqm(zone, design.canvas.scalePxPerMeter);
  const materialIds = { ...DEFAULT_ROOM_ZONE_MATERIAL_IDS, ...zone.materialIds };
  const updateZone = (patch: Partial<RoomZone>) => {
    onChange((current) => ({
      ...current,
      roomZones: (current.roomZones ?? []).map((item) => (item.id === zone.id ? { ...item, ...patch } : item))
    }));
  };
  const updateMaterial = (category: keyof RoomZone['materialIds'], materialId: string) => {
    updateZone({
      materialIds: {
        ...materialIds,
        [category]: materialId
      }
    });
  };

  return (
    <div className="property-stack room-zone-stack">
      <h2>房间区域</h2>
      <label>
        <span>名称</span>
        <input value={zone.name} onChange={(event) => updateZone({ name: event.target.value })} />
      </label>
      <div className="area-reference">自动面积：{autoArea.toFixed(2)}㎡</div>
      <label>
        <span>手动面积覆盖（㎡）</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={zone.manualAreaSqm ?? ''}
          placeholder={autoArea.toFixed(1)}
          onChange={(event) => {
            const rawValue = event.target.value.trim();
            updateZone({ manualAreaSqm: rawValue ? numberValue(rawValue) : undefined });
          }}
        />
      </label>
      <label>
        <span>地面材料</span>
        <select value={materialIds.floor} onChange={(event) => updateMaterial('floor', event.target.value)}>
          {getMaterialsByCategory('floor').map((material) => (
            <option value={material.id} key={material.id}>{material.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>墙面材料</span>
        <select value={materialIds.wall} onChange={(event) => updateMaterial('wall', event.target.value)}>
          {getMaterialsByCategory('wall').map((material) => (
            <option value={material.id} key={material.id}>{material.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>顶面材料</span>
        <select value={materialIds.ceiling} onChange={(event) => updateMaterial('ceiling', event.target.value)}>
          {getMaterialsByCategory('ceiling').map((material) => (
            <option value={material.id} key={material.id}>{material.name}</option>
          ))}
        </select>
      </label>
      <button className="danger-button" type="button" onClick={onDelete}>
        <Trash2 size={16} />
        删除房间区域
      </button>
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

const environmentModes: Array<{ value: RenderSettings['environmentMode']; label: string }> = [
  { value: 'daylight', label: '日间背景' },
  { value: 'studio', label: '影棚背景' },
  { value: 'evening', label: '傍晚背景' }
];

const cameraPresets: Array<{ value: RenderSettings['cameraPreset']; label: string }> = [
  { value: 'overview', label: '俯斜总览' },
  { value: 'corner', label: '斜角效果' },
  { value: 'front', label: '正面展示' },
  { value: 'top', label: '顶视平面' },
  { value: 'walkthrough', label: '漫游视角' }
];

const exportPixelRatios: Array<{ value: RenderSettings['exportPixelRatio']; label: string }> = [
  { value: 1, label: '1x 快速' },
  { value: 2, label: '2x 高清' },
  { value: 3, label: '3x 超清' }
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

  const updateRenderSettings = (patch: Partial<RenderSettings>) => {
    onChange((current) => ({
      ...current,
      renderSettings: current.renderSettings ? { ...current.renderSettings, ...patch } : current.renderSettings
    }));
  };

  return (
    <div className="property-stack render-settings-stack">
      <h2>3D 效果图</h2>
      <label>
        <span>相机视角</span>
        <select
          value={settings.cameraPreset}
          onChange={(event) => updateRenderSettings({ cameraPreset: event.target.value as RenderSettings['cameraPreset'] })}
        >
          {cameraPresets.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>环境背景</span>
        <select
          value={settings.environmentMode}
          onChange={(event) => updateRenderSettings({ environmentMode: event.target.value as RenderSettings['environmentMode'] })}
        >
          {environmentModes.map((item) => (
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
          onChange={(event) => updateRenderSettings({ lightMode: event.target.value as RenderSettings['lightMode'] })}
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
          onChange={(event) => updateRenderSettings({ materialMode: event.target.value as RenderSettings['materialMode'] })}
        >
          {materialModes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>导出倍率</span>
        <select
          value={settings.exportPixelRatio}
          onChange={(event) => updateRenderSettings({ exportPixelRatio: Number(event.target.value) as RenderSettings['exportPixelRatio'] })}
        >
          {exportPixelRatios.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div className="material-color-row">
        <label>
          <span>墙面</span>
          <input type="color" value={settings.wallMaterial} onChange={(event) => updateRenderSettings({ wallMaterial: event.target.value })} />
        </label>
        <label>
          <span>地面</span>
          <input type="color" value={settings.floorMaterial} onChange={(event) => updateRenderSettings({ floorMaterial: event.target.value })} />
        </label>
      </div>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.showRoomMaterialsIn3D}
          onChange={(event) => updateRenderSettings({ showRoomMaterialsIn3D: event.target.checked })}
        />
        <span>按房间显示地面材料</span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.showCeilingHint}
          onChange={(event) => updateRenderSettings({ showCeilingHint: event.target.checked })}
        />
        <span>显示半透明顶面提示</span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={settings.showBackgroundIn3D}
          onChange={(event) => updateRenderSettings({ showBackgroundIn3D: event.target.checked })}
        />
        <span>3D 显示底图参考</span>
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
                  note: '本地 AI 渲染任务草稿，暂未提交云端服务。'
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
