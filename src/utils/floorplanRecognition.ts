import type { BackgroundImage, RecognitionMode, RecognitionWallSource, Wall } from '../types';
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
  mode?: RecognitionMode;
};

export type RecognizedFloorplanWall = Wall & {
  confidence: number;
  source: RecognitionWallSource;
};

export type FloorplanRecognitionResult = {
  walls: RecognizedFloorplanWall[];
  horizontalCount: number;
  verticalCount: number;
  minWallLength: number;
  mode: RecognitionMode;
  rawWallCount: number;
  candidateWallCount: number;
  inferredWallCount: number;
};

const DARK_LUMA_THRESHOLD = 112;
const DARK_CHANNEL_THRESHOLD = 145;
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

const createDarkMask = async (backgroundImage: BackgroundImage) => {
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
    mask[pixelIndex] = isDarkWallPixel(
      imageData.data[index],
      imageData.data[index + 1],
      imageData.data[index + 2],
      imageData.data[index + 3]
    )
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
  mode: RecognitionMode
) => {
  const threshold = mode === 'complete' ? 42 : 58;
  const scoredWalls = getScoredWalls(walls, gridSize, imageSize, minWallLength);

  return scoredWalls
    .filter(({ score, wall }) => {
      const length = getWallLength(wall);
      const keepLongBoundary = mode === 'complete' && score >= 34 && length >= minWallLength * 1.35;
      return score >= threshold || keepLongBoundary;
    })
    .map(({ wall, score }) => toRecognizedWall(wall, score, 'scan'));
};

const createBridgeWalls = (walls: RecognizedFloorplanWall[], gridSize: number, minWallLength: number) => {
  const bridgeWalls: RecognizedFloorplanWall[] = [];
  const lineTolerance = Math.max(gridSize * 0.8, 16);
  const maxGap = Math.max(gridSize * 3.2, minWallLength * 0.72);

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

export const recognizeFloorplanWalls = async (
  backgroundImage: BackgroundImage,
  options: RecognizeOptions
): Promise<FloorplanRecognitionResult> => {
  const { mask, width, height } = await createDarkMask(backgroundImage);
  const mode = options.mode ?? 'complete';
  const minRunLength = Math.max(options.gridSize * 3, Math.min(width, height) * 0.055);
  const horizontalBands = extractBands(mask, width, height, 'horizontal', minRunLength);
  const verticalBands = extractBands(mask, width, height, 'vertical', minRunLength);
  const minWallLength = Math.max(options.gridSize * 4, Math.min(width, height) * 0.07);
  const rawWalls = [
    ...horizontalBands.map((band) => toWall(band, 'horizontal', backgroundImage, options.gridSize)),
    ...verticalBands.map((band) => toWall(band, 'vertical', backgroundImage, options.gridSize))
  ];
  const candidateWalls = dedupeWalls(
    rawWalls.filter((wall) => getWallLength(wall) >= minWallLength),
    options.gridSize
  );
  const recognizedWalls = filterRecognizedWalls(candidateWalls, options.gridSize, Math.min(width, height), minWallLength, mode);
  const inferredWalls = mode === 'complete' ? createBridgeWalls(recognizedWalls, options.gridSize, minWallLength) : [];
  const walls = [...recognizedWalls, ...inferredWalls];

  return {
    walls,
    horizontalCount: walls.filter((wall) => isHorizontalWall(wall)).length,
    verticalCount: walls.filter((wall) => !isHorizontalWall(wall)).length,
    minWallLength,
    mode,
    rawWallCount: rawWalls.length,
    candidateWallCount: candidateWalls.length,
    inferredWallCount: inferredWalls.length
  };
};
