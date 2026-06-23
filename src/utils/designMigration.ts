import {
  DESIGN_DOCUMENT_VERSION,
  type DesignDocument,
  type FurnitureInstance,
  type FurnitureProductInfo,
  type ModelExportDraft,
  type RecognitionWall,
  type RenderSettings,
  type Wall
} from '../types';
import { DEFAULT_ESTIMATE_SETTINGS, DEFAULT_ROOM_ZONE_MATERIAL_IDS } from '../data/materials';
import { DEFAULT_MATERIAL_BRUSH, getDefaultFurnitureMaterialId, resolveFurnitureMaterial } from '../data/furnitureMaterials';
import { createDefaultFeatureStates } from '../data/roadmap';

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  cameraPreset: 'overview',
  lightMode: 'daylight',
  materialMode: 'clean',
  environmentMode: 'daylight',
  exportPixelRatio: 2,
  wallMaterial: '#f2efe8',
  floorMaterial: '#d8c7aa',
  showBackgroundIn3D: false,
  showRoomMaterialsIn3D: true,
  showCeilingHint: false
};

const DEFAULT_COLLABORATION_DRAFT = {
  enabled: false,
  role: 'owner' as const,
  note: '本地优先版本，云端协作将在后续接入。'
};

const DEFAULT_MOBILE_CAPTURE_DRAFT = {
  enabled: false,
  source: 'manual' as const,
  note: '预留手机 LiDAR、AR、照片采集数据导入。'
};

const DEFAULT_AI_DESIGN_DRAFT = {
  enabled: false,
  prompt: '',
  status: 'planned' as const
};

const DEFAULT_MODEL_EXPORT_DRAFT: ModelExportDraft = {
  formats: ['GLB', 'OBJ', 'DXF', 'PDF'],
  status: 'planned' as const,
  note: '当前仅预留格式出口，真实模型导出将在后续版本实现。'
};

const getDefaultFurnitureHeight = (furniture: Pick<FurnitureInstance, 'shape' | 'category'>) => {
  if (furniture.shape === 'bed' || furniture.shape === 'sofa') return 0.55;
  if (furniture.shape === 'dining' || furniture.shape === 'desk') return 0.75;
  if (furniture.shape === 'storage') return 2.1;
  if (furniture.shape === 'cabinet' || furniture.category === '厨房') return 0.9;
  if (furniture.shape === 'appliance') return 1.5;
  if (furniture.shape === 'sanitary') return 0.65;
  return 0.45;
};

const getDefaultFurnitureMaterial = (furniture: Pick<FurnitureInstance, 'shape' | 'category'>) => {
  if (furniture.category === '卫浴') return '陶瓷';
  if (furniture.category === '灯饰') return '金属';
  if (furniture.shape === 'sofa' || furniture.shape === 'bed') return '布艺';
  if (furniture.shape === 'appliance') return '金属';
  return '木饰面';
};

const getDefaultFurnitureStyleTags = (furniture: Pick<FurnitureInstance, 'shape' | 'category'>) => {
  const tags = ['现代'];

  if (furniture.category === '儿童房') tags.push('儿童');
  if (furniture.category === '收纳' || furniture.shape === 'storage') tags.push('收纳');
  if (furniture.shape === 'sofa' || furniture.shape === 'bed') tags.push('北欧');
  if (furniture.category === '厨房' || furniture.category === '卫浴') tags.push('实用');

  return Array.from(new Set(tags));
};

const normalizeFurnitureProduct = (product?: Partial<FurnitureProductInfo>): FurnitureProductInfo => ({
  brand: product?.brand ?? '',
  series: product?.series ?? '',
  sku: product?.sku ?? '',
  referencePrice: product?.referencePrice ?? 0,
  productUrl: product?.productUrl ?? '',
  imageUrl: product?.imageUrl ?? '',
  isRealProduct: product?.isRealProduct ?? false
});

export const normalizeFurnitureInstance = (furniture: FurnitureInstance): FurnitureInstance => {
  const materialId = furniture.materialId ?? getDefaultFurnitureMaterialId(furniture);
  const material = resolveFurnitureMaterial(materialId);

  return {
    ...furniture,
    height: furniture.height ?? getDefaultFurnitureHeight(furniture),
    materialId,
    material: furniture.material ?? material.name ?? getDefaultFurnitureMaterial(furniture),
    color: furniture.color || material.color,
    favorite: furniture.favorite ?? false,
    subcategory: furniture.subcategory ?? furniture.category,
    styleTags: furniture.styleTags ?? getDefaultFurnitureStyleTags(furniture),
    modelType: furniture.modelType ?? 'procedural',
    modelVariant: furniture.modelVariant ?? furniture.shape,
    materialOverrides: furniture.materialOverrides ?? {},
    product: normalizeFurnitureProduct(furniture.product)
  };
};

export const normalizeRecognitionWall = (wall: Wall | RecognitionWall): RecognitionWall => {
  const recognitionWall = wall as RecognitionWall;

  return {
    ...wall,
    status: recognitionWall.status ?? 'active',
    confidence: recognitionWall.confidence ?? 0.72,
    source: recognitionWall.source ?? 'scan',
    promotedWallId: recognitionWall.promotedWallId,
    updatedAt: recognitionWall.updatedAt
  };
};

const normalizeRoomZone = (zone: NonNullable<DesignDocument['roomZones']>[number], index: number) => ({
  ...zone,
  name: zone.name || `房间区域${index + 1}`,
  points: zone.points ?? [],
  label: zone.label ?? zone.points?.[0] ?? { x: 0, y: 0 },
  materialIds: {
    ...DEFAULT_ROOM_ZONE_MATERIAL_IDS,
    ...zone.materialIds
  },
  color: zone.color || ['#7cc8a8', '#8fb7e8', '#e5b56c', '#d98f8f'][index % 4]
});

export const normalizeDesign = (design: DesignDocument): DesignDocument => ({
  ...design,
  version: DESIGN_DOCUMENT_VERSION,
  canvas: {
    ...design.canvas,
    scalePxPerMeter: design.canvas.scalePxPerMeter || 80
  },
  furniture: design.furniture.map(normalizeFurnitureInstance),
  roomZones: (design.roomZones ?? []).map(normalizeRoomZone),
  recognition: design.recognition
    ? {
        ...design.recognition,
        visible: design.recognition.visible ?? true,
        opacity: design.recognition.opacity ?? 0.72,
        locked: design.recognition.locked ?? false,
        selectedWallIds: design.recognition.selectedWallIds ?? [],
        walls: design.recognition.walls.map(normalizeRecognitionWall),
        wallCount: design.recognition.walls.map(normalizeRecognitionWall).filter((wall) => wall.status !== 'deleted').length,
        confidence: design.recognition.confidence ?? '中',
        parameters: {
          mode: design.recognition.parameters?.mode ?? 'complete',
          gridSize: design.recognition.parameters?.gridSize ?? design.canvas.gridSize,
          minWallLength: design.recognition.parameters?.minWallLength ?? design.canvas.gridSize * 3,
          rawWallCount: design.recognition.parameters?.rawWallCount ?? design.recognition.walls.length,
          candidateWallCount: design.recognition.parameters?.candidateWallCount ?? design.recognition.walls.length,
          inferredWallCount:
            design.recognition.parameters?.inferredWallCount ??
            design.recognition.walls.filter((wall) => wall.source === 'inferred').length
        }
      }
    : undefined,
  renderSettings: {
    ...DEFAULT_RENDER_SETTINGS,
    ...design.renderSettings
  },
  cloudTasks: design.cloudTasks ?? [],
  favoriteFurnitureIds: design.favoriteFurnitureIds ?? [],
  favoriteFurnitureComboIds: design.favoriteFurnitureComboIds ?? [],
  materialBrush: {
    ...DEFAULT_MATERIAL_BRUSH,
    ...(design.materialBrush ?? {})
  },
  estimateSettings: {
    ...DEFAULT_ESTIMATE_SETTINGS,
    ...design.estimateSettings,
    materialOverrides: {
      ...DEFAULT_ESTIMATE_SETTINGS.materialOverrides,
      ...(design.estimateSettings?.materialOverrides ?? {})
    }
  },
  customEstimateItems: design.customEstimateItems ?? [],
  features: {
    ...createDefaultFeatureStates(),
    ...(design.features ?? {})
  },
  projectMeta: design.projectMeta ?? {},
  exportHistory: design.exportHistory ?? [],
  collaborationDraft: design.collaborationDraft ?? DEFAULT_COLLABORATION_DRAFT,
  mobileCaptureDraft: design.mobileCaptureDraft ?? DEFAULT_MOBILE_CAPTURE_DRAFT,
  aiDesignDraft: design.aiDesignDraft ?? DEFAULT_AI_DESIGN_DRAFT,
  modelExportDraft: design.modelExportDraft ?? DEFAULT_MODEL_EXPORT_DRAFT
});
