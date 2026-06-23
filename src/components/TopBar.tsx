import {
  Box,
  Download,
  FilePlus2,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Grid2X2,
  Image,
  ImageDown,
  LocateFixed,
  Map,
  Maximize2,
  Redo2,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { DesignDocument, ViewMode } from '../types';

type TopBarProps = {
  design: DesignDocument;
  savedDesigns: DesignDocument[];
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  viewMode: ViewMode;
  showGrid: boolean;
  hasBackground: boolean;
  backgroundVisible: boolean;
  onRename: (name: string) => void;
  onNew: () => void;
  onSave: () => void;
  onOpen: (id: string) => void;
  onExportPng: () => void;
  onExportJson: () => void;
  onExportEstimateCsv: () => void;
  onExportHtmlReport: () => void;
  onExport3DPng: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onFitView: () => void;
  onCenterView: () => void;
  onToggleGrid: () => void;
  onToggleBackground: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));

export default function TopBar({
  design,
  savedDesigns,
  canUndo,
  canRedo,
  zoom,
  viewMode,
  showGrid,
  hasBackground,
  backgroundVisible,
  onRename,
  onNew,
  onSave,
  onOpen,
  onExportPng,
  onExportJson,
  onExportEstimateCsv,
  onExportHtmlReport,
  onExport3DPng,
  onViewModeChange,
  onFitView,
  onCenterView,
  onToggleGrid,
  onToggleBackground,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut
}: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-title">全屋设计</div>
        <input
          className="scheme-name-input"
          value={design.name}
          onChange={(event) => onRename(event.target.value)}
          aria-label="方案名称"
        />
      </div>

      <div className="topbar-actions">
        <button className="icon-button command-button" onClick={onNew} title="新建方案" type="button">
          <FilePlus2 size={17} />
          <span>新建</span>
        </button>
        <button className="icon-button command-button" onClick={onSave} title="保存方案" type="button">
          <Save size={17} />
          <span>保存</span>
        </button>
        <label className="saved-select-wrap" title="打开已保存方案">
          <FolderOpen size={16} />
          <select value="" onChange={(event) => event.target.value && onOpen(event.target.value)} aria-label="打开已保存方案">
            <option value="">打开方案</option>
            {savedDesigns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {formatTime(item.updatedAt)}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-button command-button" onClick={onExportPng} title="导出 PNG 平面图" type="button">
          <Download size={17} />
          <span>平面图</span>
        </button>
        <button className="icon-button command-button" onClick={onExportJson} title="导出方案 JSON" type="button">
          <FileJson size={17} />
          <span>JSON</span>
        </button>
        <button className="icon-button command-button" onClick={onExportEstimateCsv} title="导出预算 CSV" type="button">
          <FileSpreadsheet size={17} />
          <span>预算</span>
        </button>
        <button className="icon-button command-button" onClick={onExportHtmlReport} title="导出 HTML 交付报告" type="button">
          <FileText size={17} />
          <span>报告</span>
        </button>
        {viewMode === 'threeD' && (
          <button className="icon-button command-button" onClick={onExport3DPng} title="导出 3D 效果图" type="button">
            <ImageDown size={17} />
            <span>3D图</span>
          </button>
        )}
      </div>

      <div className="topbar-tools">
        <div className="view-toggle" aria-label="切换视图">
          <button
            className={viewMode === 'plan' ? 'is-active' : ''}
            onClick={() => onViewModeChange('plan')}
            title="平面编辑"
            type="button"
          >
            <Map size={16} />
            <span>平面</span>
          </button>
          <button
            className={viewMode === 'threeD' ? 'is-active' : ''}
            onClick={() => onViewModeChange('threeD')}
            title="3D 预览"
            type="button"
          >
            <Box size={16} />
            <span>3D</span>
          </button>
        </div>
        <button className="icon-button" onClick={onFitView} title="适配画布" type="button">
          <Maximize2 size={18} />
        </button>
        <button className="icon-button" onClick={onCenterView} title="居中户型" type="button">
          <LocateFixed size={18} />
        </button>
        <button
          className={showGrid ? 'icon-button is-active' : 'icon-button'}
          onClick={onToggleGrid}
          title={showGrid ? '隐藏网格' : '显示网格'}
          type="button"
          aria-pressed={showGrid}
        >
          <Grid2X2 size={18} />
        </button>
        <button
          className={backgroundVisible ? 'icon-button is-active' : 'icon-button'}
          onClick={onToggleBackground}
          disabled={!hasBackground}
          title={backgroundVisible ? '隐藏底图' : '显示底图'}
          type="button"
          aria-pressed={backgroundVisible}
        >
          <Image size={18} />
        </button>
        <button className="icon-button" onClick={onUndo} disabled={!canUndo} title="撤销" type="button">
          <Undo2 size={18} />
        </button>
        <button className="icon-button" onClick={onRedo} disabled={!canRedo} title="重做" type="button">
          <Redo2 size={18} />
        </button>
        <div className="zoom-control">
          <button className="icon-button" onClick={onZoomOut} title="缩小" type="button">
            <ZoomOut size={18} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="icon-button" onClick={onZoomIn} title="放大" type="button">
            <ZoomIn size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
