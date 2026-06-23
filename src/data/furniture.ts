import type { FurnitureDefinition } from '../types';
import { getDefaultFurnitureMaterialId, resolveFurnitureMaterial } from './furnitureMaterials';

export const FURNITURE_CATEGORIES = [
  '全部',
  '客厅',
  '卧室',
  '餐厅',
  '厨房',
  '卫浴',
  '书房',
  '收纳',
  '儿童房',
  '阳台',
  '玄关',
  '灯饰'
];

const getFurnitureHeight = (item: FurnitureDefinition) => {
  if (item.shape === 'bed' || item.shape === 'sofa') return 0.55;
  if (item.shape === 'dining' || item.shape === 'desk') return 0.75;
  if (item.shape === 'storage') return 2.1;
  if (item.shape === 'cabinet' || item.category === '厨房') return 0.9;
  if (item.shape === 'appliance') return 1.5;
  if (item.shape === 'sanitary') return 0.65;
  return 0.45;
};

const getFurnitureMaterial = (item: FurnitureDefinition) => {
  if (item.category === '卫浴') return '陶瓷';
  if (item.category === '灯饰') return '金属';
  if (item.shape === 'sofa' || item.shape === 'bed') return '布艺';
  if (item.shape === 'appliance') return '金属';
  return '木饰面';
};

const getRecommendedRooms = (item: FurnitureDefinition) => {
  if (item.category === '收纳') return ['卧室', '玄关', '阳台'];
  if (item.category === '灯饰') return ['客厅', '卧室', '餐厅'];
  return [item.category];
};

const getFurnitureSubcategory = (item: FurnitureDefinition) => {
  if (item.shape === 'sofa') return '沙发';
  if (item.shape === 'bed') return '床';
  if (item.shape === 'dining') return '餐桌椅';
  if (item.shape === 'cabinet') return '柜体';
  if (item.shape === 'storage') return '收纳';
  if (item.shape === 'sanitary') return '卫浴洁具';
  if (item.shape === 'appliance') return item.category === '灯饰' ? '灯饰' : '电器';
  if (item.shape === 'desk') return '桌台';
  if (item.shape === 'round') return '圆形家具';
  return item.category;
};

const getFurnitureStyleTags = (item: FurnitureDefinition) => {
  const tags = ['现代'];

  if (item.category === '儿童房') tags.push('儿童');
  if (item.category === '收纳' || item.shape === 'storage') tags.push('收纳');
  if (item.category === '灯饰') tags.push('轻奢');
  if (item.shape === 'sofa' || item.shape === 'bed') tags.push('北欧');
  if (item.category === '厨房' || item.category === '卫浴') tags.push('实用');

  return Array.from(new Set(tags));
};

const getFurnitureModelVariant = (item: FurnitureDefinition) => {
  if (item.id.includes('sofa-l')) return 'l-sofa';
  if (item.id.includes('round')) return 'round-table';
  if (item.category === '灯饰') return item.id.includes('floor') ? 'floor-light' : 'ceiling-light';
  if (item.shape === 'bed') return item.id.includes('bunk') ? 'bunk-bed' : 'platform-bed';
  if (item.shape === 'appliance') return item.id.includes('fridge') ? 'fridge' : 'appliance';
  if (item.shape === 'sanitary') return item.id.includes('shower') ? 'shower' : 'sanitary';
  return item.shape;
};

const BASE_FURNITURE_LIBRARY: FurnitureDefinition[] = [
  { id: 'living-sofa-3', category: '客厅', name: '三人沙发', width: 210, depth: 90, color: '#d6e6f2', accentColor: '#4b86a8', shape: 'sofa' },
  { id: 'living-sofa-l', category: '客厅', name: 'L 型沙发', width: 260, depth: 170, color: '#d9ead3', accentColor: '#5d8b57', shape: 'sofa' },
  { id: 'living-coffee-table', category: '客厅', name: '茶几', width: 120, depth: 60, color: '#f4e4c1', accentColor: '#b0844d', shape: 'rect' },
  { id: 'living-tv-cabinet', category: '客厅', name: '电视柜', width: 200, depth: 40, color: '#ead7c3', accentColor: '#9c6b43', shape: 'cabinet' },
  { id: 'living-armchair', category: '客厅', name: '单椅', width: 80, depth: 80, color: '#f0d1d6', accentColor: '#ad5968', shape: 'sofa' },
  { id: 'bedroom-bed-150', category: '卧室', name: '1.5 米床', width: 150, depth: 200, color: '#f4d7d7', accentColor: '#b56666', shape: 'bed' },
  { id: 'bedroom-bed-180', category: '卧室', name: '1.8 米床', width: 180, depth: 200, color: '#f2d5c4', accentColor: '#b46b45', shape: 'bed' },
  { id: 'bedroom-wardrobe', category: '卧室', name: '衣柜', width: 200, depth: 60, color: '#e3ddca', accentColor: '#8a7a58', shape: 'storage' },
  { id: 'bedroom-nightstand', category: '卧室', name: '床头柜', width: 50, depth: 45, color: '#efe2ce', accentColor: '#9c7a52', shape: 'cabinet' },
  { id: 'bedroom-dresser', category: '卧室', name: '梳妆台', width: 110, depth: 50, color: '#f6d9e0', accentColor: '#b9657b', shape: 'desk' },
  { id: 'dining-table-4', category: '餐厅', name: '四人餐桌', width: 140, depth: 80, color: '#f2e2be', accentColor: '#a97c3f', shape: 'dining' },
  { id: 'dining-table-6', category: '餐厅', name: '六人餐桌', width: 180, depth: 90, color: '#f0dfbd', accentColor: '#9d7240', shape: 'dining' },
  { id: 'dining-sideboard', category: '餐厅', name: '餐边柜', width: 160, depth: 45, color: '#e7d6bd', accentColor: '#8e6847', shape: 'cabinet' },
  { id: 'dining-round-table', category: '餐厅', name: '圆餐桌', width: 120, depth: 120, color: '#f3e7c4', accentColor: '#ac8649', shape: 'round' },
  { id: 'kitchen-base-cabinet', category: '厨房', name: '地柜', width: 180, depth: 60, color: '#d9e7e5', accentColor: '#4f8880', shape: 'cabinet' },
  { id: 'kitchen-high-cabinet', category: '厨房', name: '高柜', width: 90, depth: 60, color: '#d4e3dc', accentColor: '#4c806b', shape: 'storage' },
  { id: 'kitchen-sink', category: '厨房', name: '水槽柜', width: 90, depth: 60, color: '#d2e5ed', accentColor: '#4d8ca5', shape: 'appliance' },
  { id: 'kitchen-fridge', category: '厨房', name: '冰箱', width: 75, depth: 70, color: '#d8dde5', accentColor: '#66738a', shape: 'appliance' },
  { id: 'kitchen-stove', category: '厨房', name: '灶台', width: 90, depth: 60, color: '#e2ded6', accentColor: '#7e7468', shape: 'appliance' },
  { id: 'bath-toilet', category: '卫浴', name: '马桶', width: 45, depth: 70, color: '#dbeef4', accentColor: '#5d99aa', shape: 'sanitary' },
  { id: 'bath-vanity', category: '卫浴', name: '浴室柜', width: 90, depth: 55, color: '#d9eadf', accentColor: '#5c9271', shape: 'cabinet' },
  { id: 'bath-shower', category: '卫浴', name: '淋浴房', width: 90, depth: 90, color: '#d7edf1', accentColor: '#55a0ad', shape: 'sanitary' },
  { id: 'bath-tub', category: '卫浴', name: '浴缸', width: 160, depth: 75, color: '#e0edf2', accentColor: '#6699aa', shape: 'sanitary' },
  { id: 'study-desk', category: '书房', name: '书桌', width: 140, depth: 65, color: '#d8e3f2', accentColor: '#557aa8', shape: 'desk' },
  { id: 'study-chair', category: '书房', name: '办公椅', width: 65, depth: 65, color: '#e1d7f0', accentColor: '#7c63a9', shape: 'round' },
  { id: 'study-bookshelf', category: '书房', name: '书柜', width: 120, depth: 35, color: '#e9dcc7', accentColor: '#917044', shape: 'storage' },
  { id: 'study-long-desk', category: '书房', name: '双人长桌', width: 220, depth: 65, color: '#d9e4ef', accentColor: '#527da2', shape: 'desk' },
  { id: 'storage-closet', category: '收纳', name: '通顶柜', width: 180, depth: 60, color: '#e7e1d3', accentColor: '#82775f', shape: 'storage' },
  { id: 'storage-shoe-cabinet', category: '收纳', name: '鞋柜', width: 120, depth: 35, color: '#e9decf', accentColor: '#8a6d4f', shape: 'cabinet' },
  { id: 'storage-laundry', category: '收纳', name: '洗衣机柜', width: 70, depth: 70, color: '#dce7ea', accentColor: '#647f89', shape: 'appliance' },
  { id: 'storage-shelf', category: '收纳', name: '置物架', width: 90, depth: 35, color: '#e5ebd4', accentColor: '#789052', shape: 'storage' },
  { id: 'kids-bed', category: '儿童房', name: '儿童床', width: 120, depth: 190, color: '#f7d6c2', accentColor: '#d47752', shape: 'bed' },
  { id: 'kids-bunk-bed', category: '儿童房', name: '高低床', width: 135, depth: 200, color: '#d7e9f7', accentColor: '#5c8eb6', shape: 'bed' },
  { id: 'kids-study-desk', category: '儿童房', name: '学习桌', width: 120, depth: 60, color: '#f2e8bf', accentColor: '#aa9143', shape: 'desk' },
  { id: 'kids-toy-cabinet', category: '儿童房', name: '玩具柜', width: 100, depth: 40, color: '#e5d6f1', accentColor: '#8c63aa', shape: 'storage' },
  { id: 'balcony-washer', category: '阳台', name: '洗衣机', width: 60, depth: 65, color: '#dce3ea', accentColor: '#697d91', shape: 'appliance' },
  { id: 'balcony-sink', category: '阳台', name: '阳台洗手池', width: 80, depth: 55, color: '#d5e9e8', accentColor: '#56928c', shape: 'sanitary' },
  { id: 'balcony-chair', category: '阳台', name: '休闲椅', width: 70, depth: 75, color: '#e4ecd1', accentColor: '#829b50', shape: 'sofa' },
  { id: 'balcony-plant', category: '阳台', name: '绿植架', width: 90, depth: 40, color: '#d8ecd0', accentColor: '#5d994f', shape: 'storage' },
  { id: 'entry-console', category: '玄关', name: '玄关柜', width: 140, depth: 40, color: '#eadfcd', accentColor: '#8f704c', shape: 'cabinet' },
  { id: 'entry-bench', category: '玄关', name: '换鞋凳', width: 90, depth: 40, color: '#f0d8c7', accentColor: '#a66b47', shape: 'rect' },
  { id: 'entry-mirror', category: '玄关', name: '穿衣镜', width: 60, depth: 10, color: '#d9e4ee', accentColor: '#668aa3', shape: 'rect' },
  { id: 'light-ceiling', category: '灯饰', name: '吸顶灯', width: 70, depth: 70, color: '#fff1ba', accentColor: '#c29d33', shape: 'round' },
  { id: 'light-pendant', category: '灯饰', name: '吊灯', width: 80, depth: 80, color: '#ffe8a8', accentColor: '#bc8b28', shape: 'round' },
  { id: 'light-floor', category: '灯饰', name: '落地灯', width: 45, depth: 45, color: '#f7e5b0', accentColor: '#a9812a', shape: 'round' },
  { id: 'living-modular-sofa', category: '客厅', name: '模块组合沙发', width: 300, depth: 180, color: '#c9d7d0', accentColor: '#5d756b', shape: 'sofa', subcategory: '组合沙发', styleTags: ['现代', '北欧'], modelVariant: 'l-sofa' },
  { id: 'living-glass-side-table', category: '客厅', name: '玻璃边几', width: 55, depth: 55, color: '#d6edf4', accentColor: '#5a94a6', shape: 'round', materialId: 'glass-clear', styleTags: ['轻奢', '现代'] },
  { id: 'bedroom-storage-bed', category: '卧室', name: '收纳床', width: 180, depth: 210, color: '#d6c1a3', accentColor: '#8c6842', shape: 'bed', materialId: 'wood-walnut', styleTags: ['收纳', '现代'], modelVariant: 'storage-bed' },
  { id: 'bedroom-open-wardrobe', category: '卧室', name: '开放衣帽柜', width: 240, depth: 60, color: '#d8c09a', accentColor: '#7e6040', shape: 'storage', materialId: 'wood-oak', styleTags: ['收纳', '现代'] },
  { id: 'dining-rock-slab-table', category: '餐厅', name: '岩板餐桌', width: 180, depth: 90, color: '#e7e2d8', accentColor: '#8a8172', shape: 'dining', materialId: 'stone-white', styleTags: ['轻奢', '岩板'] },
  { id: 'kitchen-island', category: '厨房', name: '中岛台', width: 200, depth: 90, color: '#e6e0d3', accentColor: '#6f7b75', shape: 'cabinet', materialId: 'stone-white', styleTags: ['现代', '实用'] },
  { id: 'bath-smart-toilet', category: '卫浴', name: '智能马桶', width: 48, depth: 72, color: '#e8f1f2', accentColor: '#668d98', shape: 'sanitary', materialId: 'ceramic-white', styleTags: ['现代', '智能'] },
  { id: 'study-lift-desk', category: '书房', name: '升降书桌', width: 150, depth: 70, color: '#d9d1bf', accentColor: '#5f6b6d', shape: 'desk', materialId: 'wood-oak', styleTags: ['现代', '办公'] },
  { id: 'entry-full-height-cabinet', category: '玄关', name: '通顶玄关柜', width: 180, depth: 40, color: '#ded1bd', accentColor: '#806b52', shape: 'storage', materialId: 'wood-oak', styleTags: ['收纳', '现代'] },
  { id: 'balcony-fold-table', category: '阳台', name: '折叠休闲桌', width: 90, depth: 55, color: '#d9e6ce', accentColor: '#718f58', shape: 'desk', materialId: 'plastic-matte', styleTags: ['休闲', '实用'] }
];

export const FURNITURE_LIBRARY: FurnitureDefinition[] = BASE_FURNITURE_LIBRARY.map((item) => ({
  ...item,
  subcategory: item.subcategory ?? getFurnitureSubcategory(item),
  height: item.height ?? getFurnitureHeight(item),
  materialId: item.materialId ?? getDefaultFurnitureMaterialId(item),
  material: item.material ?? resolveFurnitureMaterial(item.materialId ?? getDefaultFurnitureMaterialId(item)).name ?? getFurnitureMaterial(item),
  recommendedRooms: item.recommendedRooms ?? getRecommendedRooms(item),
  styleTags: item.styleTags ?? getFurnitureStyleTags(item),
  modelType: item.modelType ?? 'procedural',
  modelVariant: item.modelVariant ?? getFurnitureModelVariant(item),
  product: {
    brand: item.product?.brand ?? '',
    series: item.product?.series ?? '',
    sku: item.product?.sku ?? '',
    referencePrice: item.product?.referencePrice ?? 0,
    productUrl: item.product?.productUrl ?? '',
    imageUrl: item.product?.imageUrl ?? '',
    isRealProduct: item.product?.isRealProduct ?? false
  }
}));
