import {
  Armchair,
  Brush,
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
import { FURNITURE_COMBOS, FURNITURE_MATERIAL_LIBRARY, resolveFurnitureMaterial } from '../data/furnitureMaterials';
import { DESIGN_TEMPLATES } from '../data/templates';
import type { DesignTemplate, FurnitureComboDefinition, FurnitureDefinition, ToolMode, WallDrawMode } from '../types';

type LeftPanelProps = {
  mode: ToolMode;
  wallDrawMode: WallDrawMode;
  showWallLengths: boolean;
  activeCategory: string;
  searchText: string;
  usedFurnitureIds: string[];
  favoriteFurnitureIds: string[];
  favoriteFurnitureComboIds: string[];
  recommendedRoomNames: string[];
  onModeChange: (mode: ToolMode) => void;
  onWallDrawModeChange: (mode: WallDrawMode) => void;
  onToggleWallLengths: () => void;
  onApplyTemplate: (template: DesignTemplate) => void;
  onBackgroundUpload: (file: File) => void;
  onCategoryChange: (category: string) => void;
  onSearchChange: (value: string) => void;
  onFurnitureDragStart: (item: FurnitureDefinition) => void;
  onFurnitureComboDragStart: (item: FurnitureComboDefinition) => void;
  onFurnitureClick: (item: FurnitureDefinition) => void;
  onFurnitureComboClick: (item: FurnitureComboDefinition) => void;
  onToggleFurnitureFavorite: (id: string) => void;
  onToggleFurnitureComboFavorite: (id: string) => void;
};

const tools: Array<{ mode: ToolMode; label: string; title: string; icon: typeof MousePointer2 }> = [
  { mode: 'select', label: '选择', title: '选择和移动对象', icon: MousePointer2 },
  { mode: 'wall', label: '墙体', title: '绘制正式墙体', icon: Minus },
  { mode: 'recognition-wall', label: '补墙', title: '补充识别图层墙体', icon: Ruler },
  { mode: 'room-zone', label: '房间', title: '绘制房间区域并统计面积', icon: Square },
  { mode: 'material-brush', label: '材质', title: '用材质刷快速应用家具或房间材料', icon: Brush },
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
  wallDrawMode,
  showWallLengths,
  activeCategory,
  searchText,
  usedFurnitureIds,
  favoriteFurnitureIds,
  favoriteFurnitureComboIds,
  recommendedRoomNames,
  onModeChange,
  onWallDrawModeChange,
  onToggleWallLengths,
  onApplyTemplate,
  onBackgroundUpload,
  onCategoryChange,
  onSearchChange,
  onFurnitureDragStart,
  onFurnitureComboDragStart,
  onFurnitureClick,
  onFurnitureComboClick,
  onToggleFurnitureFavorite,
  onToggleFurnitureComboFavorite
}: LeftPanelProps) {
  const styleOptions = ['现代', '北欧', '轻奢', '收纳', '儿童', '实用'];
  const materialOptions = FURNITURE_MATERIAL_LIBRARY.map((material) => material.name);
  const categoryOptions = Array.from(
    new Set([
      '全部',
      '已使用',
      '收藏',
      '推荐',
      '组合',
      ...styleOptions,
      ...materialOptions,
      ...FURNITURE_CATEGORIES.filter((category) => category !== '全部')
    ])
  );
  const recommendationRoomKeys = getRecommendationRoomKeys(recommendedRoomNames);
  const filteredFurniture = FURNITURE_LIBRARY.filter((item) => {
    const favorite = favoriteFurnitureIds.includes(item.id);
    const used = usedFurnitureIds.includes(item.id);
    const material = resolveFurnitureMaterial(item.materialId);
    const recommended = item.recommendedRooms?.some((room) =>
      recommendationRoomKeys.some((name) => name.includes(room) || room.includes(name))
    );
    const matchCategory =
      activeCategory === '全部' ||
      item.category === activeCategory ||
      item.subcategory === activeCategory ||
      item.styleTags?.includes(activeCategory) ||
      material.name === activeCategory ||
      (activeCategory === '已使用' && used) ||
      (activeCategory === '收藏' && favorite) ||
      (activeCategory === '推荐' && Boolean(recommended));
    const keyword = searchText.trim();
    const searchableText = [
      item.name,
      item.category,
      item.subcategory,
      item.material,
      material.name,
      item.product?.brand,
      item.product?.series,
      item.product?.sku,
      ...(item.styleTags ?? [])
    ]
      .filter(Boolean)
      .join(' ');
    const matchSearch = !keyword || searchableText.includes(keyword);

    return matchCategory && matchSearch;
  });
  const filteredCombos = FURNITURE_COMBOS.filter((combo) => {
    const favorite = favoriteFurnitureComboIds.includes(combo.id);
    const recommended = recommendationRoomKeys.some((name) => name.includes(combo.defaultRoom) || combo.defaultRoom.includes(name));
    const matchCategory =
      activeCategory === '全部' ||
      activeCategory === '组合' ||
      combo.category === activeCategory ||
      combo.styleTags.includes(activeCategory) ||
      (activeCategory === '收藏' && favorite) ||
      (activeCategory === '推荐' && recommended);
    const searchableText = [combo.name, combo.category, combo.defaultRoom, ...combo.styleTags].join(' ');
    const keyword = searchText.trim();

    return matchCategory && (!keyword || searchableText.includes(keyword));
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
        <div className="draw-options">
          <div className="draw-mode-toggle" aria-label="墙体绘制模式">
            <button
              className={wallDrawMode === 'single' ? 'is-active' : ''}
              type="button"
              title="默认一段一段画墙，画完后自动结束起点"
              onClick={() => onWallDrawModeChange('single')}
            >
              单段
            </button>
            <button
              className={wallDrawMode === 'continuous' ? 'is-active' : ''}
              type="button"
              title="连续绘制会把上一段终点作为下一段起点"
              onClick={() => onWallDrawModeChange('continuous')}
            >
              连续
            </button>
          </div>
          <label className="draw-checkbox">
            <input type="checkbox" checked={showWallLengths} onChange={onToggleWallLengths} />
            <span>显示墙长</span>
          </label>
        </div>
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
          {filteredCombos.map((combo) => {
            const favorite = favoriteFurnitureComboIds.includes(combo.id);

            return (
              <div
                className="furniture-item furniture-combo-item"
                draggable
                key={combo.id}
                role="button"
                tabIndex={0}
                title="点击添加到画布中心，也可以拖拽到指定位置"
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', `combo:${combo.id}`);
                  onFurnitureComboDragStart(combo);
                }}
                onClick={() => onFurnitureComboClick(combo)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }

                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onFurnitureComboClick(combo);
                  }
                }}
              >
                <span className="furniture-swatch combo-swatch">
                  {combo.items.slice(0, 3).map((item, index) => (
                    <span key={`${combo.id}-${item.furnitureId}-${index}`} />
                  ))}
                </span>
                <div>
                  <strong>{combo.name}</strong>
                  <small>
                    组合 · {combo.category} · {combo.width}×{combo.depth}cm
                  </small>
                  <small>{combo.styleTags.join(' / ')}</small>
                </div>
                <button
                  className={favorite ? 'favorite-button is-active' : 'favorite-button'}
                  type="button"
                  title={favorite ? '取消收藏组合' : '收藏组合'}
                  aria-label={favorite ? '取消收藏组合' : '收藏组合'}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFurnitureComboFavorite(combo.id);
                  }}
                >
                  <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
                </button>
              </div>
            );
          })}
          {filteredFurniture.map((item) => {
            const favorite = favoriteFurnitureIds.includes(item.id);
            const material = resolveFurnitureMaterial(item.materialId);

            return (
              <div
                className="furniture-item"
                draggable
                key={item.id}
                role="button"
                tabIndex={0}
                title="点击添加到画布中心，也可以拖拽到指定位置"
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', item.id);
                  onFurnitureDragStart(item);
                }}
                onClick={() => onFurnitureClick(item)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }

                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onFurnitureClick(item);
                  }
                }}
              >
                <span className="furniture-swatch" style={{ background: item.color, borderColor: item.accentColor }} />
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.category} · {item.subcategory} · {item.width}×{item.depth}cm
                  </small>
                  <small>{material.name} · {(item.styleTags ?? []).slice(0, 2).join(' / ')}</small>
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
