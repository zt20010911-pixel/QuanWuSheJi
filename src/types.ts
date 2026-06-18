export type Point = {
  x: number;
  y: number;
};

export type ToolMode = 'select' | 'wall' | 'door' | 'window' | 'pan' | 'calibrate';

export type Selection =
  | { type: 'wall'; id: string }
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

export type DesignDocument = {
  id: string;
  name: string;
  updatedAt: string;
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
};

export type DesignTemplate = {
  id: string;
  name: string;
  description: string;
  design: DesignDocument;
};
