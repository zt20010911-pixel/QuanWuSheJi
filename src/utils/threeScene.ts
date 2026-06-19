import * as THREE from 'three';
import type { DesignDocument, FurnitureInstance, Opening, Point, RenderSettings, Wall } from '../types';
import { DEFAULT_RENDER_SETTINGS } from './designMigration';

const WALL_HEIGHT_METERS = 2.8;
const MIN_WALL_THICKNESS_METERS = 0.08;

const MATERIAL_PRESETS: Record<
  RenderSettings['materialMode'],
  {
    wall: string;
    floor: string;
    roughness: number;
  }
> = {
  clean: {
    wall: '#f2efe8',
    floor: '#d8c7aa',
    roughness: 0.78
  },
  warm: {
    wall: '#f3eadc',
    floor: '#caa77b',
    roughness: 0.72
  },
  contrast: {
    wall: '#e7e9e6',
    floor: '#8f9c91',
    roughness: 0.68
  }
};

type PlanBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  center: Point;
  widthMeters: number;
  depthMeters: number;
};

const pxToMeters = (value: number, scalePxPerMeter: number) => value / scalePxPerMeter;

const pointToWorld = (point: Point, bounds: PlanBounds, scalePxPerMeter: number) => ({
  x: pxToMeters(point.x - bounds.center.x, scalePxPerMeter),
  z: pxToMeters(point.y - bounds.center.y, scalePxPerMeter)
});

const getWallAngle = (wall: Wall) => Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);

const getFurnitureHeightMeters = (furniture: FurnitureInstance) => {
  if (furniture.height) {
    return furniture.height;
  }

  if (furniture.shape === 'bed') {
    return 0.45;
  }

  if (furniture.shape === 'sofa') return 0.75;
  if (furniture.shape === 'cabinet') return 0.9;
  if (furniture.shape === 'storage') return 2.1;
  if (furniture.shape === 'sanitary') return 0.55;
  if (furniture.shape === 'appliance') return 1.2;
  return 0.72;
};

const collectPlanBounds = (design: DesignDocument): PlanBounds => {
  const points: Point[] = [];

  design.walls.forEach((wall) => {
    points.push(wall.start, wall.end);
  });

  design.furniture.forEach((furniture) => {
    points.push({ x: furniture.x, y: furniture.y });
  });

  if (points.length === 0) {
    points.push({ x: 0, y: 0 }, { x: design.canvas.width, y: design.canvas.height });
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const paddingPx = design.canvas.scalePxPerMeter * 0.8;
  const paddedMinX = minX - paddingPx;
  const paddedMinY = minY - paddingPx;
  const paddedMaxX = maxX + paddingPx;
  const paddedMaxY = maxY + paddingPx;

  return {
    minX: paddedMinX,
    minY: paddedMinY,
    maxX: paddedMaxX,
    maxY: paddedMaxY,
    center: {
      x: (paddedMinX + paddedMaxX) / 2,
      y: (paddedMinY + paddedMaxY) / 2
    },
    widthMeters: pxToMeters(paddedMaxX - paddedMinX, design.canvas.scalePxPerMeter),
    depthMeters: pxToMeters(paddedMaxY - paddedMinY, design.canvas.scalePxPerMeter)
  };
};

const resolveRenderSettings = (design: DesignDocument): RenderSettings => ({
  ...DEFAULT_RENDER_SETTINGS,
  ...design.renderSettings
});

const createWallMesh = (wall: Wall, bounds: PlanBounds, scalePxPerMeter: number, settings: RenderSettings) => {
  const start = pointToWorld(wall.start, bounds, scalePxPerMeter);
  const end = pointToWorld(wall.end, bounds, scalePxPerMeter);
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const thickness = Math.max(pxToMeters(wall.thickness, scalePxPerMeter), MIN_WALL_THICKNESS_METERS);
  const geometry = new THREE.BoxGeometry(length, WALL_HEIGHT_METERS, thickness);
  const material = new THREE.MeshStandardMaterial({
    color: settings.wallMaterial || MATERIAL_PRESETS[settings.materialMode].wall,
    roughness: MATERIAL_PRESETS[settings.materialMode].roughness
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set((start.x + end.x) / 2, WALL_HEIGHT_METERS / 2, (start.z + end.z) / 2);
  mesh.rotation.y = -getWallAngle(wall);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
};

const createOpeningMesh = (opening: Opening, bounds: PlanBounds, design: DesignDocument) => {
  const point = pointToWorld({ x: opening.x, y: opening.y }, bounds, design.canvas.scalePxPerMeter);
  const wall = design.walls.find((item) => item.id === opening.wallId);
  const width = opening.width / 100;
  const height = opening.kind === 'door' ? 2.05 : 1.1;
  const y = opening.kind === 'door' ? height / 2 : 1.45;
  const thickness = wall ? Math.max(pxToMeters(wall.thickness, design.canvas.scalePxPerMeter), MIN_WALL_THICKNESS_METERS) + 0.04 : 0.14;
  const geometry = new THREE.BoxGeometry(width, height, thickness);
  const material = new THREE.MeshStandardMaterial({
    color: opening.kind === 'door' ? '#9b6a3a' : '#3486a8',
    roughness: 0.5,
    transparent: true,
    opacity: opening.kind === 'door' ? 0.82 : 0.72
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(point.x, y, point.z);
  mesh.rotation.y = -THREE.MathUtils.degToRad(opening.rotation);

  return mesh;
};

const createFurnitureMesh = (furniture: FurnitureInstance, bounds: PlanBounds, scalePxPerMeter: number, settings: RenderSettings) => {
  const point = pointToWorld({ x: furniture.x, y: furniture.y }, bounds, scalePxPerMeter);
  const width = furniture.width / 100;
  const depth = furniture.depth / 100;
  const height = getFurnitureHeightMeters(furniture);
  const material = new THREE.MeshStandardMaterial({
    color: furniture.color,
    roughness: settings.materialMode === 'contrast' ? 0.52 : 0.64,
    metalness: furniture.material === '金属' || furniture.shape === 'appliance' ? 0.12 : 0
  });
  const geometry =
    furniture.shape === 'round'
      ? new THREE.CylinderGeometry(Math.max(width, depth) / 2, Math.max(width, depth) / 2, height, 40)
      : new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(point.x, height / 2, point.z);
  mesh.rotation.y = -THREE.MathUtils.degToRad(furniture.rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
};

const createGroundMesh = (bounds: PlanBounds, settings: RenderSettings) => {
  const geometry = new THREE.PlaneGeometry(bounds.widthMeters, bounds.depthMeters);
  const material = new THREE.MeshStandardMaterial({
    color: settings.floorMaterial || MATERIAL_PRESETS[settings.materialMode].floor,
    roughness: MATERIAL_PRESETS[settings.materialMode].roughness
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.01;
  mesh.receiveShadow = true;

  return mesh;
};

const createBackgroundReferenceMesh = (design: DesignDocument, bounds: PlanBounds) => {
  const backgroundImage = design.backgroundImage;

  if (!backgroundImage?.visible || !design.renderSettings?.showBackgroundIn3D) {
    return null;
  }

  const loader = new THREE.TextureLoader();
  const texture = loader.load(backgroundImage.dataUrl);
  texture.colorSpace = THREE.SRGBColorSpace;

  const width = pxToMeters(backgroundImage.width, design.canvas.scalePxPerMeter);
  const depth = pxToMeters(backgroundImage.height, design.canvas.scalePxPerMeter);
  const center = pointToWorld(
    {
      x: backgroundImage.x + backgroundImage.width / 2,
      y: backgroundImage.y + backgroundImage.height / 2
    },
    bounds,
    design.canvas.scalePxPerMeter
  );
  const geometry = new THREE.PlaneGeometry(width, depth);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: Math.min(backgroundImage.opacity, 0.42),
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(center.x, 0.004, center.z);

  return mesh;
};

export const buildThreeDesignScene = (design: DesignDocument) => {
  const bounds = collectPlanBounds(design);
  const settings = resolveRenderSettings(design);
  const group = new THREE.Group();

  group.add(createGroundMesh(bounds, settings));
  const backgroundReference = createBackgroundReferenceMesh(design, bounds);

  if (backgroundReference) {
    group.add(backgroundReference);
  }

  design.walls.forEach((wall) => group.add(createWallMesh(wall, bounds, design.canvas.scalePxPerMeter, settings)));
  design.openings.forEach((opening) => group.add(createOpeningMesh(opening, bounds, design)));
  design.furniture.forEach((furniture) =>
    group.add(createFurnitureMesh(furniture, bounds, design.canvas.scalePxPerMeter, settings))
  );

  return {
    group,
    widthMeters: bounds.widthMeters,
    depthMeters: bounds.depthMeters
  };
};

export const disposeThreeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;

    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
};
