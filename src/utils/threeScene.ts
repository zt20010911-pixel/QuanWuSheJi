import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { resolveFurnitureMaterial } from '../data/furnitureMaterials';
import { DEFAULT_ROOM_ZONE_MATERIAL_IDS, MATERIAL_LIBRARY } from '../data/materials';
import type {
  DesignDocument,
  FurnitureInstance,
  FurnitureMaterialDefinition,
  ImportedModelAsset,
  ModelAssetTransform,
  Opening,
  Point,
  RenderSettings,
  RoomZone,
  Wall
} from '../types';
import { DEFAULT_RENDER_SETTINGS } from './designMigration';

const WALL_HEIGHT_METERS = 2.8;
const MIN_WALL_THICKNESS_METERS = 0.08;

export const RENDER_ENVIRONMENT_PRESETS: Record<
  RenderSettings['environmentMode'],
  {
    background: string;
    fog: string;
    ambientSky: string;
    ambientGround: string;
    ambientIntensity: number;
    sunColor: string;
    sunIntensity: number;
    sunPosition: [number, number, number];
  }
> = {
  studio: {
    background: '#eef2ef',
    fog: '#eef2ef',
    ambientSky: '#ffffff',
    ambientGround: '#d7dfdc',
    ambientIntensity: 2.05,
    sunColor: '#ffffff',
    sunIntensity: 1.6,
    sunPosition: [3, 7, 4]
  },
  daylight: {
    background: '#eaf2f5',
    fog: '#eaf2f5',
    ambientSky: '#ffffff',
    ambientGround: '#c8d4cf',
    ambientIntensity: 1.8,
    sunColor: '#fff7e8',
    sunIntensity: 2.25,
    sunPosition: [5, 8, 6]
  },
  evening: {
    background: '#f3ede5',
    fog: '#f3ede5',
    ambientSky: '#fff1db',
    ambientGround: '#dbc6ad',
    ambientIntensity: 1.55,
    sunColor: '#ffc071',
    sunIntensity: 1.85,
    sunPosition: [-4, 5.8, 5]
  }
};

const MATERIAL_PRESETS: Record<
  RenderSettings['materialMode'],
  {
    wall: string;
    floor: string;
    roughness: number;
    metalness: number;
  }
> = {
  clean: {
    wall: '#f2efe8',
    floor: '#d8c7aa',
    roughness: 0.78,
    metalness: 0.02
  },
  warm: {
    wall: '#f3eadc',
    floor: '#caa77b',
    roughness: 0.72,
    metalness: 0.03
  },
  contrast: {
    wall: '#e7e9e6',
    floor: '#8f9c91',
    roughness: 0.66,
    metalness: 0.05
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

const resolveRenderSettings = (design: DesignDocument): RenderSettings => ({
  ...DEFAULT_RENDER_SETTINGS,
  ...design.renderSettings
});

const resolveMaterialColor = (materialId: string | undefined, fallback: string) =>
  MATERIAL_LIBRARY.find((item) => item.id === materialId)?.color ?? fallback;

const createProceduralTexture = (color: string, textureType: FurnitureMaterialDefinition['textureType']) => {
  const size = 96;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = size;
  canvas.height = size;

  if (!context) {
    return undefined;
  }

  const base = new THREE.Color(color);
  const light = base.clone().offsetHSL(0, -0.04, 0.16).getStyle();
  const dark = base.clone().offsetHSL(0, 0.03, -0.12).getStyle();

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  if (textureType === 'grain') {
    for (let y = 8; y < size; y += 14) {
      context.strokeStyle = y % 28 === 0 ? dark : light;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(24, y - 6, 42, y + 8, size, y - 2);
      context.stroke();
    }
  } else if (textureType === 'woven') {
    context.strokeStyle = light;
    context.lineWidth = 1;
    for (let value = 0; value <= size; value += 12) {
      context.beginPath();
      context.moveTo(value, 0);
      context.lineTo(value, size);
      context.moveTo(0, value);
      context.lineTo(size, value);
      context.stroke();
    }
  } else if (textureType === 'gloss') {
    const gradient = context.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, 'rgba(255,255,255,0.38)');
    gradient.addColorStop(0.42, 'rgba(255,255,255,0.04)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.1)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  } else if (textureType === 'matte') {
    context.fillStyle = dark;
    for (let x = 6; x < size; x += 18) {
      for (let y = 10; y < size; y += 18) {
        context.globalAlpha = 0.18;
        context.fillRect(x, y, 2, 2);
      }
    }
    context.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
};

const createStandardMaterial = ({
  color,
  roughness,
  metalness = 0,
  transparent = false,
  opacity = 1,
  materialDetail = 'basic',
  textureType = 'solid'
}: {
  color: string;
  roughness: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  materialDetail?: RenderSettings['materialDetail'];
  textureType?: FurnitureMaterialDefinition['textureType'];
}) => {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    transparent,
    opacity,
    envMapIntensity: 0.45
  });

  if (materialDetail === 'enhanced' && textureType !== 'solid') {
    const texture = createProceduralTexture(color, textureType);

    if (texture) {
      material.map = texture;
      material.envMapIntensity = textureType === 'gloss' ? 0.72 : 0.52;
      material.needsUpdate = true;
    }
  }

  return material;
};

const collectPlanBounds = (design: DesignDocument): PlanBounds => {
  const points: Point[] = [];

  design.walls.forEach((wall) => {
    points.push(wall.start, wall.end);
  });

  design.furniture.forEach((furniture) => {
    points.push({ x: furniture.x, y: furniture.y });
  });

  (design.roomZones ?? []).forEach((zone) => {
    points.push(...zone.points);
  });

  if (points.length === 0) {
    points.push({ x: 0, y: 0 }, { x: design.canvas.width, y: design.canvas.height });
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const paddingPx = design.canvas.scalePxPerMeter * 0.9;
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

const createGroundMesh = (bounds: PlanBounds, settings: RenderSettings) => {
  const geometry = new THREE.PlaneGeometry(bounds.widthMeters, bounds.depthMeters);
  const material = createStandardMaterial({
    color: settings.floorMaterial || MATERIAL_PRESETS[settings.materialMode].floor,
    roughness: MATERIAL_PRESETS[settings.materialMode].roughness,
    metalness: MATERIAL_PRESETS[settings.materialMode].metalness,
    materialDetail: settings.materialDetail,
    textureType: 'grain'
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.015;
  mesh.receiveShadow = true;
  return mesh;
};

const createRoomShapeGeometry = (zone: RoomZone, bounds: PlanBounds, scalePxPerMeter: number) => {
  if (zone.points.length < 3) {
    return null;
  }

  const worldPoints = zone.points.map((point) => pointToWorld(point, bounds, scalePxPerMeter));
  const shape = new THREE.Shape();

  shape.moveTo(worldPoints[0].x, -worldPoints[0].z);
  worldPoints.slice(1).forEach((point) => shape.lineTo(point.x, -point.z));
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
};

const createRoomMaterialMeshes = (design: DesignDocument, bounds: PlanBounds, settings: RenderSettings) => {
  const group = new THREE.Group();

  if (!settings.showRoomMaterialsIn3D) {
    return group;
  }

  (design.roomZones ?? []).forEach((zone, index) => {
    const geometry = createRoomShapeGeometry(zone, bounds, design.canvas.scalePxPerMeter);

    if (!geometry) {
      return;
    }

    const materialIds = { ...DEFAULT_ROOM_ZONE_MATERIAL_IDS, ...zone.materialIds };
    const floorColor = resolveMaterialColor(materialIds.floor, zone.color || MATERIAL_PRESETS[settings.materialMode].floor);
    const mesh = new THREE.Mesh(
      geometry,
      createStandardMaterial({
        color: floorColor,
        roughness: Math.min(MATERIAL_PRESETS[settings.materialMode].roughness + 0.04, 0.9),
        metalness: 0.01,
        materialDetail: settings.materialDetail,
        textureType: 'matte'
      })
    );

    mesh.position.y = 0.006 + index * 0.001;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (settings.showCeilingHint) {
      const ceilingGeometry = geometry.clone();
      const ceiling = new THREE.Mesh(
        ceilingGeometry,
        new THREE.MeshBasicMaterial({
          color: resolveMaterialColor(materialIds.ceiling, '#f7f5ef'),
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );

      ceiling.position.y = WALL_HEIGHT_METERS + 0.02 + index * 0.001;
      group.add(ceiling);
    }
  });

  return group;
};

const createWallMesh = (wall: Wall, bounds: PlanBounds, scalePxPerMeter: number, settings: RenderSettings) => {
  const start = pointToWorld(wall.start, bounds, scalePxPerMeter);
  const end = pointToWorld(wall.end, bounds, scalePxPerMeter);
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const thickness = Math.max(pxToMeters(wall.thickness, scalePxPerMeter), MIN_WALL_THICKNESS_METERS);
  const wallColor = settings.wallMaterial || MATERIAL_PRESETS[settings.materialMode].wall;
  const group = new THREE.Group();
  const wallMesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, WALL_HEIGHT_METERS, thickness),
    createStandardMaterial({
      color: wallColor,
      roughness: MATERIAL_PRESETS[settings.materialMode].roughness,
      metalness: MATERIAL_PRESETS[settings.materialMode].metalness,
      materialDetail: settings.materialDetail,
      textureType: 'matte'
    })
  );
  const capMesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.035, thickness + 0.018),
    createStandardMaterial({
      color: new THREE.Color(wallColor).offsetHSL(0, -0.08, -0.08).getStyle(),
      roughness: 0.7,
      materialDetail: settings.materialDetail,
      textureType: 'matte'
    })
  );

  wallMesh.position.y = WALL_HEIGHT_METERS / 2;
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  capMesh.position.y = WALL_HEIGHT_METERS + 0.017;
  capMesh.castShadow = true;
  group.add(wallMesh, capMesh);
  group.position.set((start.x + end.x) / 2, 0, (start.z + end.z) / 2);
  group.rotation.y = -getWallAngle(wall);
  return group;
};

const createOpeningMesh = (opening: Opening, bounds: PlanBounds, design: DesignDocument) => {
  const point = pointToWorld({ x: opening.x, y: opening.y }, bounds, design.canvas.scalePxPerMeter);
  const wall = design.walls.find((item) => item.id === opening.wallId);
  const width = opening.width / 100;
  const height = opening.kind === 'door' ? 2.05 : 1.08;
  const y = opening.kind === 'door' ? height / 2 : 1.48;
  const thickness = wall ? Math.max(pxToMeters(wall.thickness, design.canvas.scalePxPerMeter), MIN_WALL_THICKNESS_METERS) + 0.045 : 0.14;
  const group = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, thickness),
    createStandardMaterial({
      color: opening.kind === 'door' ? '#9f7145' : '#87c6db',
      roughness: opening.kind === 'door' ? 0.58 : 0.18,
      metalness: opening.kind === 'door' ? 0.02 : 0,
      transparent: true,
      opacity: opening.kind === 'door' ? 0.82 : 0.52
    })
  );
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.08, height + 0.08, thickness + 0.025),
    new THREE.MeshStandardMaterial({
      color: opening.kind === 'door' ? '#6f4b2f' : '#4c8fa7',
      roughness: 0.5,
      metalness: 0.08,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide
    })
  );

  frame.position.y = y;
  panel.position.y = y;
  panel.castShadow = opening.kind === 'door';
  group.add(frame, panel);
  group.position.set(point.x, 0, point.z);
  group.rotation.y = -THREE.MathUtils.degToRad(opening.rotation);
  return group;
};

const getFurnitureHeightMeters = (furniture: FurnitureInstance) => {
  if (furniture.height) return furniture.height;
  if (furniture.shape === 'bed') return 0.45;
  if (furniture.shape === 'sofa') return 0.75;
  if (furniture.shape === 'cabinet') return 0.9;
  if (furniture.shape === 'storage') return 2.1;
  if (furniture.shape === 'sanitary') return 0.55;
  if (furniture.shape === 'appliance') return 1.2;
  return 0.72;
};

const getDefaultModelTransform = (transform?: Partial<ModelAssetTransform>): ModelAssetTransform => ({
  scale: transform?.scale ?? 1,
  rotationX: transform?.rotationX ?? 0,
  rotationY: transform?.rotationY ?? 0,
  rotationZ: transform?.rotationZ ?? 0,
  offsetY: transform?.offsetY ?? 0
});

const createFurnitureMaterial = (furniture: FurnitureInstance, settings: RenderSettings, color?: string) => {
  const material = resolveFurnitureMaterial(furniture.materialId);

  return createStandardMaterial({
    color: color ?? material.color ?? furniture.color,
    roughness: settings.materialMode === 'contrast' ? Math.max(0.3, material.roughness - 0.08) : material.roughness,
    metalness: material.metalness,
    transparent: material.category === 'glass',
    opacity: material.category === 'glass' ? 0.56 : 1,
    materialDetail: settings.materialDetail,
    textureType: material.textureType
  });
};

const addBox = (
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material
) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
};

const addCylinder = (
  group: THREE.Group,
  radius: number,
  height: number,
  position: [number, number, number],
  material: THREE.Material,
  segments = 36
) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
};

const createFurnitureShape = (furniture: FurnitureInstance, settings: RenderSettings) => {
  const width = furniture.width / 100;
  const depth = furniture.depth / 100;
  const height = getFurnitureHeightMeters(furniture);
  const group = new THREE.Group();
  const mainMaterial = createFurnitureMaterial(furniture, settings);
  const accentMaterial = createFurnitureMaterial(furniture, settings, furniture.accentColor);

  if (furniture.shape === 'bed') {
    addBox(group, [width, 0.28, depth], [0, 0.14, 0], mainMaterial);
    addBox(group, [width * 0.92, 0.16, depth * 0.72], [0, 0.38, depth * 0.08], mainMaterial);
    addBox(group, [width * 0.42, 0.11, depth * 0.18], [-width * 0.24, 0.54, -depth * 0.32], accentMaterial);
    addBox(group, [width * 0.42, 0.11, depth * 0.18], [width * 0.24, 0.54, -depth * 0.32], accentMaterial);
    addBox(group, [width, 0.5, 0.08], [0, 0.45, -depth * 0.5], accentMaterial);
    if (furniture.modelVariant === 'storage-bed') {
      addBox(group, [width * 0.86, 0.05, depth * 0.72], [0, 0.08, depth * 0.08], accentMaterial);
    }
    return group;
  }

  if (furniture.shape === 'sofa') {
    addBox(group, [width, height * 0.45, depth * 0.72], [0, height * 0.22, depth * 0.08], mainMaterial);
    addBox(group, [width, height * 0.72, depth * 0.12], [0, height * 0.48, -depth * 0.43], accentMaterial);
    addBox(group, [width * 0.08, height * 0.58, depth * 0.72], [-width * 0.46, height * 0.38, depth * 0.08], accentMaterial);
    addBox(group, [width * 0.08, height * 0.58, depth * 0.72], [width * 0.46, height * 0.38, depth * 0.08], accentMaterial);
    if (furniture.modelVariant === 'l-sofa') {
      addBox(group, [width * 0.42, height * 0.38, depth * 0.86], [width * 0.25, height * 0.18, depth * 0.2], mainMaterial);
      addBox(group, [width * 0.42, height * 0.56, depth * 0.08], [width * 0.25, height * 0.36, depth * 0.62], accentMaterial);
    }
    return group;
  }

  if (furniture.shape === 'dining') {
    addBox(group, [width, 0.12, depth], [0, height, 0], mainMaterial);
    const legOffsetX = width * 0.38;
    const legOffsetZ = depth * 0.34;
    [-1, 1].forEach((xSign) => {
      [-1, 1].forEach((zSign) => {
        addBox(group, [0.07, height, 0.07], [xSign * legOffsetX, height / 2, zSign * legOffsetZ], accentMaterial);
      });
    });
    [-1, 1].forEach((zSign) => addBox(group, [width * 0.22, 0.22, depth * 0.12], [0, 0.22, zSign * depth * 0.72], accentMaterial));
    return group;
  }

  if (furniture.shape === 'round') {
    if (furniture.modelVariant === 'ceiling-light' || furniture.modelVariant === 'floor-light') {
      addCylinder(group, Math.max(width, depth) / 2, 0.08, [0, height * 0.85, 0], mainMaterial, 48);
      addCylinder(group, Math.max(width, depth) * 0.16, height * 0.72, [0, height * 0.42, 0], accentMaterial, 32);
      return group;
    }

    addCylinder(group, Math.max(width, depth) / 2, height * 0.42, [0, height * 0.21, 0], mainMaterial, 48);
    addCylinder(group, Math.max(width, depth) * 0.42, 0.08, [0, height * 0.48, 0], accentMaterial, 48);
    return group;
  }

  if (furniture.shape === 'storage') {
    addBox(group, [width, height, depth], [0, height / 2, 0], mainMaterial);
    addBox(group, [0.018, height * 0.9, depth + 0.014], [0, height * 0.5, 0], accentMaterial);
    addBox(group, [width + 0.014, 0.018, depth + 0.014], [0, height * 0.52, 0], accentMaterial);
    return group;
  }

  if (furniture.shape === 'cabinet') {
    addBox(group, [width, height, depth], [0, height / 2, 0], mainMaterial);
    addBox(group, [width * 0.92, 0.04, depth * 0.96], [0, height + 0.02, 0], accentMaterial);
    addBox(group, [0.02, height * 0.72, depth + 0.012], [0, height * 0.46, 0], accentMaterial);
    return group;
  }

  if (furniture.shape === 'appliance') {
    addBox(group, [width, height, depth], [0, height / 2, 0], mainMaterial);
    addBox(group, [width * 0.7, height * 0.06, depth + 0.018], [0, height * 0.72, -depth * 0.02], accentMaterial);
    addBox(group, [width * 0.2, height * 0.22, depth + 0.02], [width * 0.24, height * 0.48, -depth * 0.02], accentMaterial);
    return group;
  }

  if (furniture.shape === 'sanitary') {
    addBox(group, [width, height * 0.46, depth], [0, height * 0.23, 0], mainMaterial);
    addCylinder(group, Math.min(width, depth) * 0.26, height * 0.18, [0, height * 0.55, 0], accentMaterial, 40);
    return group;
  }

  if (furniture.shape === 'desk') {
    addBox(group, [width, 0.1, depth], [0, height, 0], mainMaterial);
    addBox(group, [width * 0.92, height * 0.18, depth * 0.18], [0, height * 0.74, -depth * 0.38], accentMaterial);
    [-1, 1].forEach((xSign) => {
      [-1, 1].forEach((zSign) => addBox(group, [0.06, height, 0.06], [xSign * width * 0.42, height / 2, zSign * depth * 0.36], accentMaterial));
    });
    return group;
  }

  addBox(group, [width, height, depth], [0, height / 2, 0], mainMaterial);
  return group;
};

const createFurnitureMesh = (
  furniture: FurnitureInstance,
  bounds: PlanBounds,
  scalePxPerMeter: number,
  settings: RenderSettings,
  modelAsset?: ImportedModelAsset
) => {
  const point = pointToWorld({ x: furniture.x, y: furniture.y }, bounds, scalePxPerMeter);
  const group = createFurnitureShape(furniture, settings);

  group.position.set(point.x, 0, point.z);
  group.rotation.y = -THREE.MathUtils.degToRad(furniture.rotation);

  if (modelAsset) {
    group.userData.importedModelBinding = {
      asset: modelAsset,
      width: furniture.width / 100,
      depth: furniture.depth / 100,
      height: getFurnitureHeightMeters(furniture),
      transform: getDefaultModelTransform(furniture.modelTransform ?? modelAsset.transform)
    };
  }

  return group;
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
  group.add(createRoomMaterialMeshes(design, bounds, settings));
  const backgroundReference = createBackgroundReferenceMesh(design, bounds);

  if (backgroundReference) {
    group.add(backgroundReference);
  }

  design.walls.forEach((wall) => group.add(createWallMesh(wall, bounds, design.canvas.scalePxPerMeter, settings)));
  design.openings.forEach((opening) => group.add(createOpeningMesh(opening, bounds, design)));
  design.furniture.forEach((furniture) => {
    const modelAsset = (design.importedModelAssets ?? []).find((asset) => asset.id === furniture.modelAssetId);
    group.add(createFurnitureMesh(furniture, bounds, design.canvas.scalePxPerMeter, settings, modelAsset));
  });

  return {
    group,
    widthMeters: bounds.widthMeters,
    depthMeters: bounds.depthMeters
  };
};

const loadImportedModelObject = (asset: ImportedModelAsset) =>
  new Promise<THREE.Object3D>((resolve, reject) => {
    if (asset.format === 'glb' || asset.format === 'gltf') {
      new GLTFLoader().load(
        asset.dataUrl,
        (gltf) => resolve(gltf.scene),
        undefined,
        reject
      );
      return;
    }

    new OBJLoader().load(asset.dataUrl, resolve, undefined, reject);
  });

const prepareImportedModelObject = (
  object: THREE.Object3D,
  sizeMeters: { width: number; depth: number; height: number },
  transform: ModelAssetTransform
) => {
  const source = object.clone(true);

  source.traverse((child) => {
    const mesh = child as THREE.Mesh;

    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  const box = new THREE.Box3().setFromObject(source);
  const sourceSize = box.getSize(new THREE.Vector3());

  if (sourceSize.x <= 0 || sourceSize.y <= 0 || sourceSize.z <= 0) {
    throw new Error('模型尺寸无效');
  }

  const center = box.getCenter(new THREE.Vector3());
  source.position.sub(center);

  const fitScale =
    Math.min(sizeMeters.width / sourceSize.x, sizeMeters.depth / sourceSize.z, sizeMeters.height / sourceSize.y) *
    transform.scale;
  const container = new THREE.Group();

  source.scale.setScalar(fitScale);
  container.rotation.set(
    THREE.MathUtils.degToRad(transform.rotationX),
    THREE.MathUtils.degToRad(transform.rotationY),
    THREE.MathUtils.degToRad(transform.rotationZ)
  );
  container.position.y = transform.offsetY + (sourceSize.y * fitScale) / 2;
  container.add(source);
  return container;
};

export const hydrateImportedModelMeshes = async (
  root: THREE.Object3D,
  onModelLoadError?: (asset: ImportedModelAsset, error: unknown) => void
) => {
  const targets: THREE.Object3D[] = [];

  root.traverse((child) => {
    if (child.userData.importedModelBinding) {
      targets.push(child);
    }
  });

  await Promise.all(
    targets.map(async (target) => {
      const binding = target.userData.importedModelBinding as {
        asset: ImportedModelAsset;
        width: number;
        depth: number;
        height: number;
        transform: ModelAssetTransform;
      };

      try {
        const object = await loadImportedModelObject(binding.asset);
        const model = prepareImportedModelObject(
          object,
          {
            width: binding.width,
            depth: binding.depth,
            height: binding.height
          },
          binding.transform
        );

        while (target.children.length > 0) {
          const child = target.children[0];
          disposeThreeObject(child);
          target.remove(child);
        }

        target.add(model);
      } catch (error) {
        onModelLoadError?.(binding.asset, error);
      }
    })
  );
};

export const disposeThreeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;

    const disposeMaterial = (item: THREE.Material) => {
      const mappedMaterial = item as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;

      if (mappedMaterial.map) {
        mappedMaterial.map.dispose();
      }

      item.dispose();
    };

    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }
  });
};
