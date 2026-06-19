import {
  Armchair,
  DoorOpen,
  Hand,
  LayoutTemplate,
  Minus,
  MousePointer2,
  Ruler,
  Search,
  Square,
  Star,
  Upload
} from 'lucide-react';
import { FURNITURE_CATEGORIES, FURNITURE_LIBRARY } from '../data/furniture';
import { DESIGN_TEMPLATES } from '../data/templates';
import type { DesignTemplate, FurnitureDefinition, ToolMode } from '../types';

type LeftPanelProps = {
  mode: ToolMode;
  activeCategory: string;
  searchText: string;
  usedFurnitureIds: string[];
  favoriteFurnitureIds: string[];
  recommendedRoomNames: string[];
  onModeChange: (mode: ToolMode) => void;
  onApplyTemplate: (template: DesignTemplate) => void;
  onBackgroundUpload: (file: File) => void;
  onCategoryChange: (category: string) => void;
  onSearchChange: (value: string) => void;
  onFurnitureDragStart: (item: FurnitureDefinition) => void;
  onToggleFurnitureFavorite: (id: string) => void;
};

const tools: Array<{ mode: ToolMode; label: string; title: string; icon: typeof MousePointer2 }> = [
  { mode: 'select', label: '选择', title: '选择和移动对象', icon: MousePointer2 },
  { mode: 'wall', label: '墙体', title: '绘制墙体', icon: Minus },
  { mode: 'door', label: '门', title: '在墙上放置门', icon: DoorOpen },
  { mode: 'window', label: '窗', title: '在墙上放置窗', icon: Square },
  { mode: 'calibrate', label: '标定', title: '用两点标定户型图比例', icon: Ruler },
  { mode: 'pan', label: '平移', title: '拖动画布视图', icon: Hand }
];

const getRecommendationRoomKeys = (roomNames: string[]) => {
  if (roomNames.length === 0) {
    return ['客厅', '卧室', '餐厅', '厨房', '卫浴'];
  }

  return Array.from(
    new Set(
      roomNames.flatMap((name) => {
        const keys = [name];

        if (name.includes('卧')) keys.push('卧室');
        if (name.includes('客') || name.includes('厅')) keys.push('客厅', '餐厅');
        if (name.includes('厨')) keys.push('厨房');
        if (name.includes('卫') || name.includes('浴')) keys.push('卫浴');
        if (name.includes('书')) keys.push('书房');
        if (name.includes('玄')) keys.push('玄关');
        if (name.includes('阳')) keys.push('阳台');

        return keys;
      })
    )
  );
};

export default function LeftPanel({
  mode,
  activeCategory,
  searchText,
  usedFurnitureIds,
  favoriteFurnitureIds,
  recommendedRoomNames,
  onModeChange,
  onApplyTemplate,
  onBackgroundUpload,
  onCategoryChange,
  onSearchChange,
  onFurnitureDragStart,
  onToggleFurnitureFavorite
}: LeftPanelProps) {
  const categoryOptions = ['全部', '已使用', '收藏', '推荐', ...FURNITURE_CATEGORIES.filter((category) => category !== '全部')];
  const recommendationRoomKeys = getRecommendationRoomKeys(recommendedRoomNames);
  const filteredFurniture = FURNITURE_LIBRARY.filter((item) => {
    const favorite = favoriteFurnitureIds.includes(item.id);
    const used = usedFurnitureIds.includes(item.id);
    const recommended = item.recommendedRooms?.some((room) =>
      recommendationRoomKeys.some((name) => name.includes(room) || room.includes(name))
    );
    const matchCategory =
      activeCategory === '全部' ||
      item.category === activeCategory ||
      (activeCategory === '已使用' && used) ||
      (activeCategory === '收藏' && favorite) ||
      (activeCategory === '推荐' && Boolean(recommended));
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
          {categoryOptions.map((category) => (
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
          {filteredFurniture.map((item) => {
            const favorite = favoriteFurnitureIds.includes(item.id);

            return (
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
                    {item.category} · {item.width}×{item.depth}cm · 高{(item.height ?? 0).toFixed(2)}m
                  </small>
                </div>
                <button
                  className={favorite ? 'favorite-button is-active' : 'favorite-button'}
                  type="button"
                  title={favorite ? '取消收藏' : '收藏家具'}
                  aria-label={favorite ? '取消收藏家具' : '收藏家具'}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFurnitureFavorite(item.id);
                  }}
                >
                  <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
