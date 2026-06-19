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
  RecognitionSession,
  Selection,
  ToolMode,
  ViewMode,
  Wall
} from './types';
import { getDesign, listDesigns, saveDesign } from './utils/designStorage';
import { recognizeFloorplanWalls } from './utils/floorplanRecognition';
import { createId } from './utils/geometry';
import { normalizeDesign, normalizeFurnitureInstance } from './utils/designMigration';

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
  const wallCount = result.walls.length;
  const confidence = wallCount >= 12 ? '高' : wallCount >= 6 ? '中' : '低';

  return {
    id: createId('recognition'),
    createdAt: new Date().toISOString(),
    sourceFileName: backgroundImage.fileName,
    status: 'draft',
    walls: result.walls,
    wallCount,
    horizontalCount: result.horizontalCount,
    verticalCount: result.verticalCount,
    confidence,
    parameters: {
      gridSize,
      minWallLength: result.minWallLength
    }
  };
};

const mergeRecognitionWalls = (walls: Wall[], gridSize: number) => {
  const sortedWalls = walls
    .slice()
    .sort((left, right) => Number(isHorizontalWall(right)) - Number(isHorizontalWall(left)) || getWallLength(right) - getWallLength(left));
  const merged: Wall[] = [];

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
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [recognitionPreview, setRecognitionPreview] = useState<RecognitionSession | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [fitViewSignal, setFitViewSignal] = useState(0);
  const [centerViewSignal, setCenterViewSignal] = useState(0);

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

      return {
        ...current,
        rooms: current.rooms.filter((room) => room.id !== selection.id)
      };
    }, null);
  }, [commitChange, selection]);

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
    redo,
    rotateSelectedFurniture,
    selectedFurniture,
    undo,
    viewMode
  ]);

  const applyTemplate = (template: DesignTemplate) => {
    commitChange(() => cloneTemplateDesign(template), null);
    setImportWizardOpen(false);
    setRecognitionPreview(null);
    setZoom(0.82);
    setStagePosition({ x: 48, y: 48 });
    setStatusText(`已应用${template.name}`);
  };

  const handleNew = () => {
    commitChange(() => createEmptyDesign(), null);
    setImportWizardOpen(false);
    setRecognitionPreview(null);
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

    setHistory((items) => keepRecentHistory([...items, structuredClone(design)]));
    setFuture([]);
    setDesign(storedDesign);
    setSelection(null);
    setImportWizardOpen(false);
    setRecognitionPreview(null);
    setStatusText(`已打开${storedDesign.name}`);
  };

  const exportPng = () => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const dataUrl = stage.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = `${design.name || '全屋设计'}.png`;
    link.href = dataUrl;
    link.click();
    setStatusText('已导出 PNG');
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(stampDesign(design), null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.download = `${design.name || '全屋设计'}-方案.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setStatusText('已导出方案 JSON');
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
    const backgroundImage = await createBackgroundImage(file, design.canvas.width, design.canvas.height);
    commitChange((current) => ({ ...current, backgroundImage, recognition: undefined }), null);
    setRecognitionPreview(null);
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
    setStatusText('正在生成识别预览');

    try {
      const result = await recognizeFloorplanWalls(design.backgroundImage, { gridSize: design.canvas.gridSize });

      if (result.walls.length === 0) {
        setStatusText('未识别到足够清晰的墙体，请调高底图清晰度后重试');
        return;
      }

      setRecognitionPreview(createRecognitionSession(result, design.backgroundImage, design.canvas.gridSize));
      setImportWizardOpen(false);
      setMode('select');
      setViewMode('plan');
      setStatusText(`已生成 ${result.walls.length} 面墙的识别预览，请确认后写入方案`);
    } catch {
      setStatusText('自动识别失败，请换更清晰的户型图后重试');
    } finally {
      setRecognizingFloorplan(false);
    }
  };

  const keepBackgroundAsReference = () => {
    setRecognitionPreview(null);
    setImportWizardOpen(false);
    setMode('calibrate');
    setViewMode('plan');
    setStatusText('已保留底图作为参考，可继续标定比例或手动画墙');
  };

  const confirmRecognitionPreview = () => {
    if (!recognitionPreview) {
      return;
    }

    const confirmedRecognition: RecognitionSession = {
      ...recognitionPreview,
      status: 'confirmed',
      wallCount: recognitionPreview.walls.length
    };

    commitChange(
      (current) => ({
        ...current,
        walls: confirmedRecognition.walls,
        openings: [],
        rooms: [],
        recognition: confirmedRecognition,
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
    setRecognitionPreview(null);
    setImportWizardOpen(false);
    setMode('select');
    setViewMode('plan');
    setStatusText(`已写入 ${confirmedRecognition.walls.length} 面墙，可继续删除误识别墙或补墙`);
  };

  const discardRecognitionPreview = () => {
    setRecognitionPreview(null);
    setImportWizardOpen(false);
    setStatusText('已放弃识别预览，底图仍保留用于手动绘制');
  };

  const mergeRecognitionPreviewWalls = () => {
    setRecognitionPreview((current) => {
      if (!current) {
        return current;
      }

      const walls = mergeRecognitionWalls(current.walls, design.canvas.gridSize);
      setStatusText(`已合并为 ${walls.length} 面预览墙体`);
      return {
        ...current,
        walls,
        wallCount: walls.length
      };
    });
  };

  const removeShortRecognitionPreviewWalls = () => {
    setRecognitionPreview((current) => {
      if (!current) {
        return current;
      }

      const minLength = current.parameters.minWallLength * 1.15;
      const walls = current.walls.filter((wall) => getWallLength(wall) >= minLength);
      setStatusText(`已过滤短墙，剩余 ${walls.length} 面预览墙体`);
      return {
        ...current,
        walls,
        wallCount: walls.length
      };
    });
  };

  const modeText =
    viewMode === 'threeD'
      ? '3D预览'
      : mode === 'wall'
      ? '墙体绘制'
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
        onExport3DPng={exportThreeDPng}
        onViewModeChange={setViewMode}
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
          activeCategory={activeCategory}
          searchText={searchText}
          usedFurnitureIds={Array.from(new Set(design.furniture.map((item) => item.id)))}
          favoriteFurnitureIds={design.favoriteFurnitureIds ?? []}
          recommendedRoomNames={design.rooms.map((room) => room.name)}
          onModeChange={setMode}
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
              recognitionPreview={recognitionPreview}
              showGrid={showGrid}
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
          onChange={commitChange}
          onDelete={deleteSelection}
          onStartCalibration={startCalibration}
          onRecognizeFloorplan={recognizeFloorplan}
          onKeepBackgroundReference={keepBackgroundAsReference}
          onConfirmRecognitionPreview={confirmRecognitionPreview}
          onDiscardRecognitionPreview={discardRecognitionPreview}
          onMergeRecognitionPreviewWalls={mergeRecognitionPreviewWalls}
          onRemoveShortRecognitionPreviewWalls={removeShortRecognitionPreviewWalls}
          recognizingFloorplan={recognizingFloorplan}
          importWizardOpen={importWizardOpen}
          recognitionPreview={recognitionPreview}
        />
      </div>
    </div>
  );
}
