import type {
  BackgroundImage,
  Point,
  RecognitionCropBox,
  RecognitionIssueMarker,
  RecognitionMode,
  RecognitionOpeningCandidate,
  RecognitionPass,
  RecognitionProfile,
  RecognitionQualityReport,
  RecognitionRoomCandidate,
  RecognitionSampledWallColor,
  RecognitionWallSource,
  Wall
} from '../types';
import { createId, snapValue } from './geometry';

type ScanBand = {
  scanStart: number;
  scanEnd: number;
  lastScan: number;
  lineStart: number;
  lineEnd: number;
};

type Run = {
  start: number;
  end: number;
};

type RecognizeOptions = {
  gridSize: number;
  scalePxPerMeter: number;
  mode?: RecognitionMode;
  profile?: RecognitionProfile;
  cropBox?: RecognitionCropBox;
  sampledWallColor?: RecognitionSampledWallColor;
};

export type RecognizedFloorplanWall = Wall & {
  confidence: number;
  source: RecognitionWallSource;
};

export type FloorplanRecognitionResult = {
  walls: RecognizedFloorplanWall[];
  openingCandidates: RecognitionOpeningCandidate[];
  roomCandidates: RecognitionRoomCandidate[];
  qualityReport: RecognitionQualityReport;
  horizontalCount: number;
  verticalCount: number;
  minWallLength: number;
  mode: RecognitionMode;
  rawWallCount: number;
  candidateWallCount: number;
  inferredWallCount: number;
  profile: RecognitionProfile;
  cropBox?: RecognitionCropBox;
  sampledWallColor?: RecognitionSampledWallColor;
  passes: RecognitionPass[];
};

const DARK_LUMA_THRESHOLD = 112;
const DARK_CHANNEL_THRESHOLD = 145;
const STRUCTURAL_LUMA_THRESHOLD = 190;
const STRUCTURAL_CHANNEL_THRESHOLD = 210;
const STRUCTURAL_CHANNEL_SPREAD = 42;
const MIN_WALL_THICKNESS = 5;
const MAX_WALL_THICKNESS = 28;
const RUN_LIGHT_GAP = 4;
const BAND_SCAN_GAP = 2;

const loadImage = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('户型图读取失败'));
    image.src = dataUrl;
  });

const isDarkWallPixel = (red: number, green: number, blue: number, alpha: number) => {
  if (alpha < 30) {
    return false;
  }

  const luma = red * 0.299 + green * 0.587 + blue * 0.114;
  return luma < DARK_LUMA_THRESHOLD && red < DARK_CHANNEL_THRESHOLD && green < DARK_CHANNEL_THRESHOLD && blue < DARK_CHANNEL_THRESHOLD;
};

const isStructuralWallPixel = (red: number, green: number, blue: number, alpha: number) => {
  if (isDarkWallPixel(red, green, blue, alpha)) {
    return true;
  }

  if (alpha < 30) {
    return false;
  }

  const luma = red * 0.299 + green * 0.587 + blue * 0.114;
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);

  return (
    luma < STRUCTURAL_LUMA_THRESHOLD &&
    maxChannel < STRUCTURAL_CHANNEL_THRESHOLD &&
    maxChannel - minChannel <= STRUCTURAL_CHANNEL_SPREAD
  );
};

const isSampledWallPixel = (
  red: number,
  green: number,
  blue: number,
  alpha: number,
  sampledWallColor?: RecognitionSampledWallColor
) => {
  if (!sampledWallColor || alpha < 30) {
    return false;
  }

  const distance = Math.hypot(red - sampledWallColor.r, green - sampledWallColor.g, blue - sampledWallColor.b);
  return distance <= sampledWallColor.tolerance;
};

const isInsideCropBox = (backgroundImage: BackgroundImage, x: number, y: number, cropBox?: RecognitionCropBox) => {
  if (!cropBox) {
    return true;
  }

  const worldX = backgroundImage.x + x;
  const worldY = backgroundImage.y + y;

  return (
    worldX >= cropBox.x &&
    worldX <= cropBox.x + cropBox.width &&
    worldY >= cropBox.y &&
    worldY <= cropBox.y + cropBox.height
  );
};

const createWallMask = async (
  backgroundImage: BackgroundImage,
  mode: RecognitionMode,
  profile: RecognitionProfile,
  cropBox?: RecognitionCropBox,
  sampledWallColor?: RecognitionSampledWallColor
) => {
  const image = await loadImage(backgroundImage.dataUrl);
  const width = Math.max(1, Math.round(backgroundImage.width));
  const height = Math.max(1, Math.round(backgroundImage.height));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('无法读取户型图像素');
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const mask = new Uint8Array(width * height);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const pixelIndex = index / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    if (!isInsideCropBox(backgroundImage, x, y, cropBox)) {
      mask[pixelIndex] = 0;
      continue;
    }

    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const alpha = imageData.data[index + 3];
    const sampledPixel = profile !== 'clean' && isSampledWallPixel(red, green, blue, alpha, sampledWallColor);
    const wallPixel =
      sampledPixel ||
      (mode === 'complete'
        ? isStructuralWallPixel(red, green, blue, alpha)
        : isDarkWallPixel(red, green, blue, alpha));

    mask[pixelIndex] = wallPixel
      ? 1
      : 0;
  }

  return { mask, width, height };
};

const readMask = (mask: Uint8Array, width: number, x: number, y: number) => mask[y * width + x] === 1;

const getScanPixel = (
  mask: Uint8Array,
  width: number,
  scanIndex: number,
  axisIndex: number,
  orientation: 'horizontal' | 'vertical'
) => {
  const x = orientation === 'horizontal' ? axisIndex : scanIndex;
  const y = orientation === 'horizontal' ? scanIndex : axisIndex;
  return readMask(mask, width, x, y);
};

const collectRuns = (
  mask: Uint8Array,
  width: number,
  scanIndex: number,
  axisLength: number,
  orientation: 'horizontal' | 'vertical',
  minRunLength: number
) => {
  const runs: Run[] = [];
  let runStart: number | null = null;
  let lastDark = -1;
  let lightGap = 0;

  for (let axisIndex = 0; axisIndex < axisLength; axisIndex += 1) {
    if (getScanPixel(mask, width, scanIndex, axisIndex, orientation)) {
      if (runStart === null) {
        runStart = axisIndex;
      }

      lastDark = axisIndex;
      lightGap = 0;
      continue;
    }

    if (runStart !== null) {
      lightGap += 1;

      if (lightGap > RUN_LIGHT_GAP) {
        if (lastDark - runStart + 1 >= minRunLength) {
          runs.push({ start: runStart, end: lastDark });
        }

        runStart = null;
        lightGap = 0;
      }
    }
  }

  if (runStart !== null && lastDark - runStart + 1 >= minRunLength) {
    runs.push({ start: runStart, end: lastDark });
  }

  return runs;
};

const getOverlap = (left: Run, right: Run) => Math.min(left.end, right.end) - Math.max(left.start, right.start);

const findBandForRun = (bands: ScanBand[], run: Run, scanIndex: number) => {
  let bestBand: ScanBand | null = null;
  let bestScore = 0;

  for (const band of bands) {
    if (scanIndex - band.lastScan > BAND_SCAN_GAP) {
      continue;
    }

    const bandRun = { start: band.lineStart - 8, end: band.lineEnd + 8 };
    const overlap = getOverlap(run, bandRun);
    const shorterLength = Math.min(run.end - run.start, band.lineEnd - band.lineStart);
    const score = shorterLength > 0 ? overlap / shorterLength : 0;

    if (score > bestScore) {
      bestBand = band;
      bestScore = score;
    }
  }

  return bestScore > 0.45 ? bestBand : null;
};

const extractBands = (
  mask: Uint8Array,
  width: number,
  height: number,
  orientation: 'horizontal' | 'vertical',
  minRunLength: number
) => {
  const scanLength = orientation === 'horizontal' ? height : width;
  const axisLength = orientation === 'horizontal' ? width : height;
  const activeBands: ScanBand[] = [];
  const completedBands: ScanBand[] = [];

  for (let scanIndex = 0; scanIndex < scanLength; scanIndex += 1) {
    const runs = collectRuns(mask, width, scanIndex, axisLength, orientation, minRunLength);

    runs.forEach((run) => {
      const band = findBandForRun(activeBands, run, scanIndex);

      if (band) {
        band.scanEnd = scanIndex;
        band.lastScan = scanIndex;
        band.lineStart = Math.min(band.lineStart, run.start);
        band.lineEnd = Math.max(band.lineEnd, run.end);
        return;
      }

      activeBands.push({
        scanStart: scanIndex,
        scanEnd: scanIndex,
        lastScan: scanIndex,
        lineStart: run.start,
        lineEnd: run.end
      });
    });

    for (let index = activeBands.length - 1; index >= 0; index -= 1) {
      if (scanIndex - activeBands[index].lastScan > BAND_SCAN_GAP) {
        completedBands.push(activeBands[index]);
        activeBands.splice(index, 1);
      }
    }
  }

  completedBands.push(...activeBands);

  return completedBands.filter((band) => band.scanEnd - band.scanStart + 1 >= MIN_WALL_THICKNESS);
};

const toWall = (
  band: ScanBand,
  orientation: 'horizontal' | 'vertical',
  backgroundImage: BackgroundImage,
  gridSize: number
): Wall => {
  const thickness = Math.min(MAX_WALL_THICKNESS, Math.max(MIN_WALL_THICKNESS + 4, band.scanEnd - band.scanStart + 1));
  const center = snapValue(backgroundImage[orientation === 'horizontal' ? 'y' : 'x'] + (band.scanStart + band.scanEnd) / 2, gridSize);
  const start = snapValue(backgroundImage[orientation === 'horizontal' ? 'x' : 'y'] + band.lineStart, gridSize);
  const end = snapValue(backgroundImage[orientation === 'horizontal' ? 'x' : 'y'] + band.lineEnd, gridSize);

  return orientation === 'horizontal'
    ? {
        id: createId('auto-wall'),
        start: { x: start, y: center },
        end: { x: end, y: center },
        thickness
      }
    : {
        id: createId('auto-wall'),
        start: { x: center, y: start },
        end: { x: center, y: end },
        thickness
      };
};

const getWallLength = (wall: Wall) => Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);

const isHorizontalWall = (wall: Wall) => Math.abs(wall.start.y - wall.end.y) <= Math.abs(wall.start.x - wall.end.x);

const getWallLineCoordinate = (wall: Wall) => (isHorizontalWall(wall) ? (wall.start.y + wall.end.y) / 2 : (wall.start.x + wall.end.x) / 2);

const getWallRange = (wall: Wall): Run =>
  isHorizontalWall(wall)
    ? { start: Math.min(wall.start.x, wall.end.x), end: Math.max(wall.start.x, wall.end.x) }
    : { start: Math.min(wall.start.y, wall.end.y), end: Math.max(wall.start.y, wall.end.y) };

const getOverlapRatio = (left: Wall, right: Wall) => {
  const overlap = getOverlap(getWallRange(left), getWallRange(right));
  const shorterLength = Math.min(getWallLength(left), getWallLength(right));
  return shorterLength > 0 ? overlap / shorterLength : 0;
};

const mergeParallelWalls = (walls: Wall[], gridSize: number) => {
  const mergeDistance = Math.max(gridSize * 0.9, MAX_WALL_THICKNESS * 1.2);
  const groups: Wall[][] = [];

  walls
    .slice()
    .sort((left, right) => getWallLength(right) - getWallLength(left))
    .forEach((wall) => {
      const wallHorizontal = isHorizontalWall(wall);
      const matchingGroup = groups.find((group) => {
        const anchor = group[0];

        return (
          isHorizontalWall(anchor) === wallHorizontal &&
          Math.abs(getWallLineCoordinate(anchor) - getWallLineCoordinate(wall)) <= mergeDistance &&
          group.some((item) => getOverlapRatio(item, wall) > 0.45)
        );
      });

      if (matchingGroup) {
        matchingGroup.push(wall);
        return;
      }

      groups.push([wall]);
    });

  return groups.map((group) => {
    if (group.length === 1) {
      return group[0];
    }

    const horizontal = isHorizontalWall(group[0]);
    const totalLength = group.reduce((sum, wall) => sum + getWallLength(wall), 0) || 1;
    const line = snapValue(
      group.reduce((sum, wall) => sum + getWallLineCoordinate(wall) * getWallLength(wall), 0) / totalLength,
      gridSize
    );
    const start = snapValue(Math.min(...group.map((wall) => getWallRange(wall).start)), gridSize);
    const end = snapValue(Math.max(...group.map((wall) => getWallRange(wall).end)), gridSize);
    const thickness = Math.round(group.reduce((sum, wall) => sum + wall.thickness, 0) / group.length);

    return horizontal
      ? {
          ...group[0],
          start: { x: start, y: line },
          end: { x: end, y: line },
          thickness
        }
      : {
          ...group[0],
          start: { x: line, y: start },
          end: { x: line, y: end },
          thickness
        };
  });
};

const dedupeWalls = (walls: Wall[], gridSize: number) => {
  const result: Wall[] = [];

  mergeParallelWalls(walls, gridSize)
    .slice()
    .sort((left, right) => getWallLength(right) - getWallLength(left))
    .forEach((wall) => {
      const horizontal = isHorizontalWall(wall);
      const duplicate = result.some((item) => {
        const itemHorizontal = isHorizontalWall(item);

        if (horizontal !== itemHorizontal) {
          return false;
        }

        if (horizontal) {
          const sameLine = Math.abs(item.start.y - wall.start.y) <= gridSize / 2;
          const overlap = getOverlap(getWallRange(item), getWallRange(wall));
          return sameLine && overlap > Math.min(getWallLength(item), getWallLength(wall)) * 0.72;
        }

        const sameLine = Math.abs(item.start.x - wall.start.x) <= gridSize / 2;
        const overlap = getOverlap(getWallRange(item), getWallRange(wall));
        return sameLine && overlap > Math.min(getWallLength(item), getWallLength(wall)) * 0.72;
      });

      if (!duplicate) {
        result.push(wall);
      }
    });

  return result;
};

const isValueBetween = (value: number, start: number, end: number, tolerance: number) =>
  value >= Math.min(start, end) - tolerance && value <= Math.max(start, end) + tolerance;

const isPointNearWall = (point: { x: number; y: number }, wall: Wall, tolerance: number) => {
  if (isHorizontalWall(wall)) {
    return Math.abs(point.y - wall.start.y) <= tolerance && isValueBetween(point.x, wall.start.x, wall.end.x, tolerance);
  }

  return Math.abs(point.x - wall.start.x) <= tolerance && isValueBetween(point.y, wall.start.y, wall.end.y, tolerance);
};

const countConnectedEndpoints = (wall: Wall, walls: Wall[], tolerance: number) =>
  [wall.start, wall.end].filter((point) => walls.some((item) => item.id !== wall.id && isPointNearWall(point, item, tolerance))).length;

const countPerpendicularIntersections = (wall: Wall, walls: Wall[], tolerance: number) => {
  const horizontal = isHorizontalWall(wall);
  return walls.filter((item) => {
    if (item.id === wall.id || isHorizontalWall(item) === horizontal) {
      return false;
    }

    const horizontalWall = horizontal ? wall : item;
    const verticalWall = horizontal ? item : wall;
    return (
      isValueBetween(verticalWall.start.x, horizontalWall.start.x, horizontalWall.end.x, tolerance) &&
      isValueBetween(horizontalWall.start.y, verticalWall.start.y, verticalWall.end.y, tolerance)
    );
  }).length;
};

const areWallsConnected = (left: Wall, right: Wall, tolerance: number) => {
  if (left.id === right.id) {
    return false;
  }

  if (
    isPointNearWall(left.start, right, tolerance) ||
    isPointNearWall(left.end, right, tolerance) ||
    isPointNearWall(right.start, left, tolerance) ||
    isPointNearWall(right.end, left, tolerance)
  ) {
    return true;
  }

  if (isHorizontalWall(left) === isHorizontalWall(right)) {
    return false;
  }

  const horizontalWall = isHorizontalWall(left) ? left : right;
  const verticalWall = isHorizontalWall(left) ? right : left;
  return (
    isValueBetween(verticalWall.start.x, horizontalWall.start.x, horizontalWall.end.x, tolerance) &&
    isValueBetween(horizontalWall.start.y, verticalWall.start.y, verticalWall.end.y, tolerance)
  );
};

const getWallComponentData = (walls: Wall[], tolerance: number) => {
  const neighbors = walls.map(() => new Set<number>());

  walls.forEach((wall, wallIndex) => {
    for (let itemIndex = wallIndex + 1; itemIndex < walls.length; itemIndex += 1) {
      if (areWallsConnected(wall, walls[itemIndex], tolerance)) {
        neighbors[wallIndex].add(itemIndex);
        neighbors[itemIndex].add(wallIndex);
      }
    }
  });

  const componentIndexes = new Array<number>(walls.length).fill(-1);
  const componentLengths: number[] = [];

  walls.forEach((wall, wallIndex) => {
    if (componentIndexes[wallIndex] !== -1) {
      return;
    }

    const componentIndex = componentLengths.length;
    const queue = [wallIndex];
    componentIndexes[wallIndex] = componentIndex;
    let componentLength = 0;

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const currentIndex = queue[queueIndex];
      componentLength += getWallLength(walls[currentIndex]);
      neighbors[currentIndex].forEach((nextIndex) => {
        if (componentIndexes[nextIndex] !== -1) {
          return;
        }

        componentIndexes[nextIndex] = componentIndex;
        queue.push(nextIndex);
      });
    }

    componentLengths.push(componentLength || getWallLength(wall));
  });

  return { neighbors, componentIndexes, componentLengths };
};

const getWallBounds = (walls: Wall[]) => {
  const xValues = walls.flatMap((wall) => [wall.start.x, wall.end.x]);
  const yValues = walls.flatMap((wall) => [wall.start.y, wall.end.y]);

  return {
    left: Math.min(...xValues),
    right: Math.max(...xValues),
    top: Math.min(...yValues),
    bottom: Math.max(...yValues)
  };
};

const getBoundaryScore = (wall: Wall, bounds: ReturnType<typeof getWallBounds>, tolerance: number) => {
  if (isHorizontalWall(wall)) {
    return Math.min(Math.abs(wall.start.y - bounds.top), Math.abs(wall.start.y - bounds.bottom)) <= tolerance ? 20 : 0;
  }

  return Math.min(Math.abs(wall.start.x - bounds.left), Math.abs(wall.start.x - bounds.right)) <= tolerance ? 20 : 0;
};

const scoreWallCandidate = ({
  wall,
  walls,
  index,
  gridSize,
  imageSize,
  minWallLength,
  bounds,
  neighbors,
  componentIndexes,
  componentLengths
}: {
  wall: Wall;
  walls: Wall[];
  index: number;
  gridSize: number;
  imageSize: number;
  minWallLength: number;
  bounds: ReturnType<typeof getWallBounds>;
  neighbors: Array<Set<number>>;
  componentIndexes: number[];
  componentLengths: number[];
}) => {
  const tolerance = Math.max(gridSize * 0.65, 12);
  const length = getWallLength(wall);
  const longWallLength = Math.max(gridSize * 7, imageSize * 0.145);
  const connectedEndpoints = countConnectedEndpoints(wall, walls, tolerance);
  const intersections = countPerpendicularIntersections(wall, walls, tolerance);
  const componentLength = componentLengths[componentIndexes[index]] ?? 0;
  const componentScore = Math.min(22, (componentLength / Math.max(longWallLength * 2, 1)) * 12);
  const lengthScore = Math.min(30, (length / Math.max(longWallLength, 1)) * 24);
  const connectionScore = Math.min(26, connectedEndpoints * 9 + intersections * 7 + neighbors[index].size * 4);
  const boundaryScore = getBoundaryScore(wall, bounds, Math.max(gridSize * 2.6, 64));
  const thicknessScore = wall.thickness >= MIN_WALL_THICKNESS + 3 ? 8 : 0;
  const shortIsolatedPenalty = length < minWallLength * 1.45 && connectedEndpoints === 0 && intersections === 0 ? 24 : 0;

  return Math.max(0, Math.min(100, lengthScore + connectionScore + boundaryScore + componentScore + thicknessScore - shortIsolatedPenalty));
};

const toRecognizedWall = (wall: Wall, confidence: number, source: RecognitionWallSource): RecognizedFloorplanWall => ({
  ...wall,
  confidence: Math.round(confidence) / 100,
  source
});

const getScoredWalls = (walls: Wall[], gridSize: number, imageSize: number, minWallLength: number) => {
  if (walls.length === 0) {
    return [];
  }

  const tolerance = Math.max(gridSize * 0.65, 12);
  const bounds = getWallBounds(walls);
  const { neighbors, componentIndexes, componentLengths } = getWallComponentData(walls, tolerance);

  return walls.map((wall, index) => ({
    wall,
    score: scoreWallCandidate({
      wall,
      walls,
      index,
      gridSize,
      imageSize,
      minWallLength,
      bounds,
      neighbors,
      componentIndexes,
      componentLengths
    })
  }));
};

const filterRecognizedWalls = (
  walls: Wall[],
  gridSize: number,
  imageSize: number,
  minWallLength: number,
  mode: RecognitionMode,
  profile: RecognitionProfile
) => {
  const threshold = mode === 'complete'
    ? profile === 'wall-priority'
      ? 34
      : 38
    : profile === 'clean'
      ? 62
      : 58;
  const scoredWalls = getScoredWalls(walls, gridSize, imageSize, minWallLength);

  return scoredWalls
    .filter(({ score, wall }) => {
      const length = getWallLength(wall);
      const keepLongBoundary =
        mode === 'complete' &&
        score >= (profile === 'wall-priority' ? 26 : 30) &&
        length >= minWallLength * (profile === 'wall-priority' ? 0.96 : 1.18);
      return score >= threshold || keepLongBoundary;
    })
    .map(({ wall, score }) => toRecognizedWall(wall, score, 'scan'));
};

const dedupeRecognizedWalls = (walls: RecognizedFloorplanWall[], gridSize: number) =>
  dedupeWalls(walls, gridSize).map((wall) => ({
    ...wall,
    confidence: 'confidence' in wall ? wall.confidence : 0.5,
    source: 'source' in wall ? wall.source : 'inferred'
  })) as RecognizedFloorplanWall[];

const createBridgeWalls = (
  walls: RecognizedFloorplanWall[],
  gridSize: number,
  minWallLength: number,
  profile: RecognitionProfile
) => {
  const bridgeWalls: RecognizedFloorplanWall[] = [];
  const lineTolerance = Math.max(gridSize * 0.8, 16);
  const maxGap = profile === 'wall-priority'
    ? Math.max(gridSize * 8.5, minWallLength * 1.85)
    : Math.max(gridSize * 5.5, minWallLength * 1.22);

  (['horizontal', 'vertical'] as const).forEach((orientation) => {
    const orientedWalls = walls
      .filter((wall) => (orientation === 'horizontal' ? isHorizontalWall(wall) : !isHorizontalWall(wall)))
      .slice()
      .sort((left, right) => getWallLineCoordinate(left) - getWallLineCoordinate(right) || getWallRange(left).start - getWallRange(right).start);
    const groups: RecognizedFloorplanWall[][] = [];

    orientedWalls.forEach((wall) => {
      const group = groups.find((items) => Math.abs(getWallLineCoordinate(items[0]) - getWallLineCoordinate(wall)) <= lineTolerance);

      if (group) {
        group.push(wall);
        return;
      }

      groups.push([wall]);
    });

    groups.forEach((group) => {
      group.sort((left, right) => getWallRange(left).start - getWallRange(right).start);

      for (let index = 0; index < group.length - 1; index += 1) {
        const current = group[index];
        const next = group[index + 1];
        const currentRange = getWallRange(current);
        const nextRange = getWallRange(next);
        const gap = nextRange.start - currentRange.end;

        if (gap <= 0 || gap > maxGap) {
          continue;
        }

        const line = snapValue((getWallLineCoordinate(current) + getWallLineCoordinate(next)) / 2, gridSize);
        const start = snapValue(currentRange.end, gridSize);
        const end = snapValue(nextRange.start, gridSize);
        const thickness = Math.round((current.thickness + next.thickness) / 2);
        const confidence = Math.min(0.76, Math.max(0.46, (current.confidence + next.confidence) / 2 - gap / maxGap * 0.18));

        bridgeWalls.push(
          orientation === 'horizontal'
            ? {
                id: createId('auto-wall'),
                start: { x: start, y: line },
                end: { x: end, y: line },
                thickness,
                confidence,
                source: 'inferred'
              }
            : {
                id: createId('auto-wall'),
                start: { x: line, y: start },
                end: { x: line, y: end },
                thickness,
                confidence,
                source: 'inferred'
              }
        );
      }
    });
  });

  return bridgeWalls;
};

const hasPerpendicularSupport = (
  walls: RecognizedFloorplanWall[],
  orientation: 'horizontal' | 'vertical',
  lineCoordinate: number,
  crossCoordinate: number,
  tolerance: number
) => {
  const supportSpan = tolerance * 2.2;
  const coverage = getWallCoverageOnLine(
    walls,
    orientation,
    lineCoordinate,
    crossCoordinate - supportSpan,
    crossCoordinate + supportSpan,
    tolerance
  );

  return coverage >= supportSpan * 0.52;
};

const createGridCompletionWalls = (
  walls: RecognizedFloorplanWall[],
  gridSize: number,
  minWallLength: number,
  profile: RecognitionProfile
): RecognizedFloorplanWall[] => {
  if (walls.length < 4) {
    return [];
  }

  const lineTolerance = Math.max(gridSize * 1.12, 22);
  const minCompletionLength = Math.max(minWallLength * (profile === 'wall-priority' ? 0.55 : 0.72), gridSize * 2.4);
  const horizontalWalls = walls.filter(isHorizontalWall);
  const verticalWalls = walls.filter((wall) => !isHorizontalWall(wall));
  const xLines = clusterAxisValues(verticalWalls.map(getWallLineCoordinate), lineTolerance);
  const yLines = clusterAxisValues(horizontalWalls.map(getWallLineCoordinate), lineTolerance);
  const completionWalls: RecognizedFloorplanWall[] = [];

  yLines.forEach((y) => {
    for (let index = 0; index < xLines.length - 1; index += 1) {
      const left = xLines[index];
      const right = xLines[index + 1];
      const length = right - left;

      if (length < minCompletionLength) {
        continue;
      }

      const coverage = getWallCoverageOnLine(walls, 'horizontal', y, left, right, lineTolerance) / length;
      const leftSupported = hasPerpendicularSupport(walls, 'vertical', left, y, lineTolerance);
      const rightSupported = hasPerpendicularSupport(walls, 'vertical', right, y, lineTolerance);

      if (coverage >= 0.82 || coverage < (profile === 'wall-priority' ? 0.04 : 0.08) || !leftSupported || !rightSupported) {
        continue;
      }

      completionWalls.push({
        id: createId('auto-wall'),
        start: { x: snapValue(left, gridSize), y: snapValue(y, gridSize) },
        end: { x: snapValue(right, gridSize), y: snapValue(y, gridSize) },
        thickness: Math.max(MIN_WALL_THICKNESS + 5, Math.round(gridSize * 0.48)),
        confidence: Math.min(0.7, Math.max(0.42, 0.42 + coverage * 0.26)),
        source: 'inferred'
      });
    }
  });

  xLines.forEach((x) => {
    for (let index = 0; index < yLines.length - 1; index += 1) {
      const top = yLines[index];
      const bottom = yLines[index + 1];
      const length = bottom - top;

      if (length < minCompletionLength) {
        continue;
      }

      const coverage = getWallCoverageOnLine(walls, 'vertical', x, top, bottom, lineTolerance) / length;
      const topSupported = hasPerpendicularSupport(walls, 'horizontal', top, x, lineTolerance);
      const bottomSupported = hasPerpendicularSupport(walls, 'horizontal', bottom, x, lineTolerance);

      if (coverage >= 0.82 || coverage < (profile === 'wall-priority' ? 0.04 : 0.08) || !topSupported || !bottomSupported) {
        continue;
      }

      completionWalls.push({
        id: createId('auto-wall'),
        start: { x: snapValue(x, gridSize), y: snapValue(top, gridSize) },
        end: { x: snapValue(x, gridSize), y: snapValue(bottom, gridSize) },
        thickness: Math.max(MIN_WALL_THICKNESS + 5, Math.round(gridSize * 0.48)),
        confidence: Math.min(0.7, Math.max(0.42, 0.42 + coverage * 0.26)),
        source: 'inferred'
      });
    }
  });

  return completionWalls;
};

const getUnionLength = (ranges: Run[]) => {
  if (ranges.length === 0) {
    return 0;
  }

  const sortedRanges = ranges
    .map((range) => ({ start: Math.min(range.start, range.end), end: Math.max(range.start, range.end) }))
    .sort((left, right) => left.start - right.start);
  let total = 0;
  let current = sortedRanges[0];

  for (let index = 1; index < sortedRanges.length; index += 1) {
    const next = sortedRanges[index];

    if (next.start <= current.end) {
      current = { start: current.start, end: Math.max(current.end, next.end) };
      continue;
    }

    total += current.end - current.start;
    current = next;
  }

  total += current.end - current.start;
  return total;
};

const getWallCoverageOnLine = (
  walls: Wall[],
  orientation: 'horizontal' | 'vertical',
  lineCoordinate: number,
  start: number,
  end: number,
  tolerance: number
) => {
  const ranges = walls
    .filter((wall) => (orientation === 'horizontal' ? isHorizontalWall(wall) : !isHorizontalWall(wall)))
    .filter((wall) => Math.abs(getWallLineCoordinate(wall) - lineCoordinate) <= tolerance)
    .map((wall) => {
      const range = getWallRange(wall);
      return {
        start: Math.max(Math.min(start, end), range.start),
        end: Math.min(Math.max(start, end), range.end)
      };
    })
    .filter((range) => range.end > range.start);

  return getUnionLength(ranges);
};

const clusterAxisValues = (values: number[], tolerance: number) => {
  const clusters: number[][] = [];

  values
    .slice()
    .sort((left, right) => left - right)
    .forEach((value) => {
      const cluster = clusters.find((items) => Math.abs(items.reduce((sum, item) => sum + item, 0) / items.length - value) <= tolerance);

      if (cluster) {
        cluster.push(value);
        return;
      }

      clusters.push([value]);
    });

  return clusters
    .map((items) => snapValue(items.reduce((sum, item) => sum + item, 0) / items.length, tolerance))
    .filter((value, index, items) => index === 0 || Math.abs(value - items[index - 1]) > tolerance)
    .sort((left, right) => left - right);
};

const createOpeningCandidates = (
  scanWalls: RecognizedFloorplanWall[],
  finalWalls: RecognizedFloorplanWall[],
  gridSize: number,
  scalePxPerMeter: number
): RecognitionOpeningCandidate[] => {
  const candidates: RecognitionOpeningCandidate[] = [];
  if (scanWalls.length === 0 && finalWalls.length === 0) {
    return candidates;
  }

  const bounds = getWallBounds(finalWalls.length ? finalWalls : scanWalls);
  const lineTolerance = Math.max(gridSize * 0.8, 16);
  const minGapPx = scalePxPerMeter * 0.55;
  const maxGapPx = scalePxPerMeter * 2.4;
  const boundaryTolerance = Math.max(gridSize * 2.4, 72);

  (['horizontal', 'vertical'] as const).forEach((orientation) => {
    const orientedWalls = scanWalls
      .filter((wall) => (orientation === 'horizontal' ? isHorizontalWall(wall) : !isHorizontalWall(wall)))
      .slice()
      .sort((left, right) => getWallLineCoordinate(left) - getWallLineCoordinate(right) || getWallRange(left).start - getWallRange(right).start);
    const groups: RecognizedFloorplanWall[][] = [];

    orientedWalls.forEach((wall) => {
      const group = groups.find((items) => Math.abs(getWallLineCoordinate(items[0]) - getWallLineCoordinate(wall)) <= lineTolerance);

      if (group) {
        group.push(wall);
        return;
      }

      groups.push([wall]);
    });

    groups.forEach((group) => {
      group.sort((left, right) => getWallRange(left).start - getWallRange(right).start);

      for (let index = 0; index < group.length - 1; index += 1) {
        const current = group[index];
        const next = group[index + 1];
        const currentRange = getWallRange(current);
        const nextRange = getWallRange(next);
        const gap = nextRange.start - currentRange.end;

        if (gap < minGapPx || gap > maxGapPx) {
          continue;
        }

        const line = snapValue((getWallLineCoordinate(current) + getWallLineCoordinate(next)) / 2, gridSize);
        const start = snapValue(currentRange.end, gridSize);
        const end = snapValue(nextRange.start, gridSize);
        const center = (start + end) / 2;
        const onOuterFrame =
          orientation === 'horizontal'
            ? Math.min(Math.abs(line - bounds.top), Math.abs(line - bounds.bottom)) <= boundaryTolerance
            : Math.min(Math.abs(line - bounds.left), Math.abs(line - bounds.right)) <= boundaryTolerance;
        const gapMeters = gap / scalePxPerMeter;
        const kind = onOuterFrame && gapMeters >= 0.8 ? 'window' : 'door';
        const confidence = Math.min(
          0.9,
          Math.max(0.48, (current.confidence + next.confidence) / 2 - Math.abs(gapMeters - (kind === 'door' ? 0.9 : 1.35)) * 0.08)
        );

        candidates.push({
          id: createId('rec-opening'),
          kind,
          wallId: current.id,
          x: orientation === 'horizontal' ? center : line,
          y: orientation === 'horizontal' ? line : center,
          width: Math.max(40, Math.round(gapMeters * 100)),
          rotation: orientation === 'horizontal' ? 0 : 90,
          status: 'active',
          confidence,
          source: 'gap'
        });
      }
    });
  });

  return candidates.slice(0, 28);
};

const createRoomCandidates = (
  walls: RecognizedFloorplanWall[],
  gridSize: number,
  scalePxPerMeter: number
): RecognitionRoomCandidate[] => {
  const horizontalWalls = walls.filter(isHorizontalWall);
  const verticalWalls = walls.filter((wall) => !isHorizontalWall(wall));
  const lineTolerance = Math.max(gridSize * 1.1, 18);
  const minRoomSide = scalePxPerMeter * 1.2;
  const maxRoomArea = 90;
  const xLines = clusterAxisValues(verticalWalls.map(getWallLineCoordinate), lineTolerance);
  const yLines = clusterAxisValues(horizontalWalls.map(getWallLineCoordinate), lineTolerance);
  const candidates: RecognitionRoomCandidate[] = [];

  for (let xIndex = 0; xIndex < xLines.length - 1; xIndex += 1) {
    for (let yIndex = 0; yIndex < yLines.length - 1; yIndex += 1) {
      const left = xLines[xIndex];
      const right = xLines[xIndex + 1];
      const top = yLines[yIndex];
      const bottom = yLines[yIndex + 1];
      const width = right - left;
      const height = bottom - top;

      if (width < minRoomSide || height < minRoomSide) {
        continue;
      }

      const areaSqm = (width / scalePxPerMeter) * (height / scalePxPerMeter);

      if (areaSqm < 2.2 || areaSqm > maxRoomArea) {
        continue;
      }

      const topCoverage = getWallCoverageOnLine(walls, 'horizontal', top, left, right, lineTolerance) / width;
      const bottomCoverage = getWallCoverageOnLine(walls, 'horizontal', bottom, left, right, lineTolerance) / width;
      const leftCoverage = getWallCoverageOnLine(walls, 'vertical', left, top, bottom, lineTolerance) / height;
      const rightCoverage = getWallCoverageOnLine(walls, 'vertical', right, top, bottom, lineTolerance) / height;
      const coverageValues = [topCoverage, bottomCoverage, leftCoverage, rightCoverage];
      const strongEdges = coverageValues.filter((coverage) => coverage >= 0.46).length;
      const averageCoverage = coverageValues.reduce((sum, coverage) => sum + coverage, 0) / coverageValues.length;

      if (strongEdges < 3 || averageCoverage < 0.52) {
        continue;
      }

      const points: Point[] = [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom }
      ];

      candidates.push({
        id: createId('rec-room'),
        name: `识别房间 ${candidates.length + 1}`,
        points,
        label: { x: (left + right) / 2, y: (top + bottom) / 2 },
        areaSqm: Math.round(areaSqm * 10) / 10,
        status: 'active',
        confidence: Math.min(0.88, Math.max(0.45, averageCoverage)),
        source: 'graph'
      });
    }
  }

  return candidates
    .sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0) || (right.areaSqm ?? 0) - (left.areaSqm ?? 0))
    .slice(0, 16);
};

const getOuterFrameCoverage = (walls: RecognizedFloorplanWall[], gridSize: number) => {
  if (walls.length === 0) {
    return 0;
  }

  const bounds = getWallBounds(walls);
  const tolerance = Math.max(gridSize * 1.4, 24);
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const topCoverage = getWallCoverageOnLine(walls, 'horizontal', bounds.top, bounds.left, bounds.right, tolerance) / width;
  const bottomCoverage = getWallCoverageOnLine(walls, 'horizontal', bounds.bottom, bounds.left, bounds.right, tolerance) / width;
  const leftCoverage = getWallCoverageOnLine(walls, 'vertical', bounds.left, bounds.top, bounds.bottom, tolerance) / height;
  const rightCoverage = getWallCoverageOnLine(walls, 'vertical', bounds.right, bounds.top, bounds.bottom, tolerance) / height;

  return Math.round(((topCoverage + bottomCoverage + leftCoverage + rightCoverage) / 4) * 100) / 100;
};

const createOuterGapMarkers = (walls: RecognizedFloorplanWall[], gridSize: number): RecognitionIssueMarker[] => {
  if (walls.length === 0) {
    return [];
  }

  const bounds = getWallBounds(walls);
  const tolerance = Math.max(gridSize * 1.4, 24);
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const sides = [
    {
      key: 'top',
      label: '上侧外框',
      orientation: 'horizontal' as const,
      line: bounds.top,
      start: bounds.left,
      end: bounds.right,
      length: width,
      x: (bounds.left + bounds.right) / 2,
      y: bounds.top,
      proposedWall: {
        id: createId('rec-gap-wall'),
        start: { x: snapValue(bounds.left, gridSize), y: snapValue(bounds.top, gridSize) },
        end: { x: snapValue(bounds.right, gridSize), y: snapValue(bounds.top, gridSize) }
      }
    },
    {
      key: 'bottom',
      label: '下侧外框',
      orientation: 'horizontal' as const,
      line: bounds.bottom,
      start: bounds.left,
      end: bounds.right,
      length: width,
      x: (bounds.left + bounds.right) / 2,
      y: bounds.bottom,
      proposedWall: {
        id: createId('rec-gap-wall'),
        start: { x: snapValue(bounds.left, gridSize), y: snapValue(bounds.bottom, gridSize) },
        end: { x: snapValue(bounds.right, gridSize), y: snapValue(bounds.bottom, gridSize) }
      }
    },
    {
      key: 'left',
      label: '左侧外框',
      orientation: 'vertical' as const,
      line: bounds.left,
      start: bounds.top,
      end: bounds.bottom,
      length: height,
      x: bounds.left,
      y: (bounds.top + bounds.bottom) / 2,
      proposedWall: {
        id: createId('rec-gap-wall'),
        start: { x: snapValue(bounds.left, gridSize), y: snapValue(bounds.top, gridSize) },
        end: { x: snapValue(bounds.left, gridSize), y: snapValue(bounds.bottom, gridSize) }
      }
    },
    {
      key: 'right',
      label: '右侧外框',
      orientation: 'vertical' as const,
      line: bounds.right,
      start: bounds.top,
      end: bounds.bottom,
      length: height,
      x: bounds.right,
      y: (bounds.top + bounds.bottom) / 2,
      proposedWall: {
        id: createId('rec-gap-wall'),
        start: { x: snapValue(bounds.right, gridSize), y: snapValue(bounds.top, gridSize) },
        end: { x: snapValue(bounds.right, gridSize), y: snapValue(bounds.bottom, gridSize) }
      }
    }
  ];

  return sides.flatMap((side) => {
    const coverage = getWallCoverageOnLine(walls, side.orientation, side.line, side.start, side.end, tolerance) / side.length;

    if (coverage >= 0.72) {
      return [];
    }

    return [
      {
        id: createId(`rec-gap-${side.key}`),
        type: 'outer-gap' as const,
        x: side.x,
        y: side.y,
        message: `${side.label}疑似缺口`,
        suggestion: 'create-wall' as const,
        status: 'active' as const,
        proposedWall: {
          ...side.proposedWall,
          thickness: Math.max(MIN_WALL_THICKNESS + 6, Math.round(gridSize * 0.48))
        }
      }
    ];
  });
};

const createEndpointIssueMarkers = (
  walls: RecognizedFloorplanWall[],
  gridSize: number,
  scalePxPerMeter: number
): RecognitionIssueMarker[] => {
  const tolerance = Math.max(gridSize * 0.8, 16);

  return walls.flatMap((wall) => {
    const endpoints = [wall.start, wall.end];
    return endpoints.flatMap((point, index) => {
      const connected = walls.some((item) => item.id !== wall.id && isPointNearWall(point, item, tolerance));
      const shortFurnitureLike = getWallLength(wall) < scalePxPerMeter * 1.45 && countConnectedEndpoints(wall, walls, tolerance) === 0;

      if (connected || shortFurnitureLike) {
        return [];
      }

      return [
        {
          id: createId(`rec-endpoint-${index}`),
          type: 'endpoint' as const,
          x: point.x,
          y: point.y,
          message: '墙体端点未闭合',
          suggestion: 'inspect' as const,
          status: 'active' as const,
          relatedWallIds: [wall.id]
        }
      ];
    });
  }).slice(0, 24);
};

const createQualityReport = (
  walls: RecognizedFloorplanWall[],
  openingCandidates: RecognitionOpeningCandidate[],
  roomCandidates: RecognitionRoomCandidate[],
  gridSize: number,
  scalePxPerMeter: number
): RecognitionQualityReport => {
  const tolerance = Math.max(gridSize * 0.8, 16);
  const outerFrameCoverage = getOuterFrameCoverage(walls, gridSize);
  const disconnectedEndpointCount = walls.reduce((count, wall) => {
    const connectedCount = countConnectedEndpoints(wall, walls, tolerance);
    return count + Math.max(0, 2 - connectedCount);
  }, 0);
  const lowConfidenceCount =
    walls.filter((wall) => wall.confidence < 0.55).length +
    openingCandidates.filter((candidate) => (candidate.confidence ?? 0) < 0.55).length +
    roomCandidates.filter((candidate) => (candidate.confidence ?? 0) < 0.55).length;
  const possibleFurnitureNoiseCount = walls.filter(
    (wall) => getWallLength(wall) < scalePxPerMeter * 1.45 && countConnectedEndpoints(wall, walls, tolerance) === 0
  ).length;
  const outerGapMarkers = createOuterGapMarkers(walls, gridSize);
  const endpointMarkers = createEndpointIssueMarkers(walls, gridSize, scalePxPerMeter);
  const missingWallHintCount = outerGapMarkers.length + endpointMarkers.length;
  const completionScore = Math.max(
    0,
    Math.min(100, Math.round(outerFrameCoverage * 74 + Math.max(0, 26 - disconnectedEndpointCount * 1.8)))
  );
  const noiseScore = Math.max(
    0,
    Math.min(100, Math.round(100 - lowConfidenceCount * 5.5 - possibleFurnitureNoiseCount * 8))
  );
  const qualityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        outerFrameCoverage * 52 +
          Math.max(0, 22 - disconnectedEndpointCount * 1.35) +
          Math.max(0, 16 - lowConfidenceCount * 1.15) +
          Math.max(0, 10 - possibleFurnitureNoiseCount * 1.4)
      )
    )
  );
  const suggestionMessages: string[] = [];

  if (outerFrameCoverage < 0.72) {
    suggestionMessages.push('外框覆盖不完整，建议先查看缺口标记或使用一键补外框。');
  }

  if (disconnectedEndpointCount > 8) {
    suggestionMessages.push('断开的墙体端点较多，建议先合并候选墙，再写入正式方案。');
  }

  if (lowConfidenceCount > 0) {
    suggestionMessages.push('存在低置信候选，写入前建议只保留与底图吻合的墙体、门窗和房间。');
  }

  if (possibleFurnitureNoiseCount > 3) {
    suggestionMessages.push('检测到疑似家具线条，建议用候选筛选隐藏低置信结果后再批量写入。');
  }

  if (missingWallHintCount > 0) {
    suggestionMessages.push('存在疑似漏墙提示，可逐个生成补墙或忽略。');
  }

  if (suggestionMessages.length === 0) {
    suggestionMessages.push('识别质量较稳定，可按墙体、门窗、房间分组确认写入。');
  }

  const actionableSuggestion =
    outerFrameCoverage < 0.72
      ? '先点击补全建议，补齐外框缺口后再写入正式方案。'
      : disconnectedEndpointCount > 8
        ? '先合并候选墙并处理断点，再写入正式方案。'
        : lowConfidenceCount > 0 || possibleFurnitureNoiseCount > 3
          ? '先隐藏低置信候选，确认主要墙体后再分组写入。'
          : '识别结果较稳定，可以选择墙体、门窗或房间候选写入正式方案。';

  return {
    outerFrameCoverage,
    completionScore,
    disconnectedEndpointCount,
    lowConfidenceCount,
    possibleFurnitureNoiseCount,
    noiseScore,
    missingWallHintCount,
    outerGapMarkers,
    issueMarkers: [...outerGapMarkers, ...endpointMarkers],
    qualityScore,
    actionableSuggestion,
    suggestionMessages
  };
};

export const recognizeFloorplanWalls = async (
  backgroundImage: BackgroundImage,
  options: RecognizeOptions
): Promise<FloorplanRecognitionResult> => {
  const profile = options.profile ?? 'wall-priority';
  const mode = options.mode ?? (profile === 'clean' ? 'precise' : 'complete');
  const passes: RecognitionPass[] = profile === 'clean'
    ? ['dark']
    : options.sampledWallColor
      ? ['dark', 'gray-structure', 'sampled-color', 'grid-completion']
      : ['dark', 'gray-structure', 'grid-completion'];
  const { mask, width, height } = await createWallMask(backgroundImage, mode, profile, options.cropBox, options.sampledWallColor);
  const minRunLength =
    mode === 'complete'
      ? Math.max(options.gridSize * (profile === 'wall-priority' ? 1.65 : 2.1), Math.min(width, height) * (profile === 'wall-priority' ? 0.028 : 0.034))
      : Math.max(options.gridSize * 3, Math.min(width, height) * 0.055);
  const horizontalBands = extractBands(mask, width, height, 'horizontal', minRunLength);
  const verticalBands = extractBands(mask, width, height, 'vertical', minRunLength);
  const minWallLength =
    mode === 'complete'
      ? Math.max(options.gridSize * (profile === 'wall-priority' ? 2.15 : 2.7), Math.min(width, height) * (profile === 'wall-priority' ? 0.038 : 0.046))
      : Math.max(options.gridSize * 4, Math.min(width, height) * 0.07);
  const rawWalls = [
    ...horizontalBands.map((band) => toWall(band, 'horizontal', backgroundImage, options.gridSize)),
    ...verticalBands.map((band) => toWall(band, 'vertical', backgroundImage, options.gridSize))
  ];
  const candidateWalls = dedupeWalls(
    rawWalls.filter((wall) => getWallLength(wall) >= minWallLength),
    options.gridSize
  );
  const recognizedWalls = filterRecognizedWalls(candidateWalls, options.gridSize, Math.min(width, height), minWallLength, mode, profile);
  const inferredWalls = mode === 'complete' ? createBridgeWalls(recognizedWalls, options.gridSize, minWallLength, profile) : [];
  const bridgedWalls = mode === 'complete' ? dedupeRecognizedWalls([...recognizedWalls, ...inferredWalls], options.gridSize) : recognizedWalls;
  const completionWalls = mode === 'complete' ? createGridCompletionWalls(bridgedWalls, options.gridSize, minWallLength, profile) : [];
  const walls = mode === 'complete' ? dedupeRecognizedWalls([...bridgedWalls, ...completionWalls], options.gridSize) : recognizedWalls;
  const openingCandidates = createOpeningCandidates(recognizedWalls, walls, options.gridSize, options.scalePxPerMeter);
  const roomCandidates = createRoomCandidates(walls, options.gridSize, options.scalePxPerMeter);
  const qualityReport = createQualityReport(walls, openingCandidates, roomCandidates, options.gridSize, options.scalePxPerMeter);

  return {
    walls,
    openingCandidates,
    roomCandidates,
    qualityReport,
    horizontalCount: walls.filter((wall) => isHorizontalWall(wall)).length,
    verticalCount: walls.filter((wall) => !isHorizontalWall(wall)).length,
    minWallLength,
    mode,
    profile,
    cropBox: options.cropBox,
    sampledWallColor: options.sampledWallColor,
    passes,
    rawWallCount: rawWalls.length,
    candidateWallCount: candidateWalls.length,
    inferredWallCount: walls.filter((wall) => wall.source === 'inferred').length
  };
};
