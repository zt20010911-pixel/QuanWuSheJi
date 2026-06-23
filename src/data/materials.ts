import type { EstimateSettings, MaterialDefinition } from '../types';

export const MATERIAL_LIBRARY: MaterialDefinition[] = [
  { id: 'floor-laminate-basic', category: 'floor', name: '强化木地板', unit: '㎡', unitPrice: 128, wasteRate: 0.06, color: '#d7b98a' },
  { id: 'floor-tile-basic', category: 'floor', name: '通体砖', unit: '㎡', unitPrice: 168, wasteRate: 0.08, color: '#c8c6bd' },
  { id: 'floor-vinyl', category: 'floor', name: '石塑地板', unit: '㎡', unitPrice: 98, wasteRate: 0.05, color: '#b9a489' },
  { id: 'wall-latex-basic', category: 'wall', name: '乳胶漆', unit: '㎡', unitPrice: 45, wasteRate: 0.08, color: '#f2efe8' },
  { id: 'wall-wallpaper', category: 'wall', name: '墙纸', unit: '㎡', unitPrice: 88, wasteRate: 0.1, color: '#e6d7c5' },
  { id: 'wall-tile-kitchen', category: 'wall', name: '厨卫墙砖', unit: '㎡', unitPrice: 138, wasteRate: 0.09, color: '#d6dde0' },
  { id: 'ceiling-latex-basic', category: 'ceiling', name: '顶面乳胶漆', unit: '㎡', unitPrice: 38, wasteRate: 0.08, color: '#f7f5ef' },
  { id: 'ceiling-gypsum', category: 'ceiling', name: '石膏板吊顶', unit: '㎡', unitPrice: 160, wasteRate: 0.08, color: '#ece8dd' },
  { id: 'construction-base', category: 'construction', name: '基础施工管理', unit: '项', unitPrice: 1200, wasteRate: 0, color: '#96a39b' }
];

export const DEFAULT_ROOM_ZONE_MATERIAL_IDS = {
  floor: 'floor-laminate-basic',
  wall: 'wall-latex-basic',
  ceiling: 'ceiling-latex-basic'
};

export const DEFAULT_ESTIMATE_SETTINGS: EstimateSettings = {
  currency: 'CNY',
  wallHeightMeters: 2.8,
  wasteRate: 0.08,
  includeWaste: true,
  priceTemplateVersion: 'v5-local-2026',
  materialOverrides: {}
};

export const resolveMaterial = (settings: EstimateSettings | undefined, materialId: string) => {
  const material = MATERIAL_LIBRARY.find((item) => item.id === materialId) ?? MATERIAL_LIBRARY[0];
  const overridePrice = settings?.materialOverrides?.[materialId];

  return typeof overridePrice === 'number' ? { ...material, unitPrice: overridePrice } : material;
};
