import type {
  FurnitureComboDefinition,
  FurnitureDefinition,
  FurnitureMaterialDefinition,
  FurnitureShape,
  MaterialBrushState
} from '../types';

export const FURNITURE_MATERIAL_LIBRARY: FurnitureMaterialDefinition[] = [
  { id: 'wood-oak', name: '浅橡木', category: 'wood', color: '#d8bd8a', textureType: 'grain', roughness: 0.58, metalness: 0.02, suitableShapes: ['rect', 'cabinet', 'storage', 'desk', 'dining', 'bed'] },
  { id: 'wood-walnut', name: '胡桃木', category: 'wood', color: '#8d5f3c', textureType: 'grain', roughness: 0.54, metalness: 0.02, suitableShapes: ['rect', 'cabinet', 'storage', 'desk', 'dining', 'bed'] },
  { id: 'fabric-linen', name: '亚麻布艺', category: 'fabric', color: '#b9c9be', textureType: 'woven', roughness: 0.86, metalness: 0, suitableShapes: ['sofa', 'bed', 'round'] },
  { id: 'fabric-warm-gray', name: '暖灰布艺', category: 'fabric', color: '#b8b3aa', textureType: 'woven', roughness: 0.82, metalness: 0, suitableShapes: ['sofa', 'bed', 'round'] },
  { id: 'leather-camel', name: '焦糖皮革', category: 'leather', color: '#b57943', textureType: 'gloss', roughness: 0.42, metalness: 0.01, suitableShapes: ['sofa', 'round'] },
  { id: 'metal-black', name: '黑钛金属', category: 'metal', color: '#2e3338', textureType: 'matte', roughness: 0.36, metalness: 0.45, suitableShapes: ['appliance', 'desk', 'dining', 'round'] },
  { id: 'glass-clear', name: '通透玻璃', category: 'glass', color: '#b9ddea', textureType: 'gloss', roughness: 0.12, metalness: 0, suitableShapes: ['rect', 'round', 'dining', 'desk'] },
  { id: 'stone-white', name: '白色岩板', category: 'stone', color: '#e8e4dc', textureType: 'matte', roughness: 0.48, metalness: 0, suitableShapes: ['rect', 'cabinet', 'dining', 'desk'] },
  { id: 'ceramic-white', name: '白色陶瓷', category: 'ceramic', color: '#e5f0f2', textureType: 'gloss', roughness: 0.28, metalness: 0, suitableShapes: ['sanitary', 'cabinet'] },
  { id: 'plastic-matte', name: '哑光塑料', category: 'plastic', color: '#d8dee8', textureType: 'matte', roughness: 0.62, metalness: 0, suitableShapes: ['appliance', 'storage', 'round'] }
];

export const DEFAULT_FURNITURE_MATERIAL_ID = 'wood-oak';

export const DEFAULT_MATERIAL_BRUSH: MaterialBrushState = {
  materialId: DEFAULT_FURNITURE_MATERIAL_ID,
  target: 'furniture'
};

export const resolveFurnitureMaterial = (materialId?: string) =>
  FURNITURE_MATERIAL_LIBRARY.find((material) => material.id === materialId) ?? FURNITURE_MATERIAL_LIBRARY[0];

export const getDefaultFurnitureMaterialId = (furniture: Pick<FurnitureDefinition, 'shape' | 'category'>) => {
  if (furniture.category === '卫浴' || furniture.shape === 'sanitary') return 'ceramic-white';
  if (furniture.category === '灯饰' || furniture.shape === 'appliance') return 'metal-black';
  if (furniture.shape === 'sofa') return 'fabric-linen';
  if (furniture.shape === 'bed') return 'fabric-warm-gray';
  if (furniture.shape === 'dining' || furniture.shape === 'desk') return 'wood-oak';
  return DEFAULT_FURNITURE_MATERIAL_ID;
};

const allShapes: FurnitureShape[] = ['rect', 'round', 'bed', 'sofa', 'dining', 'cabinet', 'sanitary', 'appliance', 'desk', 'storage'];

export const getMaterialShapeLabel = (material: FurnitureMaterialDefinition) =>
  material.suitableShapes.length === allShapes.length ? '通用' : `${material.suitableShapes.length} 类家具`;

export const FURNITURE_COMBOS: FurnitureComboDefinition[] = [
  {
    id: 'combo-living-basic',
    name: '客厅基础套装',
    category: '客厅',
    styleTags: ['现代', '通用'],
    defaultRoom: '客厅',
    width: 360,
    depth: 260,
    items: [
      { furnitureId: 'living-sofa-3', offsetX: 0, offsetY: 70 },
      { furnitureId: 'living-coffee-table', offsetX: 0, offsetY: -40 },
      { furnitureId: 'living-tv-cabinet', offsetX: 0, offsetY: -150 }
    ]
  },
  {
    id: 'combo-bedroom-basic',
    name: '卧室舒适套装',
    category: '卧室',
    styleTags: ['北欧', '收纳'],
    defaultRoom: '卧室',
    width: 320,
    depth: 300,
    items: [
      { furnitureId: 'bedroom-bed-180', offsetX: 0, offsetY: 30 },
      { furnitureId: 'bedroom-nightstand', offsetX: -125, offsetY: 20 },
      { furnitureId: 'bedroom-nightstand', offsetX: 125, offsetY: 20 },
      { furnitureId: 'bedroom-wardrobe', offsetX: 0, offsetY: -150 }
    ]
  },
  {
    id: 'combo-dining-basic',
    name: '餐厅四人套装',
    category: '餐厅',
    styleTags: ['现代', '岩板'],
    defaultRoom: '餐厅',
    width: 260,
    depth: 220,
    items: [
      { furnitureId: 'dining-table-4', offsetX: 0, offsetY: 0 },
      { furnitureId: 'dining-sideboard', offsetX: 0, offsetY: -120 }
    ]
  },
  {
    id: 'combo-kids-basic',
    name: '儿童房成长套装',
    category: '儿童房',
    styleTags: ['儿童', '收纳'],
    defaultRoom: '儿童房',
    width: 280,
    depth: 300,
    items: [
      { furnitureId: 'kids-bed', offsetX: -60, offsetY: 40 },
      { furnitureId: 'kids-study-desk', offsetX: 90, offsetY: -80 },
      { furnitureId: 'kids-toy-cabinet', offsetX: -90, offsetY: -120 }
    ]
  },
  {
    id: 'combo-entry-storage',
    name: '玄关收纳套装',
    category: '玄关',
    styleTags: ['收纳', '通用'],
    defaultRoom: '玄关',
    width: 240,
    depth: 120,
    items: [
      { furnitureId: 'entry-console', offsetX: 0, offsetY: -35 },
      { furnitureId: 'entry-bench', offsetX: -70, offsetY: 45 },
      { furnitureId: 'entry-mirror', offsetX: 70, offsetY: 45 }
    ]
  }
];
