import type { BackgroundImage, Wall } from '../types';
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
};

export type FloorplanRecognitionResult = {
  walls: Wall[];
  horizontalCount: number;
  verticalCount: number;
  minWallLength: number;
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

const dedupeWalls = (walls: Wall[], gridSize: number) => {
  const result: Wall[] = [];

  walls
    .slice()
    .sort((left, right) => getWallLength(right) - getWallLength(left))
    .forEach((wall) => {
      const horizontal = Math.abs(wall.start.y - wall.end.y) < Math.abs(wall.start.x - wall.end.x);
      const duplicate = result.some((item) => {
        const itemHorizontal = Math.abs(item.start.y - item.end.y) < Math.abs(item.start.x - item.end.x);

        if (horizontal !== itemHorizontal) {
          return false;
        }

        if (horizontal) {
          const sameLine = Math.abs(item.start.y - wall.start.y) <= gridSize / 2;
          const overlap = getOverlap(
            { start: Math.min(item.start.x, item.end.x), end: Math.max(item.start.x, item.end.x) },
            { start: Math.min(wall.start.x, wall.end.x), end: Math.max(wall.start.x, wall.end.x) }
          );
          return sameLine && overlap > Math.min(getWallLength(item), getWallLength(wall)) * 0.72;
        }

        const sameLine = Math.abs(item.start.x - wall.start.x) <= gridSize / 2;
        const overlap = getOverlap(
          { start: Math.min(item.start.y, item.end.y), end: Math.max(item.start.y, item.end.y) },
          { start: Math.min(wall.start.y, wall.end.y), end: Math.max(wall.start.y, wall.end.y) }
        );
        return sameLine && overlap > Math.min(getWallLength(item), getWallLength(wall)) * 0.72;
      });

      if (!duplicate) {
        result.push(wall);
      }
    });

  return result;
};

export const recognizeFloorplanWalls = async (
  backgroundImage: BackgroundImage,
  options: RecognizeOptions
): Promise<FloorplanRecognitionResult> => {
  const { mask, width, height } = await createDarkMask(backgroundImage);
  const minRunLength = Math.max(options.gridSize * 3, Math.min(width, height) * 0.055);
  const horizontalBands = extractBands(mask, width, height, 'horizontal', minRunLength);
  const verticalBands = extractBands(mask, width, height, 'vertical', minRunLength);
  const minWallLength = Math.max(options.gridSize * 4, Math.min(width, height) * 0.07);
  const walls = dedupeWalls(
    [
      ...horizontalBands.map((band) => toWall(band, 'horizontal', backgroundImage, options.gridSize)),
      ...verticalBands.map((band) => toWall(band, 'vertical', backgroundImage, options.gridSize))
    ].filter((wall) => getWallLength(wall) >= minWallLength),
    options.gridSize
  );

  return {
    walls,
    horizontalCount: horizontalBands.length,
    verticalCount: verticalBands.length,
    minWallLength
  };
};
