export type Point = {
  x: number;
  y: number;
};

export type ToolMode = 'select' | 'wall' | 'door' | 'window' | 'pan' | 'calibrate' | 'recognition-wall';

export type ViewMode = 'plan' | 'threeD';

export const DESIGN_DOCUMENT_VERSION = 3;

export type Selection =
  | { type: 'wall'; id: string }
  | { type: 'recognitionWall'; id: string }
  | { type: 'opening'; id: string }
  | { type: 'furniture'; id: string }
  | { type: 'room'; id: string };

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

export type FurnitureDefinition = {
  id: string;
  category: string;
  name: string;
  width: number;
  depth: number;
  height?: number;
  material?: string;
  favorite?: boolean;
  recommendedRooms?: string[];
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

export type RoomLabel = {
  id: string;
  name: string;
  x: number;
  y: number;
  area: string;
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

export type RecognitionWallStatus = 'active' | 'deleted' | 'promoted';

export type RecognitionWall = Wall & {
  status: RecognitionWallStatus;
  promotedWallId?: string;
  updatedAt?: string;
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
  walls: RecognitionWall[];
  wallCount: number;
  horizontalCount: number;
  verticalCount: number;
  confidence: '低' | '中' | '高';
  parameters: {
    gridSize: number;
    minWallLength: number;
  };
};

export type RenderLightMode = 'daylight' | 'warm' | 'studio';

export type RenderCameraPreset = 'overview' | 'corner' | 'front';

export type RenderMaterialMode = 'clean' | 'warm' | 'contrast';

export type RenderSettings = {
  cameraPreset: RenderCameraPreset;
  lightMode: RenderLightMode;
  materialMode: RenderMaterialMode;
  wallMaterial: string;
  floorMaterial: string;
  showBackgroundIn3D: boolean;
};

export type CloudTaskDraft = {
  id: string;
  kind: 'ai-render';
  status: 'draft' | 'idle';
  createdAt: string;
  inputDesignId: string;
  inputSnapshot?: DesignDocument;
  resultUrl?: string;
  note?: string;
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
  backgroundImage?: BackgroundImage;
  recognition?: RecognitionSession;
  renderSettings?: RenderSettings;
  cloudTasks?: CloudTaskDraft[];
  favoriteFurnitureIds?: string[];
};

export type DesignTemplate = {
  id: string;
  name: string;
  description: string;
  design: DesignDocument;
};
