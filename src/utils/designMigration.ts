import { DESIGN_DOCUMENT_VERSION, type DesignDocument, type FurnitureInstance, type RenderSettings } from '../types';

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  cameraPreset: 'overview',
  lightMode: 'daylight',
  materialMode: 'clean',
  wallMaterial: '#f2efe8',
  floorMaterial: '#d8c7aa',
  showBackgroundIn3D: false
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

export const normalizeFurnitureInstance = (furniture: FurnitureInstance): FurnitureInstance => ({
  ...furniture,
  height: furniture.height ?? getDefaultFurnitureHeight(furniture),
  material: furniture.material ?? getDefaultFurnitureMaterial(furniture),
  favorite: furniture.favorite ?? false
});

export const normalizeDesign = (design: DesignDocument): DesignDocument => ({
  ...design,
  version: DESIGN_DOCUMENT_VERSION,
  canvas: {
    ...design.canvas,
    scalePxPerMeter: design.canvas.scalePxPerMeter || 80
  },
  furniture: design.furniture.map(normalizeFurnitureInstance),
  recognition: design.recognition
    ? {
        ...design.recognition,
        wallCount: design.recognition.wallCount ?? design.recognition.walls.length,
        confidence: design.recognition.confidence ?? '中',
        parameters: {
          gridSize: design.recognition.parameters?.gridSize ?? design.canvas.gridSize,
          minWallLength: design.recognition.parameters?.minWallLength ?? design.canvas.gridSize * 3
        }
      }
    : undefined,
  renderSettings: {
    ...DEFAULT_RENDER_SETTINGS,
    ...design.renderSettings
  },
  cloudTasks: design.cloudTasks ?? [],
  favoriteFurnitureIds: design.favoriteFurnitureIds ?? []
});
