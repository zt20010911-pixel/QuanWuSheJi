import { Armchair, DoorOpen, Hand, LayoutTemplate, Minus, MousePointer2, Ruler, Search, Square, Upload } from 'lucide-react';
import { FURNITURE_CATEGORIES, FURNITURE_LIBRARY } from '../data/furniture';
import { DESIGN_TEMPLATES } from '../data/templates';
import type { DesignTemplate, FurnitureDefinition, ToolMode } from '../types';

type LeftPanelProps = {
  mode: ToolMode;
  activeCategory: string;
  searchText: string;
  onModeChange: (mode: ToolMode) => void;
  onApplyTemplate: (template: DesignTemplate) => void;
  onBackgroundUpload: (file: File) => void;
  onCategoryChange: (category: string) => void;
  onSearchChange: (value: string) => void;
  onFurnitureDragStart: (item: FurnitureDefinition) => void;
};

const tools: Array<{ mode: ToolMode; label: string; title: string; icon: typeof MousePointer2 }> = [
  { mode: 'select', label: '选择', title: '选择和移动对象', icon: MousePointer2 },
  { mode: 'wall', label: '墙体', title: '绘制墙体', icon: Minus },
  { mode: 'door', label: '门', title: '在墙上放置门', icon: DoorOpen },
  { mode: 'window', label: '窗', title: '在墙上放置窗', icon: Square },
  { mode: 'calibrate', label: '标定', title: '用两点标定户型图比例', icon: Ruler },
  { mode: 'pan', label: '平移', title: '拖动画布视图', icon: Hand }
];

export default function LeftPanel({
  mode,
  activeCategory,
  searchText,
  onModeChange,
  onApplyTemplate,
  onBackgroundUpload,
  onCategoryChange,
  onSearchChange,
  onFurnitureDragStart
}: LeftPanelProps) {
  const filteredFurniture = FURNITURE_LIBRARY.filter((item) => {
    const matchCategory = activeCategory === '全部' || item.category === activeCategory;
    const keyword = searchText.trim();
    const matchSearch = !keyword || item.name.includes(keyword) || item.category.includes(keyword);

    return matchCategory && matchSearch;
  });

  return (
    <aside className="left-panel">
      <section className="panel-section">
        <div className="section-title">
          <LayoutTemplate size={16} />
          <span>户型模板</span>
        </div>
        <div className="template-list">
          {DESIGN_TEMPLATES.map((template) => (
            <button className="template-button" key={template.id} type="button" onClick={() => onApplyTemplate(template)}>
              <span>{template.name}</span>
              <small>{template.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <div className="section-title">
          <MousePointer2 size={16} />
          <span>绘图工具</span>
        </div>
        <label className="upload-button">
          <Upload size={17} />
          <span>上传户型图</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                onBackgroundUpload(file);
                event.target.value = '';
              }
            }}
          />
        </label>
        <div className="tool-grid">
          {tools.map((tool) => {
            const Icon = tool.icon;

            return (
              <button
                className={`tool-button ${mode === tool.mode ? 'is-active' : ''}`}
                key={tool.mode}
                onClick={() => onModeChange(tool.mode)}
                title={tool.title}
                type="button"
              >
                <Icon size={18} />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel-section furniture-section">
        <div className="section-title">
          <Armchair size={16} />
          <span>家具库</span>
        </div>
        <label className="search-box">
          <Search size={15} />
          <input value={searchText} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索家具" />
        </label>
        <div className="category-row">
          {FURNITURE_CATEGORIES.map((category) => (
            <button
              className={activeCategory === category ? 'is-active' : ''}
              key={category}
              type="button"
              onClick={() => onCategoryChange(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <div className="furniture-list">
          {filteredFurniture.map((item) => (
            <div
              className="furniture-item"
              draggable
              key={item.id}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', item.id);
                onFurnitureDragStart(item);
              }}
            >
              <span className="furniture-swatch" style={{ background: item.color, borderColor: item.accentColor }} />
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.category} · {item.width}×{item.depth}cm
                </small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
