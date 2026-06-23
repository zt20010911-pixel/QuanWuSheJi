import { DEFAULT_ESTIMATE_SETTINGS, MATERIAL_LIBRARY, resolveMaterial } from '../data/materials';
import type { DesignDocument, EstimateItem, MaterialCategory, Point, RoomZone } from '../types';
import { pxToMeters } from './geometry';

export const polygonAreaPx = (points: Point[]) => {
  if (points.length < 3) return 0;
  const sum = points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point.x * next.y - next.x * point.y;
  }, 0);
  return Math.abs(sum) / 2;
};

export const polygonCentroid = (points: Point[]): Point => {
  if (points.length === 0) return { x: 0, y: 0 };
  const areaFactor = points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point.x * next.y - next.x * point.y;
  }, 0);

  if (areaFactor === 0) {
    return {
      x: points.reduce((total, point) => total + point.x, 0) / points.length,
      y: points.reduce((total, point) => total + point.y, 0) / points.length
    };
  }

  const factor = areaFactor * 3;
  return points.reduce(
    (center, point, index) => {
      const next = points[(index + 1) % points.length];
      const cross = point.x * next.y - next.x * point.y;
      return { x: center.x + ((point.x + next.x) * cross) / factor, y: center.y + ((point.y + next.y) * cross) / factor };
    },
    { x: 0, y: 0 }
  );
};

export const polygonPerimeterPx = (points: Point[]) => {
  if (points.length < 2) return 0;
  return points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + Math.hypot(next.x - point.x, next.y - point.y);
  }, 0);
};

export const getRoomZoneAreaSqm = (zone: RoomZone, scalePxPerMeter: number) => {
  if (typeof zone.manualAreaSqm === 'number' && Number.isFinite(zone.manualAreaSqm) && zone.manualAreaSqm > 0) {
    return zone.manualAreaSqm;
  }
  return polygonAreaPx(zone.points) / (scalePxPerMeter * scalePxPerMeter);
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const createEstimateItem = ({
  id,
  category,
  name,
  roomZoneId,
  roomName,
  unit,
  quantity,
  unitPrice,
  wasteRate,
  source
}: Omit<EstimateItem, 'total'>): EstimateItem => ({
  id,
  category,
  name,
  roomZoneId,
  roomName,
  unit,
  quantity: round2(quantity),
  unitPrice,
  wasteRate,
  source,
  total: round2(quantity * unitPrice)
});

export const createEstimateItems = (design: DesignDocument): EstimateItem[] => {
  const settings = { ...DEFAULT_ESTIMATE_SETTINGS, ...design.estimateSettings };
  const zones = design.roomZones ?? [];
  const items: EstimateItem[] = [];

  zones.forEach((zone) => {
    const floorArea = getRoomZoneAreaSqm(zone, design.canvas.scalePxPerMeter);
    const perimeterMeters = pxToMeters(polygonPerimeterPx(zone.points), design.canvas.scalePxPerMeter);
    const openingArea = design.openings.reduce((total, opening) => {
      const widthMeters = opening.width / 100;
      return total + widthMeters * (opening.kind === 'door' ? 2.05 : 1.1);
    }, 0) / Math.max(1, zones.length);
    const wallArea = Math.max(0, perimeterMeters * settings.wallHeightMeters - openingArea);

    const floor = resolveMaterial(settings, zone.materialIds.floor);
    const wall = resolveMaterial(settings, zone.materialIds.wall);
    const ceiling = resolveMaterial(settings, zone.materialIds.ceiling);

    [
      { material: floor, quantity: floorArea },
      { material: wall, quantity: wallArea },
      { material: ceiling, quantity: floorArea }
    ].forEach(({ material, quantity }) => {
      const wasteRate = settings.includeWaste ? Math.max(material.wasteRate, settings.wasteRate) : 0;
      items.push(createEstimateItem({
        id: zone.id + '-' + material.id,
        category: material.category as MaterialCategory,
        name: material.name,
        roomZoneId: zone.id,
        roomName: zone.name,
        unit: material.unit,
        quantity: quantity * (1 + wasteRate),
        unitPrice: material.unitPrice,
        wasteRate,
        source: 'auto'
      }));
    });
  });

  if (zones.length > 0) {
    const construction = MATERIAL_LIBRARY.find((item) => item.id === 'construction-base');
    if (construction) {
      items.push(createEstimateItem({
        id: 'construction-base-auto',
        category: construction.category,
        name: construction.name,
        unit: construction.unit,
        quantity: 1,
        unitPrice: construction.unitPrice,
        wasteRate: 0,
        source: 'auto'
      }));
    }
  }

  return [...items, ...(design.customEstimateItems ?? [])];
};

export const getEstimateTotal = (items: EstimateItem[]) => round2(items.reduce((total, item) => total + item.total, 0));

export const formatCurrency = (value: number) => '¥' + round2(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
