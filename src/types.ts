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

export const DESIGN_DOCUMENT_VERSION = 16;

export type Selection =
  | { type: 'wall'; id: string }
  | { type: 'recognitionWall'; id: string }
  | { type: 'recognitionOpeningCandidate'; id: string }
  | { type: 'recognitionRoomCandidate'; id: string }
  | { type: 'recognitionIssueMarker'; id: string }
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
  supplierNote?: string;
  modelSource?: 'local-upload' | 'catalog-draft' | 'manual';
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
  modelAssetId?: string;
  modelTransform?: ModelAssetTransform;
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

export type ImportedModelFormat = 'glb' | 'gltf' | 'obj';

export type ModelAssetTransform = {
  scale: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  offsetY: number;
};

export type ImportedModelAsset = {
  id: string;
  name: string;
  fileName: string;
  format: ImportedModelFormat;
  sizeBytes: number;
  dataUrl: string;
  category: string;
  importedAt: string;
  transform: ModelAssetTransform;
};

export type ProductCatalogItem = {
  id: string;
  name: string;
  category: string;
  brand?: string;
  series?: string;
  sku?: string;
  referencePrice?: number;
  productUrl?: string;
  imageUrl?: string;
  modelAssetId?: string;
  note?: string;
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

export type RecognitionProfile = 'balanced' | 'wall-priority' | 'clean';

export type RecognitionPass = 'dark' | 'gray-structure' | 'sampled-color' | 'grid-completion';

export type RecognitionCropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RecognitionSampledWallColor = {
  r: number;
  g: number;
  b: number;
  tolerance: number;
};

export type RecognitionIssueMarkerType = 'endpoint' | 'missing-wall' | 'outer-gap' | 'furniture-noise';

export type RecognitionIssueMarkerStatus = 'active' | 'ignored' | 'resolved';

export type RecognitionIssueMarker = {
  id: string;
  type: RecognitionIssueMarkerType;
  x: number;
  y: number;
  message: string;
  suggestion: 'create-wall' | 'inspect' | 'ignore';
  status: RecognitionIssueMarkerStatus;
  relatedWallIds?: string[];
  proposedWall?: Wall;
};

export type RecognitionAttemptSnapshot = {
  id: string;
  createdAt: string;
  profile: RecognitionProfile;
  mode: RecognitionMode;
  wallCount: number;
  openingCandidateCount: number;
  roomCandidateCount: number;
  outerFrameCoverage: number;
  disconnectedEndpointCount: number;
  missingWallHintCount: number;
  qualityScore: number;
};

export type RecognitionWorkspaceStep = 'range' | 'recognize' | 'review' | 'promote';

export type RecognitionWorkspaceTool = 'crop' | 'sample-color' | 'select-candidate' | 'add-gap-wall';

export type RecognitionWorkspaceState = {
  step: RecognitionWorkspaceStep;
  activeTool: RecognitionWorkspaceTool;
  showLowConfidence: boolean;
  showIssueMarkers: boolean;
};

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
  completionScore: number;
  disconnectedEndpointCount: number;
  lowConfidenceCount: number;
  possibleFurnitureNoiseCount: number;
  noiseScore: number;
  missingWallHintCount: number;
  outerGapMarkers: RecognitionIssueMarker[];
  issueMarkers: RecognitionIssueMarker[];
  qualityScore: number;
  actionableSuggestion: string;
  suggestionMessages: string[];
};

export type RecognitionCandidateFilters = {
  showWalls: boolean;
  showOpenings: boolean;
  showRooms: boolean;
  showLowConfidence: boolean;
  showLowConfidenceOnly: boolean;
  showMediumConfidence: boolean;
  showHighConfidence: boolean;
  showIssueMarkers: boolean;
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
  workspace?: RecognitionWorkspaceState;
  aiRecognitionDraft?: AiRecognitionDraft;
  attemptHistory?: RecognitionAttemptSnapshot[];
  wallCount: number;
  horizontalCount: number;
  verticalCount: number;
  confidence: '低' | '中' | '高';
  parameters: {
    mode: RecognitionMode;
    profile: RecognitionProfile;
    cropBox?: RecognitionCropBox;
    sampledWallColor?: RecognitionSampledWallColor;
    passes: RecognitionPass[];
    gridSize: number;
    minWallLength: number;
    rawWallCount: number;
    candidateWallCount: number;
    inferredWallCount: number;
    scanWallCount?: number;
    bridgeWallCount?: number;
    hintWallCount?: number;
    lowConfidenceHidden?: boolean;
  };
};

export type RenderLightMode = 'daylight' | 'warm' | 'studio';

export type RenderCameraPreset = 'overview' | 'corner' | 'front' | 'top' | 'walkthrough';

export type RenderMaterialMode = 'clean' | 'warm' | 'contrast';

export type RenderEnvironmentMode = 'studio' | 'daylight' | 'evening';

export type RenderShadowQuality = 'low' | 'medium' | 'high';

export type RenderMaterialDetail = 'basic' | 'enhanced';

export type ThreeVector = {
  x: number;
  y: number;
  z: number;
};

export type CameraViewpoint = {
  id: string;
  name: string;
  position: ThreeVector;
  target: ThreeVector;
  fov: number;
  createdAt: string;
};

export type WalkthroughKeyframe = {
  id: string;
  name: string;
  position: ThreeVector;
  target: ThreeVector;
  fov: number;
  durationSeconds: number;
};

export type WalkthroughPath = {
  id: string;
  name: string;
  keyframes: WalkthroughKeyframe[];
  createdAt: string;
};

export type RenderSettings = {
  cameraPreset: RenderCameraPreset;
  lightMode: RenderLightMode;
  materialMode: RenderMaterialMode;
  environmentMode: RenderEnvironmentMode;
  exportPixelRatio: 1 | 2 | 3;
  shadowQuality: RenderShadowQuality;
  materialDetail: RenderMaterialDetail;
  wallMaterial: string;
  floorMaterial: string;
  showBackgroundIn3D: boolean;
  showRoomMaterialsIn3D: boolean;
  showCeilingHint: boolean;
  cameraViewpoints: CameraViewpoint[];
  activeViewpointId?: string;
  walkthroughPaths: WalkthroughPath[];
  activeWalkthroughPathId?: string;
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
    | 'obj-draft'
    | 'share-package';
  fileName: string;
  createdAt: string;
};

export type MobileCaptureImportSource = 'lidar' | 'ar' | 'photo' | 'manual' | 'magicplan-draft' | 'phone-json';

export type MobileCapturePhoto = {
  id: string;
  fileName: string;
  dataUrl: string;
  note?: string;
};

export type MobileCaptureImport = {
  id: string;
  source: MobileCaptureImportSource;
  fileName: string;
  importedAt: string;
  roomCount: number;
  wallCount: number;
  photoCount: number;
  note: string;
  rawData: unknown;
  photos: MobileCapturePhoto[];
};

export type MobileCaptureDraft = {
  enabled: boolean;
  source: MobileCaptureImportSource;
  note: string;
  imports: MobileCaptureImport[];
};

export type CollaborationDraft = {
  enabled: boolean;
  shareId?: string;
  role: 'owner' | 'viewer' | 'editor';
  note: string;
};

export type SharePackageDraft = {
  enabled: boolean;
  shareId?: string;
  lastExportedAt?: string;
  includePlanImage: boolean;
  includeJson: boolean;
  includeBudget: boolean;
  note: string;
};

export type CloudSaveStatus = 'local-only' | 'draft' | 'queued' | 'synced' | 'conflict';

export type CloudSaveDraft = {
  enabled: boolean;
  projectId?: string;
  status: CloudSaveStatus;
  lastSyncedAt?: string;
  conflictStrategy: 'keep-local' | 'keep-cloud' | 'manual';
  endpointDraft?: string;
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
  sharePackageDraft?: SharePackageDraft;
  cloudSaveDraft?: CloudSaveDraft;
  aiDesignDraft?: AiDesignDraft;
  modelExportDraft?: ModelExportDraft;
  importedModelAssets?: ImportedModelAsset[];
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
