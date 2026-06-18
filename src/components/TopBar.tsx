import {
  Download,
  FilePlus2,
  FolderOpen,
  Redo2,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import type { DesignDocument } from '../types';

type TopBarProps = {
  design: DesignDocument;
  savedDesigns: DesignDocument[];
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onRename: (name: string) => void;
  onNew: () => void;
  onSave: () => void;
  onOpen: (id: string) => void;
  onExportPng: () => void;
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
  onRename,
  onNew,
  onSave,
  onOpen,
  onExportPng,
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
          <span>导出</span>
        </button>
      </div>

      <div className="topbar-tools">
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
