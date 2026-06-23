import type Konva from 'konva';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import DesignerCanvas from './components/DesignerCanvas';
import LeftPanel from './components/LeftPanel';
import PropertiesPanel from './components/PropertiesPanel';
import SelectedFurnitureToolbar from './components/SelectedFurnitureToolbar';
import ThreeDViewer, { type ThreeDViewerHandle } from './components/ThreeDViewer';
import TopBar from './components/TopBar';
import { DESIGN_TEMPLATES, cloneTemplateDesign, createEmptyDesign } from './data/templates';
import type {
  BackgroundImage,
  DesignDocument,
  DesignTemplate,
  FurnitureDefinition,
  FurnitureInstance,
  Point,
  RecognitionMode,
  RecognitionSession,
  RecognitionWall,
  Selection,
  ToolMode,
  ViewMode,
  Wall,
  WallDrawMode
} from './types';
import { getDesign, listDesigns, saveDesign } from './utils/designStorage';
import { recognizeFloorplanWalls } from './utils/floorplanRecognition';
import { createId } from './utils/geometry';
import { normalizeDesign, normalizeFurnitureInstance, normalizeRecognitionWall } from './utils/designMigration';
import { createEstimateItems, formatCurrency, getEstimateTotal, getRoomZoneAreaSqm } from './utils/roomMetrics';

const HISTORY_LIMIT = 80;

const stampDesign = (design: DesignDocument): DesignDocument =>
  normalizeDesign({
    ...design,
    updatedAt: new Date().toISOString()
  });

const keepRecentHistory = (items: DesignDocument[]) => items.slice(Math.max(0, items.length - HISTORY_LIMIT));

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const escapeHtml = (value: string | number | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const csvCell = (value: string | number | undefined) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

const downloadBlob = (content: BlobPart, type: string, fileName: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.download = fileName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

const getImageSize = (dataUrl: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('图片读取失败'));
    image.src = dataUrl;
  });

const createBackgroundImage = async (file: File, canvasWidth: number, canvasHeight: number): Promise<BackgroundImage> => {
  const dataUrl = await readFileAsDataUrl(file);
  const size = await getImageSize(dataUrl);
  const maxWidth = canvasWidth * 0.82;
  const maxHeight = canvasHeight * 0.82;
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);

  return {
    dataUrl,
    fileName: file.name,
    x: Math.round((canvasWidth - width) / 2),
    y: Math.round((canvasHeight - height) / 2),
    width,
    height,
    opacity: 0.55,
    locked: true,
    visible: true,
    calibration: {}
  };
};

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;

  if (!element) {
    return false;
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
};

const getWallLength = (wall: Wall) => Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);

const isHorizontalWall = (wall: Wall) => Math.abs(wall.start.y - wall.end.y) <= Math.abs(wall.start.x - wall.end.x);

const createRecognitionSession = (
  result: Awaited<ReturnType<typeof recognizeFloorplanWalls>>,
  backgroundImage: BackgroundImage,
  gridSize: number
): RecognitionSession => {
  const walls: RecognitionWall[] = result.walls.map((wall) => ({
    ...wall,
    confidence: wall.confidence,
    source: wall.source,
    status: 'active'
  }));
  const wallCount = walls.length;
  const confidence = wallCount >= 12 ? '高' : wallCount >= 6 ? '中' : '低';

  return {
    id: createId('recognition'),
    createdAt: new Date().toISOString(),
    sourceFileName: backgroundImage.fileName,
    status: 'draft',
    visible: true,
    opacity: 0.72,
    locked: false,
    selectedWallIds: [],
    walls,
    wallCount,
    horizontalCount: result.horizontalCount,
    verticalCount: result.verticalCount,
    confidence,
    parameters: {
      mode: result.mode,
      gridSize,
      minWallLength: result.minWallLength,
      rawWallCount: result.rawWallCount,
      candidateWallCount: result.candidateWallCount,
      inferredWallCount: result.inferredWallCount
    }
  };
};

const withRecognitionCounts = (recognition: RecognitionSession): RecognitionSession => {
  const visibleWalls = recognition.walls.filter((wall) => wall.status !== 'deleted');
  const selectableIds = new Set(visibleWalls.filter((wall) => wall.status === 'active').map((wall) => wall.id));

  return {
    ...recognition,
    wallCount: visibleWalls.length,
    selectedWallIds: recognition.selectedWallIds.filter((id) => selectableIds.has(id))
  };
};


const mergeRecognitionWalls = (walls: RecognitionWall[], gridSize: number) => {
  const sortedWalls = walls
    .slice()
    .sort((left, right) => Number(isHorizontalWall(right)) - Number(isHorizontalWall(left)) || getWallLength(right) - getWallLength(left));
  const merged: RecognitionWall[] = [];

  sortedWalls.forEach((wall) => {
    const horizontal = isHorizontalWall(wall);
    const lineCoordinate = horizontal ? wall.start.y : wall.start.x;
    const wallStart = horizontal ? Math.min(wall.start.x, wall.end.x) : Math.min(wall.start.y, wall.end.y);
    const wallEnd = horizontal ? Math.max(wall.start.x, wall.end.x) : Math.max(wall.start.y, wall.end.y);
    const target = merged.find((item) => {
      if (isHorizontalWall(item) !== horizontal) {
        return false;
      }

      const itemLineCoordinate = horizontal ? item.start.y : item.start.x;
      const itemStart = horizontal ? Math.min(item.start.x, item.end.x) : Math.min(item.start.y, item.end.y);
      const itemEnd = horizontal ? Math.max(item.start.x, item.end.x) : Math.max(item.start.y, item.end.y);
      const sameLine = Math.abs(itemLineCoordinate - lineCoordinate) <= gridSize;
      const closeGap = wallStart <= itemEnd + gridSize * 2 && wallEnd >= itemStart - gridSize * 2;

      return sameLine && closeGap;
    });

    if (!target) {
      merged.push(structuredClone(wall));
      return;
    }

    const targetStart = horizontal ? Math.min(target.start.x, target.end.x) : Math.min(target.start.y, target.end.y);
    const targetEnd = horizontal ? Math.max(target.start.x, target.end.x) : Math.max(target.start.y, target.end.y);
    const nextStart = Math.min(targetStart, wallStart);
    const nextEnd = Math.max(targetEnd, wallEnd);
    const nextThickness = Math.max(target.thickness, wall.thickness);

    if (horizontal) {
      target.start = { x: nextStart, y: target.start.y };
      target.end = { x: nextEnd, y: target.end.y };
    } else {
      target.start = { x: target.start.x, y: nextStart };
      target.end = { x: target.end.x, y: nextEnd };
    }

    target.thickness = nextThickness;
    target.confidence = Math.max(target.confidence ?? 0.72, wall.confidence ?? 0.72);
    target.source = 'merged';
  });

  return merged;
};

export default function App() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const threeViewerRef = useRef<ThreeDViewerHandle | null>(null);
  const draftBaseRef = useRef<DesignDocument | null>(null);
  const [design, setDesign] = useState<DesignDocument>(() => cloneTemplateDesign(DESIGN_TEMPLATES[1]));
  const [savedDesigns, setSavedDesigns] = useState<DesignDocument[]>([]);
  const [mode, setMode] = useState<ToolMode>('select');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchText, setSearchText] = useState('');
  const [draggedFurnitureId, setDraggedFurnitureId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.82);
  const [stagePosition, setStagePosition] = useState<Point>({ x: 48, y: 48 });
  const [history, setHistory] = useState<DesignDocument[]>([]);
  const [future, setFuture] = useState<DesignDocument[]>([]);
  const [statusText, setStatusText] = useState('本地方案');
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [furnitureClipboard, setFurnitureClipboard] = useState<FurnitureInstance | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('plan');
  const [recognizingFloorplan, setRecognizingFloorplan] = useState(false);
  const [recognitionMode, setRecognitionMode] = useState<RecognitionMode>('complete');
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [wallDrawMode, setWallDrawMode] = useState<WallDrawMode>('single');
  const [showWallLengths, setShowWallLengths] = useState(true);
  const [wallDraftResetSignal, setWallDraftResetSignal] = useState(0);
  const [fitViewSignal, setFitViewSignal] = useState(0);
  const [centerViewSignal, setCenterViewSignal] = useState(0);

  const recognitionLayer = design.recognition ?? null;
  const selectedRecognitionIds = recognitionLayer?.selectedWallIds ?? [];

  const selectedFurniture =
    selection?.type === 'furniture' ? design.furniture.find((item) => item.instanceId === selection.id) ?? null : null;

  const selectedFurnitureToolbarStyle = selectedFurniture
    ? {
        left: stagePosition.x + selectedFurniture.x * zoom,
        top:
          stagePosition.y +
          (selectedFurniture.y - ((selectedFurniture.depth / 100) * design.canvas.scalePxPerMeter) / 2) * zoom
      }
    : undefined;

  const resetWallDraft = useCallback(() => {
    setWallDraftResetSignal((value) => value + 1);
  }, []);

  const changeWallDrawMode = useCallback(
    (nextMode: WallDrawMode) => {
      setWallDrawMode(nextMode);
      resetWallDraft();
      setStatusText(nextMode === 'continuous' ? '已开启连续绘制' : '已切回单段绘制');
    },
    [resetWallDraft]
  );

  const toggleWallLengths = useCallback(() => {
    setShowWallLengths((value) => !value);
  }, []);

  useEffect(() => {
    resetWallDraft();
  }, [mode, resetWallDraft, viewMode]);

  const refreshSavedDesigns = useCallback(async () => {
    const designs = await listDesigns();
    setSavedDesigns(designs);
    return designs;
  }, []);

  useEffect(() => {
    let mounted = true;

    refreshSavedDesigns().then((designs) => {
      if (mounted && designs[0]) {
        setDesign(designs[0]);
        setStatusText('已恢复最近方案');
      }
    });

    return () => {
      mounted = false;
    };
  }, [refreshSavedDesigns]);

  const commitChange = useCallback(
    (updater: (current: DesignDocument) => DesignDocument, nextSelection?: Selection | null) => {
      setDesign((current) => {
        const before = structuredClone(current);
        const next = stampDesign(updater(current));
        setHistory((items) => keepRecentHistory([...items, before]));
        setFuture([]);
        return next;
      });

      if (nextSelection !== undefined) {
        setSelection(nextSelection);
      }
    },
    []
  );

  const beginDraft = useCallback(() => {
    if (!draftBaseRef.current) {
      draftBaseRef.current = structuredClone(design);
    }
  }, [design]);

  const changeDraft = useCallback((updater: (current: DesignDocument) => DesignDocument) => {
    setDesign((current) => stampDesign(updater(current)));
  }, []);

  const endDraft = useCallback(() => {
    if (!draftBaseRef.current) {
      return;
    }

    setHistory((items) => keepRecentHistory([...items, draftBaseRef.current as DesignDocument]));
    setFuture([]);
    draftBaseRef.current = null;
  }, []);

  const undo = useCallback(() => {
    setHistory((items) => {
      if (items.length === 0) {
        return items;
      }

      const previous = items[items.length - 1];
      setFuture((futureItems) => [structuredClone(design), ...futureItems].slice(0, HISTORY_LIMIT));
      setDesign(previous);
      setSelection(null);
      return items.slice(0, -1);
    });
  }, [design]);

  const redo = useCallback(() => {
    setFuture((items) => {
      if (items.length === 0) {
        return items;
      }

      const next = items[0];
      setHistory((historyItems) => keepRecentHistory([...historyItems, structuredClone(design)]));
      setDesign(next);
      setSelection(null);
      return items.slice(1);
    });
  }, [design]);

  const deleteSelection = useCallback(() => {
    resetWallDraft();

    if (selectedRecognitionIds.length > 0) {
      const selectedIds = new Set(selectedRecognitionIds);

      commitChange((current) => {
        if (!current.recognition) {
          return current;
        }

        return {
          ...current,
          recognition: withRecognitionCounts({
            ...current.recognition,
            selectedWallIds: [],
            walls: current.recognition.walls.map((wall) =>
              selectedIds.has(wall.id) && wall.status === 'active'
                ? { ...wall, status: 'deleted', updatedAt: new Date().toISOString() }
                : wall
            )
          })
        };
      });
      setStatusText(`已删除 ${selectedIds.size} 面识别墙`);
      return;
    }

    if (!selection) {
      return;
    }

    commitChange((current) => {
      if (selection.type === 'wall') {
        return {
          ...current,
          walls: current.walls.filter((wall) => wall.id !== selection.id),
          openings: current.openings.filter((opening) => opening.wallId !== selection.id)
        };
      }

      if (selection.type === 'opening') {
        return {
          ...current,
          openings: current.openings.filter((opening) => opening.id !== selection.id)
        };
      }

      if (selection.type === 'furniture') {
        return {
          ...current,
          furniture: current.furniture.filter((item) => item.instanceId !== selection.id)
        };
      }

      if (selection.type === 'roomZone') {
        return {
          ...current,
          roomZones: (current.roomZones ?? []).filter((zone) => zone.id !== selection.id)
        };
      }

      if (selection.type === 'room') {
        return {
          ...current,
          rooms: current.rooms.filter((room) => room.id !== selection.id)
        };
      }

      return current;
    }, null);
  }, [commitChange, resetWallDraft, selectedRecognitionIds, selection]);

  const copySelectedFurniture = useCallback(() => {
    if (!selectedFurniture) {
      return;
    }

    setFurnitureClipboard(structuredClone(selectedFurniture));
    setStatusText(`已复制 ${selectedFurniture.name}`);
  }, [selectedFurniture]);

  const pasteFurniture = useCallback(() => {
    if (!furnitureClipboard) {
      return;
    }

    const instanceId = createId('furniture');
    const offset = design.canvas.gridSize;
    const nextFurniture: FurnitureInstance = normalizeFurnitureInstance({
      ...structuredClone(furnitureClipboard),
      instanceId,
      x: furnitureClipboard.x + offset,
      y: furnitureClipboard.y + offset
    });

    commitChange(
      (current) => ({
        ...current,
        furniture: [...current.furniture, nextFurniture]
      }),
      { type: 'furniture', id: instanceId }
    );
    setFurnitureClipboard(nextFurniture);
    setStatusText(`已粘贴 ${nextFurniture.name}`);
  }, [commitChange, design.canvas.gridSize, furnitureClipboard]);

  const rotateSelectedFurniture = useCallback(() => {
    if (!selectedFurniture) {
      return;
    }

    commitChange((current) => ({
      ...current,
      furniture: current.furniture.map((item) =>
        item.instanceId === selectedFurniture.instanceId ? { ...item, rotation: (item.rotation + 90) % 360 } : item
      )
    }));
  }, [commitChange, selectedFurniture]);

  const nudgeSelectedFurniture = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!selectedFurniture) {
        return;
      }

      commitChange((current) => ({
        ...current,
        furniture: current.furniture.map((item) =>
          item.instanceId === selectedFurniture.instanceId
            ? {
                ...item,
                x: item.x + deltaX,
                y: item.y + deltaY
              }
            : item
        )
      }));
    },
    [commitChange, selectedFurniture]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (viewMode !== 'plan') {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSelection(null);
        resetWallDraft();
        setStatusText('已取消当前绘制起点');
        return;
      }

      if (event.key === 'Enter' && (mode === 'wall' || mode === 'recognition-wall')) {
        event.preventDefault();
        resetWallDraft();
        setStatusText(wallDrawMode === 'continuous' ? '已结束连续绘制' : '已结束当前墙体绘制');
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'c') {
        if (selectedFurniture) {
          event.preventDefault();
          copySelectedFurniture();
        }
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'v') {
        if (furnitureClipboard) {
          event.preventDefault();
          pasteFurniture();
        }
        return;
      }

      if (!event.ctrlKey && event.key.toLowerCase() === 'r') {
        if (selectedFurniture) {
          event.preventDefault();
          rotateSelectedFurniture();
        }
        return;
      }

      const gridSize = design.canvas.gridSize;
      const arrowNudgeMap: Record<string, Point> = {
        ArrowLeft: { x: -gridSize, y: 0 },
        ArrowRight: { x: gridSize, y: 0 },
        ArrowUp: { x: 0, y: -gridSize },
        ArrowDown: { x: 0, y: gridSize }
      };
      const nudge = arrowNudgeMap[event.key];

      if (nudge && selectedFurniture) {
        event.preventDefault();
        nudgeSelectedFurniture(nudge.x, nudge.y);
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        deleteSelection();
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    copySelectedFurniture,
    deleteSelection,
    design.canvas.gridSize,
    furnitureClipboard,
    nudgeSelectedFurniture,
    pasteFurniture,
    mode,
    redo,
    resetWallDraft,
    rotateSelectedFurniture,
    selectedFurniture,
    undo,
    viewMode,
    wallDrawMode
  ]);

  const applyTemplate = (template: DesignTemplate) => {
    resetWallDraft();
    commitChange(() => cloneTemplateDesign(template), null);
    setImportWizardOpen(false);
    setZoom(0.82);
    setStagePosition({ x: 48, y: 48 });
    setStatusText(`已应用${template.name}`);
  };

  const handleNew = () => {
    resetWallDraft();
    commitChange(() => createEmptyDesign(), null);
    setImportWizardOpen(false);
    setMode('wall');
    setZoom(0.82);
    setStagePosition({ x: 48, y: 48 });
    setStatusText('已新建空白方案');
  };

  const handleSave = async () => {
    const saved = await saveDesign(design);
    setDesign(saved);
    await refreshSavedDesigns();
    setStatusText('已保存到本地');
  };

  const handleOpen = async (id: string) => {
    const storedDesign = await getDesign(id);

    if (!storedDesign) {
      return;
    }

    resetWallDraft();
    setHistory((items) => keepRecentHistory([...items, structuredClone(design)]));
    setFuture([]);
    setDesign(storedDesign);
    setSelection(null);
    setImportWizardOpen(false);
    setStatusText(`已打开${storedDesign.name}`);
  };

  const createExportSnapshot = (
    kind: NonNullable<DesignDocument['exportHistory']>[number]['kind'],
    fileName: string
  ) =>
    stampDesign({
      ...design,
      exportHistory: [
        ...(design.exportHistory ?? []),
        {
          id: createId('export'),
          kind,
          fileName,
          createdAt: new Date().toISOString()
        }
      ]
    });

  const getPlanDataUrl = () => {
    const stage = stageRef.current;

    if (!stage) {
      return '';
    }

    const recognitionNodes = stage.find('.recognition-layer');
    const previousVisibility = recognitionNodes.map((node) => node.visible());

    recognitionNodes.forEach((node) => node.visible(false));
    stage.draw();

    const dataUrl = stage.toDataURL({ pixelRatio: 2 });

    recognitionNodes.forEach((node, index) => node.visible(previousVisibility[index]));
    stage.draw();
    return dataUrl;
  };

  const exportPng = () => {
    const dataUrl = getPlanDataUrl();

    if (!dataUrl) {
      return;
    }

    const fileName = `${design.name || '全屋设计'}.png`;
    const link = document.createElement('a');

    link.download = fileName;
    link.href = dataUrl;
    link.click();
    setStatusText('已导出 PNG');
  };

  const exportJson = () => {
    const fileName = `${design.name || '全屋设计'}-方案.json`;
    const snapshot = createExportSnapshot('json', fileName);

    downloadBlob(JSON.stringify(snapshot, null, 2), 'application/json;charset=utf-8', fileName);
    setStatusText('已导出方案 JSON');
  };

  const exportEstimateCsv = () => {
    const fileName = `${design.name || '全屋设计'}-预算清单.csv`;
    const snapshot = createExportSnapshot('csv-estimate', fileName);
    const items = createEstimateItems(snapshot);
    const rows = [
      ['类别', '房间', '项目', '数量', '单位', '单价', '损耗率', '小计'],
      ...items.map((item) => [
        item.category,
        item.roomName,
        item.name,
        item.quantity.toFixed(2),
        item.unit,
        item.unitPrice.toFixed(2),
        `${Math.round(item.wasteRate * 100)}%`,
        item.total.toFixed(2)
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');

    downloadBlob('\uFEFF' + csv, 'text/csv;charset=utf-8', fileName);
    setStatusText('已导出预算 CSV');
  };

  const exportHtmlReport = () => {
    const fileName = `${design.name || '全屋设计'}-交付报告.html`;
    const snapshot = createExportSnapshot('html-report', fileName);
    const items = createEstimateItems(snapshot);
    const total = getEstimateTotal(items);
    const planImage = getPlanDataUrl();
    const roomZoneRows = (snapshot.roomZones ?? [])
      .map((zone) => {
        const autoArea = getRoomZoneAreaSqm(zone, snapshot.canvas.scalePxPerMeter);
        const displayArea = zone.manualAreaSqm ?? autoArea;
        return `<tr><td>${escapeHtml(zone.name)}</td><td>${displayArea.toFixed(2)}㎡</td><td>${zone.manualAreaSqm ? '手动面积' : '自动面积'}</td></tr>`;
      })
      .join('');
    const estimateRows = items
      .map(
        (item) =>
          `<tr><td>${escapeHtml(item.category)}</td><td>${escapeHtml(item.roomName)}</td><td>${escapeHtml(item.name)}</td><td>${item.quantity.toFixed(2)}${escapeHtml(item.unit)}</td><td>${formatCurrency(item.total)}</td></tr>`
      )
      .join('');
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(snapshot.name)} 交付报告</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2933; background: #f5f7f4; }
    main { max-width: 1040px; margin: 0 auto; padding: 32px; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    h2 { margin: 28px 0 12px; font-size: 18px; }
    .meta { color: #5d6874; margin-bottom: 24px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .card { background: #fff; border: 1px solid #dfe6e1; border-radius: 8px; padding: 14px; }
    .card strong { display: block; font-size: 22px; margin-top: 6px; }
    img { max-width: 100%; border: 1px solid #dfe6e1; border-radius: 8px; background: #fff; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dfe6e1; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #edf1ee; text-align: left; font-size: 14px; }
    th { background: #eef4f0; }
    .total { text-align: right; font-size: 20px; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(snapshot.name)}</h1>
    <div class="meta">生成时间：${escapeHtml(new Date(snapshot.updatedAt).toLocaleString('zh-CN'))}</div>
    <section class="summary">
      <div class="card">墙体<strong>${snapshot.walls.length}</strong></div>
      <div class="card">门窗<strong>${snapshot.openings.length}</strong></div>
      <div class="card">家具<strong>${snapshot.furniture.length}</strong></div>
      <div class="card">总面积<strong>${snapshot.homeAreaSqm ? snapshot.homeAreaSqm.toFixed(1) + '㎡' : '未填写'}</strong></div>
    </section>
    <h2>平面图</h2>
    ${planImage ? `<img src="${planImage}" alt="平面图" />` : '<p>当前不在平面编辑视图，未生成平面图预览。</p>'}
    <h2>房间区域</h2>
    <table><thead><tr><th>房间</th><th>面积</th><th>来源</th></tr></thead><tbody>${roomZoneRows || '<tr><td colspan="3">尚未绘制房间区域</td></tr>'}</tbody></table>
    <h2>预算清单</h2>
    <table><thead><tr><th>类别</th><th>房间</th><th>项目</th><th>数量</th><th>小计</th></tr></thead><tbody>${estimateRows || '<tr><td colspan="5">暂无预算项目</td></tr>'}</tbody></table>
    <p class="total">预算合计：${formatCurrency(total)}</p>
  </main>
</body>
</html>`;

    downloadBlob(html, 'text/html;charset=utf-8', fileName);
    setStatusText('已导出 HTML 交付报告');
  };

  const exportThreeDPng = () => {
    threeViewerRef.current?.exportPng();
    setStatusText('已导出 3D 效果图');
  };

  const toggleFurnitureFavorite = (id: string) => {
    commitChange((current) => {
      const favoriteIds = new Set(current.favoriteFurnitureIds ?? []);
      const favorite = !favoriteIds.has(id);

      if (favorite) {
        favoriteIds.add(id);
      } else {
        favoriteIds.delete(id);
      }

      return {
        ...current,
        favoriteFurnitureIds: Array.from(favoriteIds),
        furniture: current.furniture.map((item) => (item.id === id ? { ...item, favorite } : item))
      };
    });
    setStatusText('已更新家具收藏');
  };

  const handleFurnitureDragStart = (item: FurnitureDefinition) => {
    setDraggedFurnitureId(item.id);
  };

  const handleBackgroundUpload = async (file: File) => {
    resetWallDraft();
    const backgroundImage = await createBackgroundImage(file, design.canvas.width, design.canvas.height);
    commitChange((current) => ({ ...current, backgroundImage, recognition: undefined }), null);
    setImportWizardOpen(true);
    setMode('select');
    setViewMode('plan');
    setStatusText('已上传户型图，请在导入向导中选择处理方式');
  };

  const startCalibration = () => {
    commitChange((current) => {
      if (!current.backgroundImage) {
        return current;
      }

      return {
        ...current,
        backgroundImage: {
          ...current.backgroundImage,
          calibration: {}
        }
      };
    }, null);
    setMode('calibrate');
    setStatusText('请在户型图上点选两点进行比例标定');
  };

  const recognizeFloorplan = async () => {
    if (!design.backgroundImage || recognizingFloorplan) {
      return;
    }

    setRecognizingFloorplan(true);
    setStatusText('正在识别到独立图层');

    try {
      const result = await recognizeFloorplanWalls(design.backgroundImage, {
        gridSize: design.canvas.gridSize,
        mode: recognitionMode
      });

      if (result.walls.length === 0) {
        setStatusText('未识别到足够清晰的墙体，请调高底图清晰度后重试');
        return;
      }

      const recognition = createRecognitionSession(result, design.backgroundImage, design.canvas.gridSize);

      commitChange(
        (current) => ({
          ...current,
          recognition,
          backgroundImage: current.backgroundImage
            ? {
                ...current.backgroundImage,
                visible: true,
                locked: true,
                opacity: Math.min(current.backgroundImage.opacity, 0.42)
              }
            : current.backgroundImage
        }),
        null
      );
      setImportWizardOpen(false);
      setMode('select');
      setViewMode('plan');
      setStatusText(`已识别到独立图层：${result.walls.length} 面墙，可先修正再写入正式方案`);
    } catch {
      setStatusText('自动识别失败，请换更清晰的户型图后重试');
    } finally {
      setRecognizingFloorplan(false);
    }
  };

  const keepBackgroundAsReference = () => {
    setImportWizardOpen(false);
    setMode('calibrate');
    setViewMode('plan');
    setStatusText('已保留底图作为参考，可继续标定比例或手动画墙');
  };

  const updateRecognitionLayer = (updater: (recognition: RecognitionSession) => RecognitionSession, statusText: string) => {
    commitChange((current) => {
      if (!current.recognition) {
        return current;
      }

      return {
        ...current,
        recognition: withRecognitionCounts(updater(current.recognition))
      };
    });
    setStatusText(statusText);
  };

  const selectAllRecognitionWalls = () => {
    updateRecognitionLayer(
      (recognition) => ({
        ...recognition,
        selectedWallIds: recognition.walls.filter((wall) => wall.status === 'active').map((wall) => wall.id)
      }),
      '已选中全部可写入识别墙'
    );
  };

  const clearRecognitionSelection = () => {
    updateRecognitionLayer((recognition) => ({ ...recognition, selectedWallIds: [] }), '已清空识别墙选择');
  };

  const deleteSelectedRecognitionWalls = () => {
    const selectedIds = new Set(selectedRecognitionIds);

    if (selectedIds.size === 0) {
      return;
    }

    updateRecognitionLayer(
      (recognition) => ({
        ...recognition,
        selectedWallIds: [],
        walls: recognition.walls.map((wall) =>
          selectedIds.has(wall.id) && wall.status === 'active'
            ? { ...wall, status: 'deleted', updatedAt: new Date().toISOString() }
            : wall
        )
      }),
      `已删除 ${selectedIds.size} 面识别墙`
    );
  };

  const restoreDeletedRecognitionWalls = () => {
    updateRecognitionLayer(
      (recognition) => ({
        ...recognition,
        walls: recognition.walls.map((wall) =>
          wall.status === 'deleted' ? { ...wall, status: 'active', updatedAt: new Date().toISOString() } : wall
        )
      }),
      '已恢复删除的识别墙'
    );
  };

  const mergeRecognitionSelection = () => {
    const selectedIds = new Set(selectedRecognitionIds);

    if (selectedIds.size < 2) {
      setStatusText('请至少选择两面识别墙再合并');
      return;
    }

    updateRecognitionLayer(
      (recognition) => {
        const selectedWalls = recognition.walls.filter((wall) => selectedIds.has(wall.id) && wall.status === 'active');
        const mergedWalls = mergeRecognitionWalls(selectedWalls, design.canvas.gridSize).map(normalizeRecognitionWall);

        return {
          ...recognition,
          selectedWallIds: mergedWalls.map((wall) => wall.id),
          walls: [...recognition.walls.filter((wall) => !selectedIds.has(wall.id)), ...mergedWalls]
        };
      },
      '已合并选中的识别墙'
    );
  };

  const mergeAllRecognitionWalls = () => {
    updateRecognitionLayer(
      (recognition) => {
        const activeWalls = recognition.walls.filter((wall) => wall.status === 'active');
        const mergedWalls = mergeRecognitionWalls(activeWalls, design.canvas.gridSize).map(normalizeRecognitionWall);

        return {
          ...recognition,
          selectedWallIds: mergedWalls.map((wall) => wall.id),
          walls: [...recognition.walls.filter((wall) => wall.status !== 'active'), ...mergedWalls]
        };
      },
      '已合并全部识别墙'
    );
  };

  const promoteRecognitionWalls = (scope: 'selected' | 'all') => {
    const selectedIds = new Set(selectedRecognitionIds);

    commitChange((current) => {
      if (!current.recognition) {
        return current;
      }

      const sourceWalls = current.recognition.walls.filter((wall) =>
        wall.status === 'active' && (scope === 'all' || selectedIds.has(wall.id))
      );

      if (sourceWalls.length === 0) {
        return current;
      }

      const promotedPairs = sourceWalls.map((wall) => ({
        recognitionId: wall.id,
        wall: {
          id: createId('wall'),
          start: wall.start,
          end: wall.end,
          thickness: wall.thickness,
          roomId: wall.roomId
        }
      }));
      const promotedMap = new Map(promotedPairs.map((item) => [item.recognitionId, item.wall.id]));
      const recognition = withRecognitionCounts({
        ...current.recognition,
        status: 'confirmed',
        selectedWallIds: [],
        walls: current.recognition.walls.map((wall) =>
          promotedMap.has(wall.id)
            ? { ...wall, status: 'promoted', promotedWallId: promotedMap.get(wall.id), updatedAt: new Date().toISOString() }
            : wall
        )
      });

      return {
        ...current,
        walls: [...current.walls, ...promotedPairs.map((item) => item.wall)],
        recognition
      };
    });
    setStatusText(scope === 'all' ? '已将全部识别墙写入正式方案' : '已将选中识别墙写入正式方案');
  };

  const discardRecognitionLayer = () => {
    commitChange((current) => ({ ...current, recognition: undefined }), null);
    setImportWizardOpen(false);
    setStatusText('已放弃识别图层，正式方案未受影响');
  };

  const wallModeLabel = wallDrawMode === 'continuous' ? '连续' : '单段';
  const modeText =
    viewMode === 'threeD'
      ? '3D预览'
      : mode === 'wall'
      ? `墙体绘制 · ${wallModeLabel}`
      : mode === 'recognition-wall'
        ? `识别补墙 · ${wallModeLabel}`
        : mode === 'room-zone'
          ? '房间区域绘制'
          : mode === 'pan'
        ? '画布平移'
        : mode === 'calibrate'
          ? '比例标定'
          : '编辑模式';

  return (
    <div className="app-shell">
      <TopBar
        design={design}
        savedDesigns={savedDesigns}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        zoom={zoom}
        viewMode={viewMode}
        showGrid={showGrid}
        hasBackground={Boolean(design.backgroundImage)}
        backgroundVisible={Boolean(design.backgroundImage?.visible)}
        onRename={(name) => commitChange((current) => ({ ...current, name }))}
        onNew={handleNew}
        onSave={handleSave}
        onOpen={handleOpen}
        onExportPng={exportPng}
        onExportJson={exportJson}
        onExportEstimateCsv={exportEstimateCsv}
        onExportHtmlReport={exportHtmlReport}
        onExport3DPng={exportThreeDPng}
        onViewModeChange={(nextMode) => {
          setViewMode(nextMode);
          resetWallDraft();
        }}
        onFitView={() => setFitViewSignal((value) => value + 1)}
        onCenterView={() => setCenterViewSignal((value) => value + 1)}
        onToggleGrid={() => setShowGrid((value) => !value)}
        onToggleBackground={() =>
          commitChange((current) => ({
            ...current,
            backgroundImage: current.backgroundImage
              ? { ...current.backgroundImage, visible: !current.backgroundImage.visible }
              : current.backgroundImage
          }))
        }
        onUndo={undo}
        onRedo={redo}
        onZoomIn={() => setZoom((value) => Math.min(2.5, value + 0.1))}
        onZoomOut={() => setZoom((value) => Math.max(0.35, value - 0.1))}
      />

      <div
        className={[
          'workspace',
          leftPanelVisible ? '' : 'is-left-collapsed',
          rightPanelVisible ? '' : 'is-right-collapsed'
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LeftPanel
          mode={mode}
          wallDrawMode={wallDrawMode}
          showWallLengths={showWallLengths}
          activeCategory={activeCategory}
          searchText={searchText}
          usedFurnitureIds={Array.from(new Set(design.furniture.map((item) => item.id)))}
          favoriteFurnitureIds={design.favoriteFurnitureIds ?? []}
          recommendedRoomNames={[...design.rooms.map((room) => room.name), ...(design.roomZones ?? []).map((zone) => zone.name)]}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            resetWallDraft();
          }}
          onWallDrawModeChange={changeWallDrawMode}
          onToggleWallLengths={toggleWallLengths}
          onApplyTemplate={applyTemplate}
          onBackgroundUpload={handleBackgroundUpload}
          onCategoryChange={setActiveCategory}
          onSearchChange={setSearchText}
          onFurnitureDragStart={handleFurnitureDragStart}
          onToggleFurnitureFavorite={toggleFurnitureFavorite}
        />
        <div className="center-pane">
          <button
            className="sidebar-toggle left-sidebar-toggle"
            type="button"
            onClick={() => setLeftPanelVisible((visible) => !visible)}
            title={leftPanelVisible ? '隐藏左侧栏' : '显示左侧栏'}
            aria-label={leftPanelVisible ? '隐藏左侧栏' : '显示左侧栏'}
          >
            {leftPanelVisible ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <button
            className="sidebar-toggle right-sidebar-toggle"
            type="button"
            onClick={() => setRightPanelVisible((visible) => !visible)}
            title={rightPanelVisible ? '隐藏右侧栏' : '显示右侧栏'}
            aria-label={rightPanelVisible ? '隐藏右侧栏' : '显示右侧栏'}
          >
            {rightPanelVisible ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          {viewMode === 'plan' ? (
            <DesignerCanvas
              design={design}
              mode={mode}
              selection={selection}
              stageRef={stageRef}
              zoom={zoom}
              stagePosition={stagePosition}
              draggedFurnitureId={draggedFurnitureId}
              recognitionLayer={recognitionLayer}
              wallDrawMode={wallDrawMode}
              showWallLengths={showWallLengths}
              showGrid={showGrid}
              wallDraftResetSignal={wallDraftResetSignal}
              fitViewSignal={fitViewSignal}
              centerViewSignal={centerViewSignal}
              onSelectionChange={setSelection}
              onCommitChange={commitChange}
              onDraftStart={beginDraft}
              onDraftChange={changeDraft}
              onDraftEnd={endDraft}
              onZoomChange={setZoom}
              onStagePositionChange={setStagePosition}
            />
          ) : (
            <ThreeDViewer ref={threeViewerRef} design={design} />
          )}
          {viewMode === 'plan' && selectedFurniture && selectedFurnitureToolbarStyle && (
            <SelectedFurnitureToolbar
              style={selectedFurnitureToolbarStyle}
              canPaste={Boolean(furnitureClipboard)}
              onCopy={copySelectedFurniture}
              onPaste={pasteFurniture}
              onRotate={rotateSelectedFurniture}
              onDelete={deleteSelection}
            />
          )}
          <div className="canvas-status">
            <span>{statusText}</span>
            <span>{modeText}</span>
          </div>
        </div>
        <PropertiesPanel
          design={design}
          selection={selection}
          wallDrawMode={wallDrawMode}
          showWallLengths={showWallLengths}
          onChange={commitChange}
          onDelete={deleteSelection}
          onWallDrawModeChange={changeWallDrawMode}
          onToggleWallLengths={toggleWallLengths}
          onExportJson={exportJson}
          onExportEstimateCsv={exportEstimateCsv}
          onExportHtmlReport={exportHtmlReport}
          onStartCalibration={startCalibration}
          onRecognizeFloorplan={recognizeFloorplan}
          recognitionMode={recognitionMode}
          onRecognitionModeChange={setRecognitionMode}
          onKeepBackgroundReference={keepBackgroundAsReference}
          onSelectAllRecognitionWalls={selectAllRecognitionWalls}
          onClearRecognitionSelection={clearRecognitionSelection}
          onDeleteSelectedRecognitionWalls={deleteSelectedRecognitionWalls}
          onRestoreDeletedRecognitionWalls={restoreDeletedRecognitionWalls}
          onMergeSelectedRecognitionWalls={mergeRecognitionSelection}
          onMergeAllRecognitionWalls={mergeAllRecognitionWalls}
          onPromoteSelectedRecognitionWalls={() => promoteRecognitionWalls('selected')}
          onPromoteAllRecognitionWalls={() => promoteRecognitionWalls('all')}
          onDiscardRecognitionLayer={discardRecognitionLayer}
          recognizingFloorplan={recognizingFloorplan}
          importWizardOpen={importWizardOpen}
          recognitionLayer={recognitionLayer}
        />
      </div>
    </div>
  );
}
