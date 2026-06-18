import type { Point, Wall } from '../types';

export const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const snapValue = (value: number, gridSize: number) => Math.round(value / gridSize) * gridSize;

export const snapPoint = (point: Point, gridSize: number): Point => ({
  x: snapValue(point.x, gridSize),
  y: snapValue(point.y, gridSize)
});

export const wallLengthPx = (wall: Wall) => {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return Math.hypot(dx, dy);
};

export const wallAngle = (wall: Wall) => Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);

export const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

export const pxToMeters = (px: number, scalePxPerMeter: number) => px / scalePxPerMeter;

export const metersToPx = (meters: number, scalePxPerMeter: number) => meters * scalePxPerMeter;

export const resizeWallByLength = (wall: Wall, meters: number, scalePxPerMeter: number): Wall => {
  const angle = wallAngle(wall);
  const length = metersToPx(Math.max(0.25, meters), scalePxPerMeter);

  return {
    ...wall,
    end: {
      x: wall.start.x + Math.cos(angle) * length,
      y: wall.start.y + Math.sin(angle) * length
    }
  };
};

export const distancePointToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projected = {
    x: start.x + t * dx,
    y: start.y + t * dy
  };

  return Math.hypot(point.x - projected.x, point.y - projected.y);
};

export const projectPointOnWall = (point: Point, wall: Wall): Point => {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return wall.start;
  }

  const t = Math.max(0, Math.min(1, ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared));

  return {
    x: wall.start.x + t * dx,
    y: wall.start.y + t * dy
  };
};

export const findNearestWall = (point: Point, walls: Wall[], maxDistance = 28) => {
  let nearest: { wall: Wall; distance: number } | null = null;

  for (const wall of walls) {
    const distance = distancePointToSegment(point, wall.start, wall.end);

    if (distance <= maxDistance && (!nearest || distance < nearest.distance)) {
      nearest = { wall, distance };
    }
  }

  return nearest?.wall ?? null;
};
