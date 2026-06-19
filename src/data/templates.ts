import type { DesignDocument, DesignTemplate, Wall } from '../types';

const now = () => new Date().toISOString();

const wall = (id: string, startX: number, startY: number, endX: number, endY: number, roomId?: string): Wall => ({
  id,
  start: { x: startX, y: startY },
  end: { x: endX, y: endY },
  thickness: 14,
  roomId
});

export const createEmptyDesign = (name = '未命名方案'): DesignDocument => ({
  id: `design-${Date.now().toString(36)}`,
  name,
  updatedAt: now(),
  canvas: {
    width: 1800,
    height: 1200,
    gridSize: 20,
    scalePxPerMeter: 80
  },
  walls: [],
  openings: [],
  furniture: [],
  rooms: []
});

const baseCanvas = {
  width: 1800,
  height: 1200,
  gridSize: 20,
  scalePxPerMeter: 80
};

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: 'one-bedroom',
    name: '一居室',
    description: '适合小户型起步设计',
    design: {
      id: 'template-one-bedroom',
      name: '一居室方案',
      updatedAt: now(),
      homeAreaSqm: 48,
      canvas: baseCanvas,
      walls: [
        wall('w-1-outer-1', 260, 180, 940, 180),
        wall('w-1-outer-2', 940, 180, 940, 720),
        wall('w-1-outer-3', 940, 720, 260, 720),
        wall('w-1-outer-4', 260, 720, 260, 180),
        wall('w-1-inner-1', 560, 180, 560, 720),
        wall('w-1-inner-2', 260, 440, 560, 440),
        wall('w-1-inner-3', 560, 500, 940, 500)
      ],
      openings: [
        { id: 'o-1-door-main', kind: 'door', wallId: 'w-1-outer-4', x: 260, y: 610, width: 76, rotation: 90 },
        { id: 'o-1-window-living', kind: 'window', wallId: 'w-1-outer-2', x: 940, y: 340, width: 140, rotation: 90 },
        { id: 'o-1-door-bedroom', kind: 'door', wallId: 'w-1-inner-1', x: 560, y: 320, width: 76, rotation: 90 }
      ],
      furniture: [],
      rooms: [
        { id: 'r-1-living', name: '客餐厅', x: 745, y: 340, area: '22㎡' },
        { id: 'r-1-bedroom', name: '卧室', x: 405, y: 305, area: '13㎡' },
        { id: 'r-1-bath', name: '卫浴', x: 405, y: 575, area: '5㎡' },
        { id: 'r-1-kitchen', name: '厨房', x: 750, y: 610, area: '8㎡' }
      ]
    }
  },
  {
    id: 'two-bedroom',
    name: '两居室',
    description: '常见两房一厅结构',
    design: {
      id: 'template-two-bedroom',
      name: '两居室方案',
      updatedAt: now(),
      homeAreaSqm: 69,
      canvas: baseCanvas,
      walls: [
        wall('w-2-outer-1', 220, 150, 1080, 150),
        wall('w-2-outer-2', 1080, 150, 1080, 780),
        wall('w-2-outer-3', 1080, 780, 220, 780),
        wall('w-2-outer-4', 220, 780, 220, 150),
        wall('w-2-inner-1', 560, 150, 560, 780),
        wall('w-2-inner-2', 220, 430, 560, 430),
        wall('w-2-inner-3', 560, 490, 1080, 490),
        wall('w-2-inner-4', 820, 490, 820, 780),
        wall('w-2-inner-5', 820, 150, 820, 490)
      ],
      openings: [
        { id: 'o-2-door-main', kind: 'door', wallId: 'w-2-outer-4', x: 220, y: 640, width: 86, rotation: 90 },
        { id: 'o-2-window-master', kind: 'window', wallId: 'w-2-outer-1', x: 390, y: 150, width: 150, rotation: 0 },
        { id: 'o-2-window-living', kind: 'window', wallId: 'w-2-outer-2', x: 1080, y: 320, width: 160, rotation: 90 },
        { id: 'o-2-door-master', kind: 'door', wallId: 'w-2-inner-1', x: 560, y: 330, width: 76, rotation: 90 },
        { id: 'o-2-door-second', kind: 'door', wallId: 'w-2-inner-5', x: 820, y: 340, width: 76, rotation: 90 },
        { id: 'o-2-door-bath', kind: 'door', wallId: 'w-2-inner-4', x: 820, y: 635, width: 72, rotation: 90 }
      ],
      furniture: [],
      rooms: [
        { id: 'r-2-master', name: '主卧', x: 390, y: 290, area: '14㎡' },
        { id: 'r-2-second', name: '次卧', x: 700, y: 300, area: '10㎡' },
        { id: 'r-2-living', name: '客餐厅', x: 900, y: 310, area: '24㎡' },
        { id: 'r-2-kitchen', name: '厨房', x: 700, y: 630, area: '7㎡' },
        { id: 'r-2-bath', name: '卫浴', x: 945, y: 635, area: '6㎡' },
        { id: 'r-2-entry', name: '玄关', x: 390, y: 610, area: '8㎡' }
      ]
    }
  },
  {
    id: 'three-bedroom',
    name: '三居室',
    description: '三房两厅起步模板',
    design: {
      id: 'template-three-bedroom',
      name: '三居室方案',
      updatedAt: now(),
      homeAreaSqm: 88,
      canvas: baseCanvas,
      walls: [
        wall('w-3-outer-1', 180, 130, 1260, 130),
        wall('w-3-outer-2', 1260, 130, 1260, 820),
        wall('w-3-outer-3', 1260, 820, 180, 820),
        wall('w-3-outer-4', 180, 820, 180, 130),
        wall('w-3-inner-1', 500, 130, 500, 820),
        wall('w-3-inner-2', 790, 130, 790, 820),
        wall('w-3-inner-3', 180, 430, 790, 430),
        wall('w-3-inner-4', 790, 500, 1260, 500),
        wall('w-3-inner-5', 1030, 500, 1030, 820),
        wall('w-3-inner-6', 500, 620, 790, 620)
      ],
      openings: [
        { id: 'o-3-door-main', kind: 'door', wallId: 'w-3-outer-4', x: 180, y: 690, width: 86, rotation: 90 },
        { id: 'o-3-window-master', kind: 'window', wallId: 'w-3-outer-1', x: 330, y: 130, width: 140, rotation: 0 },
        { id: 'o-3-window-living', kind: 'window', wallId: 'w-3-outer-2', x: 1260, y: 340, width: 170, rotation: 90 },
        { id: 'o-3-door-master', kind: 'door', wallId: 'w-3-inner-1', x: 500, y: 300, width: 76, rotation: 90 },
        { id: 'o-3-door-child', kind: 'door', wallId: 'w-3-inner-2', x: 790, y: 310, width: 76, rotation: 90 },
        { id: 'o-3-door-study', kind: 'door', wallId: 'w-3-inner-1', x: 500, y: 555, width: 76, rotation: 90 },
        { id: 'o-3-door-bath', kind: 'door', wallId: 'w-3-inner-5', x: 1030, y: 650, width: 72, rotation: 90 }
      ],
      furniture: [],
      rooms: [
        { id: 'r-3-master', name: '主卧', x: 340, y: 285, area: '15㎡' },
        { id: 'r-3-child', name: '儿童房', x: 645, y: 285, area: '11㎡' },
        { id: 'r-3-living', name: '客餐厅', x: 1020, y: 310, area: '30㎡' },
        { id: 'r-3-study', name: '书房', x: 340, y: 585, area: '10㎡' },
        { id: 'r-3-kitchen', name: '厨房', x: 650, y: 720, area: '7㎡' },
        { id: 'r-3-bath', name: '卫浴', x: 1145, y: 655, area: '6㎡' },
        { id: 'r-3-entry', name: '玄关', x: 905, y: 665, area: '9㎡' }
      ]
    }
  }
];

export const cloneTemplateDesign = (template: DesignTemplate): DesignDocument => ({
  ...structuredClone(template.design),
  id: `design-${Date.now().toString(36)}`,
  updatedAt: now()
});
