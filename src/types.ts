export type Point = {
  x: number;
  y: number;
};

export type ToolMode =
  | 'select'
  | 'wall'
  | 'door'
  | 'window'
  | 'pan'
  | 'calibrate'
  | 'recognition-wall'
  | 'room-zone'
  | 'material-brush';

export type ViewMode = 'plan' | 'threeD';

export type WallDrawMode = 'single' | 'continuous';

export const DESIGN_DOCUMENT_VERSION = 10;

export type Selection =
  | { type: 'wall'; id: string }
  | { type: 'recognitionWall'; id: string }
  | { type: 'recognitionOpeningCandidate'; id: string }
  | { type: 'recognitionRoomCandidate'; id: string }
  | { type: 'opening'; id: string }
  | { type: 'furniture'; id: string }
  | { type: 'furnitureGroup'; id: string }
  | { type: 'room'; id: string }
  | { type: 'roomZone'; id: string };

export type Wall = {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  roomId?: string;
};

export type OpeningKind = 'door' | 'window';

export type Opening = {
  id: string;
  kind: OpeningKind;
  wallId: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
};

export type FurnitureShape =
  | 'rect'
  | 'round'
  | 'bed'
  | 'sofa'
  | 'dining'
  | 'cabinet'
  | 'sanitary'
  | 'appliance'
  | 'desk'
  | 'storage';

export type FurnitureModelType = 'procedural' | 'placeholder' | 'external-draft';

export type FurnitureProductInfo = {
  brand?: string;
  series?: string;
  sku?: string;
  referencePrice?: number;
  productUrl?: string;
  imageUrl?: string;
  isRealProduct: boolean;
};

export type FurnitureMaterialCategory = 'wood' | 'fabric' | 'leather' | 'metal' | 'glass' | 'stone' | 'ceramic' | 'plastic';

export type FurnitureMaterialDefinition = {
  id: string;
  name: string;
  category: FurnitureMaterialCategory;
  color: string;
  textureType: 'solid' | 'grain' | 'woven' | 'gloss' | 'matte';
  roughness: number;
  metalness: number;
  suitableShapes: FurnitureShape[];
};

export type FurnitureDefinition = {
  id: string;
  category: string;
  subcategory?: string;
  name: string;
  width: number;
  depth: number;
  height?: number;
  material?: string;
  materialId?: string;
  materialOverrides?: Record<string, string>;
  favorite?: boolean;
  recommendedRooms?: string[];
  styleTags?: string[];
  modelType?: FurnitureModelType;
  modelVariant?: string;
  product?: FurnitureProductInfo;
  groupId?: string;
  groupName?: string;
  comboDefinitionId?: string;
  color: string;
  accentColor: string;
  shape: FurnitureShape;
};

export type FurnitureInstance = FurnitureDefinition & {
  instanceId: string;
  x: number;
  y: number;
  rotation: number;
};

export type FurnitureComboItem = {
  furnitureId: string;
  offsetX: number;
  offsetY: number;
  rotation?: number;
};

export type FurnitureComboDefinition = {
  id: string;
  name: string;
  category: string;
  styleTags: string[];
  defaultRoom: string;
  width: number;
  depth: number;
  items: FurnitureComboItem[];
};

export type MaterialBrushTarget = 'furniture' | 'floor' | 'wall' | 'ceiling';

export type MaterialBrushState = {
  materialId: string;
  target: MaterialBrushTarget;
};

export type RoomLabel = {
  id: string;
  name: string;
  x: number;
  y: number;
  area: string;
};

export type FeatureModuleStatus = 'available' | 'beta' | 'planned' | 'external-required';

export type FeatureModuleKey =
  | 'floorplan-recognition'
  | 'two-d-editing'
  | 'three-d-rendering'
  | 'furniture-materials'
  | 'estimate-report'
  | 'mobile-capture'
  | 'cloud-collaboration'
  | 'ai-design'
  | 'format-io';

export type RoadmapModule = {
  key: FeatureModuleKey;
  title: string;
  description: string;
  status: FeatureModuleStatus;
  benchmark: string;
  version: string;
};

export type MaterialCategory = 'floor' | 'wall' | 'ceiling' | 'construction' | 'opening';

export type MaterialDefinition = {
  id: string;
  category: MaterialCategory;
  name: string;
  unit: '㎡' | 'm' | '项' | '个';
  unitPrice: number;
  wasteRate: number;
  color: string;
};

export type RoomZoneMaterialIds = {
  floor: string;
  wall: string;
  ceiling: string;
};

export type RoomZone = {
  id: string;
  name: string;
  points: Point[];
  label: Point;
  manualAreaSqm?: number;
  materialIds: RoomZoneMaterialIds;
  color: string;
};

export type EstimateSettings = {
  currency: 'CNY';
  wallHeightMeters: number;
  includeWaste: boolean;
  priceTemplateVersion: string;
  wasteRate: number;
  materialOverrides: Record<string, number>;
};

export type EstimateItem = {
  id: string;
  category: MaterialCategory | 'furniture' | 'custom';
  name: string;
  roomZoneId?: string;
  roomName?: string;
  unit: MaterialDefinition['unit'];
  quantity: number;
  unitPrice: number;
  wasteRate: number;
  total: number;
  source: 'auto' | 'custom';
};

export type BackgroundImageCalibration = {
  start?: Point;
  end?: Point;
  realLengthMeters?: number;
  pixelsPerMeter?: number;
  calibratedAt?: string;
};

export type BackgroundImage = {
  dataUrl: string;
  fileName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  calibration?: BackgroundImageCalibration;
};

export type RecognitionStatus = 'draft' | 'confirmed';

export type RecognitionMode = 'complete' | 'precise';

export type RecognitionCandidateStatus = 'active' | 'deleted' | 'promoted';

export type RecognitionCandidateSource = 'scan' | 'gap' | 'graph' | 'inferred' | 'manual' | 'ai-draft';

export type RecognitionWallSource = RecognitionCandidateSource | 'merged';

export type RecognitionWallStatus = RecognitionCandidateStatus;

export type RecognitionWall = Wall & {
  status: RecognitionWallStatus;
  confidence?: number;
  source?: RecognitionWallSource;
  promotedWallId?: string;
  updatedAt?: string;
};

export type RecognitionOpeningCandidate = {
  id: string;
  kind: OpeningKind;
  wallId?: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
  status: RecognitionCandidateStatus;
  confidence?: number;
  source?: RecognitionCandidateSource;
  promotedOpeningId?: string;
  updatedAt?: string;
};

export type RecognitionRoomCandidate = {
  id: string;
  name?: string;
  points: Point[];
  label: Point;
  areaSqm?: number;
  status: RecognitionCandidateStatus;
  confidence?: number;
  source?: RecognitionCandidateSource;
  promotedRoomZoneId?: string;
  updatedAt?: string;
};

export type RecognitionQualityReport = {
  outerFrameCoverage: number;
  disconnectedEndpointCount: number;
  lowConfidenceCount: number;
  possibleFurnitureNoiseCount: number;
  suggestionMessages: string[];
};

export type RecognitionCandidateFilters = {
  showWalls: boolean;
  showOpenings: boolean;
  showRooms: boolean;
  showLowConfidenceOnly: boolean;
  showDeleted: boolean;
  showPromoted: boolean;
};

export type AiRecognitionDraft = {
  id: string;
  status: 'draft';
  createdAt: string;
  sourceFileName: string;
  mode: RecognitionMode;
  inputSnapshot: {
    backgroundFileName: string;
    scalePxPerMeter: number;
    gridSize: number;
  };
  note: string;
};

export type RecognitionSession = {
  id: string;
  createdAt: string;
  sourceFileName: string;
  status: RecognitionStatus;
  visible: boolean;
  opacity: number;
  locked: boolean;
  selectedWallIds: string[];
  selectedOpeningCandidateIds?: string[];
  selectedRoomCandidateIds?: string[];
  walls: RecognitionWall[];
  openingCandidates?: RecognitionOpeningCandidate[];
  roomCandidates?: RecognitionRoomCandidate[];
  qualityReport?: RecognitionQualityReport;
  candidateFilters?: RecognitionCandidateFilters;
  aiRecognitionDraft?: AiRecognitionDraft;
  wallCount: number;
  horizontalCount: number;
  verticalCount: number;
  confidence: '低' | '中' | '高';
  parameters: {
    mode: RecognitionMode;
    gridSize: number;
    minWallLength: number;
    rawWallCount: number;
    candidateWallCount: number;
    inferredWallCount: number;
  };
};

export type RenderLightMode = 'daylight' | 'warm' | 'studio';

export type RenderCameraPreset = 'overview' | 'corner' | 'front' | 'top' | 'walkthrough';

export type RenderMaterialMode = 'clean' | 'warm' | 'contrast';

export type RenderEnvironmentMode = 'studio' | 'daylight' | 'evening';

export type RenderSettings = {
  cameraPreset: RenderCameraPreset;
  lightMode: RenderLightMode;
  materialMode: RenderMaterialMode;
  environmentMode: RenderEnvironmentMode;
  exportPixelRatio: 1 | 2 | 3;
  wallMaterial: string;
  floorMaterial: string;
  showBackgroundIn3D: boolean;
  showRoomMaterialsIn3D: boolean;
  showCeilingHint: boolean;
};

export type CloudTaskDraft = {
  id: string;
  kind: 'ai-render' | 'floorplan-recognition';
  status: 'draft' | 'idle';
  createdAt: string;
  inputDesignId: string;
  inputSnapshot?: DesignDocument;
  resultUrl?: string;
  note?: string;
};

export type ProjectMeta = {
  clientName?: string;
  address?: string;
  designerName?: string;
  notes?: string;
};

export type PrintPaperSize = 'A4' | 'A3';

export type PrintOrientation = 'portrait' | 'landscape';

export type PrintScaleMode = 'fit' | 'fixed';

export type PrintSettings = {
  paperSize: PrintPaperSize;
  orientation: PrintOrientation;
  scaleMode: PrintScaleMode;
  showBackground: boolean;
  showGrid: boolean;
  showWallLengths: boolean;
  showRoomAreas: boolean;
  showLegend: boolean;
  showBudgetSummary: boolean;
};

export type ExportDraftSettings = {
  includeBackgroundInSvg: boolean;
  includeRecognitionLayer: boolean;
  dxfUnit: 'meter' | 'millimeter';
  modelUnit: 'meter';
  draftNotice: string;
};

export type ExportHistoryEntry = {
  id: string;
  kind:
    | 'png'
    | 'json'
    | 'html-report'
    | 'csv-estimate'
    | '3d-png'
    | 'svg-plan'
    | 'pdf-report'
    | 'print-layout'
    | 'dxf-draft'
    | 'glb-draft'
    | 'obj-draft';
  fileName: string;
  createdAt: string;
};

export type MobileCaptureDraft = {
  enabled: boolean;
  source: 'lidar' | 'ar' | 'photo' | 'manual';
  note: string;
};

export type CollaborationDraft = {
  enabled: boolean;
  shareId?: string;
  role: 'owner' | 'viewer' | 'editor';
  note: string;
};

export type AiDesignDraft = {
  enabled: boolean;
  prompt: string;
  status: 'draft' | 'planned';
};

export type ModelExportDraft = {
  formats: Array<'GLB' | 'OBJ' | 'DXF' | 'PDF'>;
  status: 'planned';
  note: string;
};

export type DesignDocument = {
  version?: number;
  id: string;
  name: string;
  updatedAt: string;
  homeAreaSqm?: number;
  canvas: {
    width: number;
    height: number;
    gridSize: number;
    scalePxPerMeter: number;
  };
  walls: Wall[];
  openings: Opening[];
  furniture: FurnitureInstance[];
  rooms: RoomLabel[];
  roomZones?: RoomZone[];
  estimateSettings?: EstimateSettings;
  customEstimateItems?: EstimateItem[];
  features?: Record<FeatureModuleKey, FeatureModuleStatus>;
  projectMeta?: ProjectMeta;
  exportHistory?: ExportHistoryEntry[];
  printSettings?: PrintSettings;
  exportDraftSettings?: ExportDraftSettings;
  collaborationDraft?: CollaborationDraft;
  mobileCaptureDraft?: MobileCaptureDraft;
  aiDesignDraft?: AiDesignDraft;
  modelExportDraft?: ModelExportDraft;
  backgroundImage?: BackgroundImage;
  recognition?: RecognitionSession;
  renderSettings?: RenderSettings;
  cloudTasks?: CloudTaskDraft[];
  favoriteFurnitureIds?: string[];
  favoriteFurnitureComboIds?: string[];
  materialBrush?: MaterialBrushState;
};

export type DesignTemplate = {
  id: string;
  name: string;
  description: string;
  design: DesignDocument;
};
