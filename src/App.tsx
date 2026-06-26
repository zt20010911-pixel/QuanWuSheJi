import type Konva from 'konva';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import DesignerCanvas from './components/DesignerCanvas';
import LeftPanel from './components/LeftPanel';
import PropertiesPanel from './components/PropertiesPanel';
import SelectedFurnitureToolbar from './components/SelectedFurnitureToolbar';
import ThreeDViewer, { type ThreeDViewerHandle } from './components/ThreeDViewer';
import TopBar from './components/TopBar';
import { FURNITURE_LIBRARY } from './data/furniture';
import { DESIGN_TEMPLATES, cloneTemplateDesign, createEmptyDesign } from './data/templates';
import { DEFAULT_MATERIAL_BRUSH, resolveFurnitureMaterial } from './data/furnitureMaterials';
import { DEFAULT_ROOM_ZONE_MATERIAL_IDS } from './data/materials';
import type {
  BackgroundImage,
  CameraViewpoint,
  DesignDocument,
  DesignTemplate,
  FurnitureComboDefinition,
  FurnitureDefinition,
  FurnitureInstance,
  ImportedModelAsset,
  ImportedModelFormat,
  MaterialBrushState,
  Point,
  RecognitionAttemptSnapshot,
  RecognitionCropBox,
  RecognitionIssueMarker,
  RecognitionOpeningCandidate,
  RecognitionMode,
  RecognitionProfile,
  RecognitionRoomCandidate,
  RecognitionSampledWallColor,
  RecognitionSession,
  RecognitionWall,
  RecognitionWorkspaceState,
  Selection,
  ToolMode,
  ViewMode,
  Wall,
  WallDrawMode,
  WalkthroughPath
} from './types';
import { getDesign, listDesigns, saveDesign } from './utils/designStorage';
import { createDeliveryHtml, createDxfDraft, createModelDraft, createPlanSvg } from './utils/designExport';
import { recognizeFloorplanWalls } from './utils/floorplanRecognition';
import { createId, snapPoint } from './utils/geometry';
import {
  DEFAULT_RECOGNITION_CANDIDATE_FILTERS,
  DEFAULT_RECOGNITION_WORKSPACE_STATE,
  DEFAULT_MODEL_ASSET_TRANSFORM,
  normalizeDesign,
  normalizeFurnitureInstance,
  normalizeRecognitionWall
} from './utils/designMigration';
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

const getImportedModelFormat = (fileName: string): ImportedModelFormat | null => {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'glb' || extension === 'gltf' || extension === 'obj') {
    return extension;
  }

  return null;
};

const loadImageElement = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片读取失败'));
    image.src = dataUrl;
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

const getFurnitureGroupCenter = (items: FurnitureInstance[]): Point => {
  if (items.length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: items.reduce((total, item) => total + item.x, 0) / items.length,
    y: items.reduce((total, item) => total + item.y, 0) / items.length
  };
};

const rotatePointAroundCenter = (point: Point, center: Point, degrees: number): Point => {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
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

const createDefaultRecognitionCropBox = (backgroundImage: BackgroundImage): RecognitionCropBox => {
  const insetX = Math.round(backgroundImage.width * 0.06);
  const insetY = Math.round(backgroundImage.height * 0.06);

  return {
    x: Math.round(backgroundImage.x + insetX),
    y: Math.round(backgroundImage.y + insetY),
    width: Math.round(Math.max(backgroundImage.width - insetX * 2, backgroundImage.width * 0.65)),
    height: Math.round(Math.max(backgroundImage.height - insetY * 2, backgroundImage.height * 0.65))
  };
};

const createRecognitionAttemptSnapshot = (
  result: Awaited<ReturnType<typeof recognizeFloorplanWalls>>
): RecognitionAttemptSnapshot => ({
  id: createId('recognition-attempt'),
  createdAt: new Date().toISOString(),
  profile: result.profile,
  mode: result.mode,
  wallCount: result.walls.length,
  openingCandidateCount: result.openingCandidates.length,
  roomCandidateCount: result.roomCandidates.length,
  outerFrameCoverage: result.qualityReport.outerFrameCoverage,
  disconnectedEndpointCount: result.qualityReport.disconnectedEndpointCount,
  missingWallHintCount: result.qualityReport.missingWallHintCount,
  qualityScore: result.qualityReport.qualityScore
});

const sampleBackgroundWallColor = async (
  backgroundImage: BackgroundImage,
  point: Point
): Promise<RecognitionSampledWallColor | null> => {
  const localX = Math.round(point.x - backgroundImage.x);
  const localY = Math.round(point.y - backgroundImage.y);

  if (localX < 0 || localY < 0 || localX > backgroundImage.width || localY > backgroundImage.height) {
    return null;
  }

  const image = await loadImageElement(backgroundImage.dataUrl);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    return null;
  }

  canvas.width = Math.max(1, Math.round(backgroundImage.width));
  canvas.height = Math.max(1, Math.round(backgroundImage.height));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixel = context.getImageData(Math.min(localX, canvas.width - 1), Math.min(localY, canvas.height - 1), 1, 1).data;

  return {
    r: pixel[0],
    g: pixel[1],
    b: pixel[2],
    tolerance: 58
  };
};

const createRecognitionSession = (
  result: Awaited<ReturnType<typeof recognizeFloorplanWalls>>,
  backgroundImage: BackgroundImage,
  gridSize: number,
  previousRecognition?: RecognitionSession | null
): RecognitionSession => {
  const walls: RecognitionWall[] = result.walls.map((wall) => ({
    ...wall,
    confidence: wall.confidence,
    source: wall.source,
    status: 'active'
  }));
  const openingCandidates: RecognitionOpeningCandidate[] = result.openingCandidates.map((candidate) => ({
    ...candidate,
    status: 'active'
  }));
  const roomCandidates: RecognitionRoomCandidate[] = result.roomCandidates.map((candidate) => ({
    ...candidate,
    status: 'active'
  }));
  const wallCount = walls.length;
  const confidence = wallCount >= 12 ? '高' : wallCount >= 6 ? '中' : '低';
  const attemptSnapshot = createRecognitionAttemptSnapshot(result);

  return {
    id: createId('recognition'),
    createdAt: new Date().toISOString(),
    sourceFileName: backgroundImage.fileName,
    status: 'draft',
    visible: true,
    opacity: 0.72,
    locked: false,
    selectedWallIds: [],
    selectedOpeningCandidateIds: [],
    selectedRoomCandidateIds: [],
    walls,
    openingCandidates,
    roomCandidates,
    qualityReport: result.qualityReport,
    candidateFilters: { ...DEFAULT_RECOGNITION_CANDIDATE_FILTERS },
    workspace: {
      ...DEFAULT_RECOGNITION_WORKSPACE_STATE,
      ...(previousRecognition?.workspace ?? {}),
      step: 'review',
      activeTool: 'select-candidate',
      showLowConfidence: false,
      showIssueMarkers: true
    },
    attemptHistory: [attemptSnapshot, ...(previousRecognition?.attemptHistory ?? [])].slice(0, 2),
    wallCount,
    horizontalCount: result.horizontalCount,
    verticalCount: result.verticalCount,
    confidence,
    parameters: {
      mode: result.mode,
      profile: result.profile,
      cropBox: result.cropBox,
      sampledWallColor: result.sampledWallColor,
      passes: result.passes,
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
  const selectableOpeningIds = new Set(
    (recognition.openingCandidates ?? []).filter((candidate) => candidate.status === 'active').map((candidate) => candidate.id)
  );
  const selectableRoomIds = new Set(
    (recognition.roomCandidates ?? []).filter((candidate) => candidate.status === 'active').map((candidate) => candidate.id)
  );

  return {
    ...recognition,
    selectedOpeningCandidateIds: (recognition.selectedOpeningCandidateIds ?? []).filter((id) => selectableOpeningIds.has(id)),
    selectedRoomCandidateIds: (recognition.selectedRoomCandidateIds ?? []).filter((id) => selectableRoomIds.has(id)),
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
  const [furnitureGroupClipboard, setFurnitureGroupClipboard] = useState<FurnitureInstance[] | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('plan');
  const [recognizingFloorplan, setRecognizingFloorplan] = useState(false);
  const [recognitionMode, setRecognitionMode] = useState<RecognitionMode>('complete');
  const [recognitionProfile, setRecognitionProfile] = useState<RecognitionProfile>('wall-priority');
  const [recognitionCropBox, setRecognitionCropBox] = useState<RecognitionCropBox | null>(null);
  const [recognitionWorkspace, setRecognitionWorkspace] = useState<RecognitionWorkspaceState>(DEFAULT_RECOGNITION_WORKSPACE_STATE);
  const [sampledWallColor, setSampledWallColor] = useState<RecognitionSampledWallColor | undefined>();
  const [samplingWallColor, setSamplingWallColor] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [wallDrawMode, setWallDrawMode] = useState<WallDrawMode>('single');
  const [showWallLengths, setShowWallLengths] = useState(true);
  const [wallDraftResetSignal, setWallDraftResetSignal] = useState(0);
  const [fitViewSignal, setFitViewSignal] = useState(0);
  const [centerViewSignal, setCenterViewSignal] = useState(0);

  const recognitionLayer = design.recognition ?? null;
  const selectedRecognitionIds = recognitionLayer?.selectedWallIds ?? [];
  const selectedRecognitionOpeningIds = recognitionLayer?.selectedOpeningCandidateIds ?? [];
  const selectedRecognitionRoomIds = recognitionLayer?.selectedRoomCandidateIds ?? [];
  const selectedRecognitionCandidateCount =
    selectedRecognitionIds.length + selectedRecognitionOpeningIds.length + selectedRecognitionRoomIds.length;

  const selectedFurniture =
    selection?.type === 'furniture' ? design.furniture.find((item) => item.instanceId === selection.id) ?? null : null;
  const selectedFurnitureGroup =
    selection?.type === 'furnitureGroup' ? design.furniture.filter((item) => item.groupId === selection.id) : [];
  const selectedFurnitureItems = selectedFurniture ? [selectedFurniture] : selectedFurnitureGroup;
  const selectedFurnitureGroupCenter = getFurnitureGroupCenter(selectedFurnitureGroup);

  const selectedFurnitureToolbarStyle = selectedFurniture
    ? {
        left: stagePosition.x + selectedFurniture.x * zoom,
        top:
          stagePosition.y +
          (selectedFurniture.y - ((selectedFurniture.depth / 100) * design.canvas.scalePxPerMeter) / 2) * zoom
      }
    : selectedFurnitureGroup.length
      ? {
          left: stagePosition.x + selectedFurnitureGroupCenter.x * zoom,
          top:
            stagePosition.y +
            (Math.min(...selectedFurnitureGroup.map((item) => item.y)) -
              Math.max(...selectedFurnitureGroup.map((item) => (item.depth / 100) * design.canvas.scalePxPerMeter)) / 2) *
              zoom
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

  const updateRecognitionWorkspace = useCallback(
    (patch: Partial<RecognitionWorkspaceState>) => {
      setRecognitionWorkspace((current) => ({ ...current, ...patch }));

      if (design.recognition) {
        commitChange((current) => ({
          ...current,
          recognition: current.recognition
            ? {
                ...current.recognition,
                workspace: {
                  ...DEFAULT_RECOGNITION_WORKSPACE_STATE,
                  ...(current.recognition.workspace ?? {}),
                  ...patch
                }
              }
            : current.recognition
        }));
      }
    },
    [commitChange, design.recognition]
  );

  useEffect(() => {
    if (design.recognition?.workspace) {
      setRecognitionWorkspace({
        ...DEFAULT_RECOGNITION_WORKSPACE_STATE,
        ...design.recognition.workspace
      });
    }
  }, [design.recognition?.id, design.recognition?.workspace]);

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

    if (selectedRecognitionCandidateCount > 0) {
      const selectedIds = new Set(selectedRecognitionIds);
      const selectedOpeningIds = new Set(selectedRecognitionOpeningIds);
      const selectedRoomIds = new Set(selectedRecognitionRoomIds);

      commitChange((current) => {
        if (!current.recognition) {
          return current;
        }

        return {
          ...current,
          recognition: withRecognitionCounts({
            ...current.recognition,
            selectedWallIds: [],
            selectedOpeningCandidateIds: [],
            selectedRoomCandidateIds: [],
            walls: current.recognition.walls.map((wall) =>
              selectedIds.has(wall.id) && wall.status === 'active'
                ? { ...wall, status: 'deleted', updatedAt: new Date().toISOString() }
                : wall
            ),
            openingCandidates: (current.recognition.openingCandidates ?? []).map((candidate) =>
              selectedOpeningIds.has(candidate.id) && candidate.status === 'active'
                ? { ...candidate, status: 'deleted', updatedAt: new Date().toISOString() }
                : candidate
            ),
            roomCandidates: (current.recognition.roomCandidates ?? []).map((candidate) =>
              selectedRoomIds.has(candidate.id) && candidate.status === 'active'
                ? { ...candidate, status: 'deleted', updatedAt: new Date().toISOString() }
                : candidate
            )
          })
        };
      });
      setStatusText(`已删除 ${selectedRecognitionCandidateCount} 个识别候选`);
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

      if (selection.type === 'furnitureGroup') {
        return {
          ...current,
          furniture: current.furniture.filter((item) => item.groupId !== selection.id)
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
  }, [
    commitChange,
    resetWallDraft,
    selectedRecognitionCandidateCount,
    selectedRecognitionIds,
    selectedRecognitionOpeningIds,
    selectedRecognitionRoomIds,
    selection
  ]);

  const copySelectedFurniture = useCallback(() => {
    if (selectedFurnitureGroup.length > 0) {
      setFurnitureGroupClipboard(structuredClone(selectedFurnitureGroup));
      setFurnitureClipboard(null);
      setStatusText(`已复制组合 ${selectedFurnitureGroup[0].groupName ?? '家具组合'}`);
      return;
    }

    if (!selectedFurniture) {
      return;
    }

    setFurnitureClipboard(structuredClone(selectedFurniture));
    setFurnitureGroupClipboard(null);
    setStatusText(`已复制 ${selectedFurniture.name}`);
  }, [selectedFurniture, selectedFurnitureGroup]);

  const pasteFurniture = useCallback(() => {
    if (furnitureGroupClipboard?.length) {
      const offset = design.canvas.gridSize;
      const nextGroupId = createId('furniture-group');
      const groupCenter = getFurnitureGroupCenter(furnitureGroupClipboard);
      const groupName = furnitureGroupClipboard[0].groupName ?? '家具组合';
      const nextFurniture = furnitureGroupClipboard.map((item) =>
        normalizeFurnitureInstance({
          ...structuredClone(item),
          instanceId: createId('furniture'),
          groupId: nextGroupId,
          groupName,
          x: item.x - groupCenter.x + groupCenter.x + offset,
          y: item.y - groupCenter.y + groupCenter.y + offset
        })
      );

      commitChange(
        (current) => ({
          ...current,
          furniture: [...current.furniture, ...nextFurniture]
        }),
        { type: 'furnitureGroup', id: nextGroupId }
      );
      setFurnitureGroupClipboard(nextFurniture);
      setStatusText(`已粘贴组合 ${groupName}`);
      return;
    }

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
  }, [commitChange, design.canvas.gridSize, furnitureClipboard, furnitureGroupClipboard]);

  const rotateSelectedFurniture = useCallback(() => {
    if (selectedFurnitureGroup.length > 0) {
      const selectedGroupId = selectedFurnitureGroup[0].groupId;
      const center = getFurnitureGroupCenter(selectedFurnitureGroup);

      commitChange((current) => ({
        ...current,
        furniture: current.furniture.map((item) => {
          if (!selectedGroupId || item.groupId !== selectedGroupId) {
            return item;
          }

          const point = rotatePointAroundCenter(item, center, 90);
          return {
            ...item,
            x: point.x,
            y: point.y,
            rotation: (item.rotation + 90) % 360
          };
        })
      }));
      return;
    }

    if (!selectedFurniture) {
      return;
    }

    commitChange((current) => ({
      ...current,
      furniture: current.furniture.map((item) =>
        item.instanceId === selectedFurniture.instanceId ? { ...item, rotation: (item.rotation + 90) % 360 } : item
      )
    }));
  }, [commitChange, selectedFurniture, selectedFurnitureGroup]);

  const nudgeSelectedFurniture = useCallback(
    (deltaX: number, deltaY: number) => {
      if (selectedFurnitureGroup.length > 0) {
        const selectedGroupId = selectedFurnitureGroup[0].groupId;

        commitChange((current) => ({
          ...current,
          furniture: current.furniture.map((item) =>
            selectedGroupId && item.groupId === selectedGroupId
              ? {
                  ...item,
                  x: item.x + deltaX,
                  y: item.y + deltaY
                }
              : item
          )
        }));
        return;
      }

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
    [commitChange, selectedFurniture, selectedFurnitureGroup]
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
        if (selectedFurnitureItems.length > 0) {
          event.preventDefault();
          copySelectedFurniture();
        }
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'v') {
        if (furnitureClipboard || furnitureGroupClipboard?.length) {
          event.preventDefault();
          pasteFurniture();
        }
        return;
      }

      if (!event.ctrlKey && event.key.toLowerCase() === 'r') {
        if (selectedFurnitureItems.length > 0) {
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

      if (nudge && selectedFurnitureItems.length > 0) {
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
    furnitureGroupClipboard,
    nudgeSelectedFurniture,
    pasteFurniture,
    mode,
    redo,
    resetWallDraft,
    rotateSelectedFurniture,
    selectedFurniture,
    selectedFurnitureItems.length,
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
  ) => {
    const snapshot = stampDesign({
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

    setDesign(snapshot);
    return snapshot;
  };

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
    createExportSnapshot('png', fileName);
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

  const getSvgExportOptions = (snapshot: DesignDocument, includeBackground?: boolean) => ({
    showGrid: snapshot.printSettings?.showGrid ?? true,
    showWallLengths: snapshot.printSettings?.showWallLengths ?? true,
    showRoomAreas: snapshot.printSettings?.showRoomAreas ?? true,
    includeBackground: includeBackground ?? snapshot.exportDraftSettings?.includeBackgroundInSvg ?? false,
    includeRecognitionLayer: snapshot.exportDraftSettings?.includeRecognitionLayer ?? false
  });

  const exportSvgPlan = () => {
    const fileName = `${design.name || '全屋设计'}-平面图.svg`;
    const snapshot = createExportSnapshot('svg-plan', fileName);
    const svg = createPlanSvg(snapshot, getSvgExportOptions(snapshot));

    downloadBlob(svg, 'image/svg+xml;charset=utf-8', fileName);
    setStatusText('已导出 SVG 平面图');
  };

  const exportHtmlReport = () => {
    const fileName = `${design.name || '全屋设计'}-交付报告.html`;
    const snapshot = createExportSnapshot('html-report', fileName);
    const planImage = getPlanDataUrl();
    const svg = createPlanSvg(snapshot, getSvgExportOptions(snapshot, snapshot.printSettings?.showBackground));
    const html = createDeliveryHtml(snapshot, planImage, svg, 'report', snapshot.printSettings!);

    downloadBlob(html, 'text/html;charset=utf-8', fileName);
    setStatusText('已导出 HTML 交付报告');
  };

  const exportPrintLayout = () => {
    const fileName = `${design.name || '全屋设计'}-打印布局.html`;
    const snapshot = createExportSnapshot('print-layout', fileName);
    const planImage = getPlanDataUrl();
    const svg = createPlanSvg(snapshot, getSvgExportOptions(snapshot, snapshot.printSettings?.showBackground));
    const html = createDeliveryHtml(snapshot, planImage, svg, 'print', snapshot.printSettings!);

    downloadBlob(html, 'text/html;charset=utf-8', fileName);
    setStatusText('已导出打印布局 HTML，可用 Chrome 打印为 PDF');
  };

  const exportPdfReport = () => {
    const fileName = `${design.name || '全屋设计'}-PDF打印报告.html`;
    const snapshot = createExportSnapshot('pdf-report', fileName);
    const planImage = getPlanDataUrl();
    const svg = createPlanSvg(snapshot, getSvgExportOptions(snapshot, snapshot.printSettings?.showBackground));
    const html = createDeliveryHtml(snapshot, planImage, svg, 'print', snapshot.printSettings!);

    downloadBlob(html, 'text/html;charset=utf-8', fileName);
    setStatusText('已导出 PDF 打印报告 HTML，请用 Chrome 打印为 PDF');
  };

  const exportDxfDraft = () => {
    const fileName = `${design.name || '全屋设计'}-DXF草案.dxf`;
    const snapshot = createExportSnapshot('dxf-draft', fileName);
    const content = createDxfDraft(snapshot, snapshot.exportDraftSettings!);

    downloadBlob(content, 'application/dxf;charset=utf-8', fileName);
    setStatusText('已导出 DXF 草案');
  };

  const exportModelDraft = (format: 'glb' | 'obj') => {
    const kind = format === 'glb' ? 'glb-draft' : 'obj-draft';
    const fileName = `${design.name || '全屋设计'}-${format.toUpperCase()}草案.json`;
    const snapshot = createExportSnapshot(kind, fileName);
    const content = createModelDraft(snapshot, format, snapshot.exportDraftSettings!);

    downloadBlob(content, 'application/json;charset=utf-8', fileName);
    setStatusText(`已导出 ${format.toUpperCase()} 草案`);
  };

  const exportThreeDPng = () => {
    threeViewerRef.current?.exportPng();
    createExportSnapshot('3d-png', `${design.name || '全屋设计'}-3D效果图.png`);
    setStatusText('已导出 3D 效果图');
  };

  const captureThreeDViewpoint = (name: string): CameraViewpoint | null => {
    if (viewMode !== 'threeD') {
      setStatusText('请先切换到 3D 视图再保存机位');
      return null;
    }

    const viewpoint = threeViewerRef.current?.getCameraViewpoint(name) ?? null;

    if (!viewpoint) {
      setStatusText('3D 视图还未准备好，请稍后再试');
      return null;
    }

    setStatusText(`已保存机位：${viewpoint.name}`);
    return viewpoint;
  };

  const previewWalkthroughPath = (path: WalkthroughPath) => {
    if (viewMode !== 'threeD') {
      setStatusText('请先切换到 3D 视图再预览漫游');
      return;
    }

    threeViewerRef.current?.previewWalkthrough(path);
    setStatusText(`正在预览漫游路径：${path.name}`);
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

  const toggleFurnitureComboFavorite = (id: string) => {
    commitChange((current) => {
      const favoriteIds = new Set(current.favoriteFurnitureComboIds ?? []);

      if (favoriteIds.has(id)) {
        favoriteIds.delete(id);
      } else {
        favoriteIds.add(id);
      }

      return {
        ...current,
        favoriteFurnitureComboIds: Array.from(favoriteIds)
      };
    });
    setStatusText('已更新组合收藏');
  };

  const handleFurnitureDragStart = (item: FurnitureDefinition) => {
    setDraggedFurnitureId(`furniture:${item.id}`);
  };

  const handleFurnitureComboDragStart = (item: FurnitureComboDefinition) => {
    setDraggedFurnitureId(`combo:${item.id}`);
  };

  const getViewportCenterPoint = useCallback((): Point => {
    const stage = stageRef.current;
    const width = stage?.width() ?? window.innerWidth;
    const height = stage?.height() ?? window.innerHeight;

    return snapPoint(
      {
        x: (width / 2 - stagePosition.x) / zoom,
        y: (height / 2 - stagePosition.y) / zoom
      },
      design.canvas.gridSize
    );
  }, [design.canvas.gridSize, stagePosition.x, stagePosition.y, zoom]);

  const addFurnitureToViewportCenter = useCallback(
    (item: FurnitureDefinition) => {
      const position = getViewportCenterPoint();
      const instanceId = createId('furniture');
      const nextFurniture = normalizeFurnitureInstance({
        ...item,
        instanceId,
        x: position.x,
        y: position.y,
        rotation: 0
      });

      commitChange(
        (current) => ({
          ...current,
          furniture: [...current.furniture, nextFurniture]
        }),
        { type: 'furniture', id: instanceId }
      );
      setMode('select');
      setDraggedFurnitureId(null);
      setStatusText(`已添加 ${item.name}`);
    },
    [commitChange, getViewportCenterPoint]
  );

  const addFurnitureComboToViewportCenter = useCallback(
    (combo: FurnitureComboDefinition) => {
      const position = getViewportCenterPoint();
      const groupId = createId('furniture-group');
      const nextFurniture = combo.items.reduce<FurnitureInstance[]>((items, comboItem) => {
        const definition = FURNITURE_LIBRARY.find((item) => item.id === comboItem.furnitureId);

        if (!definition) {
          return items;
        }

        const itemPosition = snapPoint(
          {
            x: position.x + (comboItem.offsetX / 100) * design.canvas.scalePxPerMeter,
            y: position.y + (comboItem.offsetY / 100) * design.canvas.scalePxPerMeter
          },
          design.canvas.gridSize
        );

        items.push(
          normalizeFurnitureInstance({
            ...definition,
            instanceId: createId('furniture'),
            x: itemPosition.x,
            y: itemPosition.y,
            rotation: comboItem.rotation ?? 0,
            groupId,
            groupName: combo.name,
            comboDefinitionId: combo.id
          })
        );

        return items;
      }, []);

      if (nextFurniture.length === 0) {
        setStatusText('组合家具缺少可用子项');
        return;
      }

      commitChange(
        (current) => ({
          ...current,
          furniture: [...current.furniture, ...nextFurniture]
        }),
        { type: 'furnitureGroup', id: groupId }
      );
      setMode('select');
      setDraggedFurnitureId(null);
      setStatusText(`已添加组合 ${combo.name}`);
    },
    [commitChange, design.canvas.gridSize, design.canvas.scalePxPerMeter, getViewportCenterPoint]
  );

  const handleModelAssetUpload = useCallback(
    async (file: File) => {
      const format = getImportedModelFormat(file.name);

      if (!format) {
        setStatusText('只支持上传 GLB、GLTF 或 OBJ 模型文件');
        return;
      }

      const dataUrl = await readFileAsDataUrl(file);
      const asset: ImportedModelAsset = {
        id: createId('model-asset'),
        name: file.name.replace(/\.(glb|gltf|obj)$/i, '') || '本地模型',
        fileName: file.name,
        format,
        sizeBytes: file.size,
        dataUrl,
        category: '本地模型',
        importedAt: new Date().toISOString(),
        transform: DEFAULT_MODEL_ASSET_TRANSFORM
      };

      commitChange((current) => ({
        ...current,
        importedModelAssets: [asset, ...(current.importedModelAssets ?? [])]
      }));
      setActiveCategory('模型');
      setStatusText(`已导入模型 ${asset.name}`);
    },
    [commitChange]
  );

  const addModelAssetToViewportCenter = useCallback(
    (asset: ImportedModelAsset) => {
      const position = getViewportCenterPoint();
      const instanceId = createId('furniture');
      const nextFurniture = normalizeFurnitureInstance(
        {
          id: `model-furniture-${asset.id}`,
          category: asset.category || '模型',
          subcategory: '本地模型',
          name: asset.name,
          width: 120,
          depth: 120,
          height: 1,
          material: '本地模型',
          materialId: 'wood-oak',
          favorite: false,
          recommendedRooms: [],
          styleTags: ['本地模型'],
          modelType: 'external-draft',
          modelVariant: 'external-draft',
          modelAssetId: asset.id,
          modelTransform: asset.transform,
          product: {
            brand: '',
            series: '',
            sku: asset.fileName,
            referencePrice: 0,
            productUrl: '',
            imageUrl: '',
            supplierNote: '本地上传模型草案',
            modelSource: 'local-upload',
            isRealProduct: false
          },
          color: '#d9e5df',
          accentColor: '#6c8f80',
          shape: 'rect',
          instanceId,
          x: position.x,
          y: position.y,
          rotation: 0
        },
        [asset.id]
      );

      commitChange(
        (current) => ({
          ...current,
          furniture: [...current.furniture, nextFurniture]
        }),
        { type: 'furniture', id: instanceId }
      );
      setMode('select');
      setStatusText(`已添加模型家具 ${asset.name}`);
    },
    [commitChange, getViewportCenterPoint]
  );

  const deleteModelAsset = useCallback(
    (assetId: string) => {
      commitChange((current) => ({
        ...current,
        importedModelAssets: (current.importedModelAssets ?? []).filter((asset) => asset.id !== assetId),
        furniture: current.furniture.map((item) =>
          item.modelAssetId === assetId
            ? {
                ...item,
                modelAssetId: undefined,
                modelTransform: DEFAULT_MODEL_ASSET_TRANSFORM,
                modelType: 'procedural'
              }
            : item
        )
      }));
      setStatusText('已删除模型资源，相关家具已恢复为程序化体块');
    },
    [commitChange]
  );

  const handleBackgroundUpload = async (file: File) => {
    resetWallDraft();
    const backgroundImage = await createBackgroundImage(file, design.canvas.width, design.canvas.height);
    const cropBox = createDefaultRecognitionCropBox(backgroundImage);
    setRecognitionProfile('wall-priority');
    setRecognitionMode('complete');
    setRecognitionCropBox(cropBox);
    setRecognitionWorkspace({
      step: 'range',
      activeTool: 'crop',
      showLowConfidence: false,
      showIssueMarkers: true
    });
    setSampledWallColor(undefined);
    setSamplingWallColor(false);
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

  const recognizeFloorplanWithCropBox = async (cropBoxOverride?: RecognitionCropBox) => {
    if (!design.backgroundImage || recognizingFloorplan) {
      return;
    }

    setRecognizingFloorplan(true);
    setStatusText('正在识别到独立图层');
    setRecognitionWorkspace((current) => ({ ...current, step: 'recognize', activeTool: 'select-candidate' }));

    try {
      const cropBox = cropBoxOverride ?? recognitionCropBox ?? design.recognition?.parameters.cropBox ?? createDefaultRecognitionCropBox(design.backgroundImage);
      const mode = recognitionProfile === 'clean' ? 'precise' : recognitionMode;
      const sampledColor = sampledWallColor ?? design.recognition?.parameters.sampledWallColor;
      const result = await recognizeFloorplanWalls(design.backgroundImage, {
        gridSize: design.canvas.gridSize,
        scalePxPerMeter: design.canvas.scalePxPerMeter,
        mode,
        profile: recognitionProfile,
        cropBox,
        sampledWallColor: sampledColor
      });

      if (result.walls.length === 0) {
        setStatusText('未识别到足够清晰的墙体，请调高底图清晰度后重试');
        setRecognitionWorkspace((current) => ({ ...current, step: 'range', activeTool: 'crop' }));
        return;
      }

      const recognition = createRecognitionSession(result, design.backgroundImage, design.canvas.gridSize, design.recognition);
      setRecognitionWorkspace(recognition.workspace ?? DEFAULT_RECOGNITION_WORKSPACE_STATE);

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
      setRecognitionCropBox(cropBox);
      setMode('select');
      setViewMode('plan');
      setStatusText(
        `已识别到独立图层：${result.walls.length} 面墙、${result.openingCandidates.length} 个门窗候选、${result.roomCandidates.length} 个房间候选，质量 ${result.qualityReport.qualityScore} 分`
      );
    } catch {
      setStatusText('自动识别失败，请换更清晰的户型图后重试');
      setRecognitionWorkspace((current) => ({ ...current, step: 'range', activeTool: 'crop' }));
    } finally {
      setRecognizingFloorplan(false);
    }
  };

  const recognizeFloorplan = () => {
    void recognizeFloorplanWithCropBox();
  };

  const recognizeSelectedArea = () => {
    if (!design.backgroundImage || !design.recognition) {
      setStatusText('请先上传户型图并完成一次识别');
      return;
    }

    const selectedIds = new Set(design.recognition.selectedWallIds);
    const selectedWalls = design.recognition.walls.filter((wall) => selectedIds.has(wall.id));

    if (selectedWalls.length === 0) {
      setStatusText('请先选择需要重新识别的候选墙区域');
      return;
    }

    const padding = Math.max(design.canvas.gridSize * 6, 120);
    const xValues = selectedWalls.flatMap((wall) => [wall.start.x, wall.end.x]);
    const yValues = selectedWalls.flatMap((wall) => [wall.start.y, wall.end.y]);
    const left = Math.max(design.backgroundImage.x, Math.min(...xValues) - padding);
    const top = Math.max(design.backgroundImage.y, Math.min(...yValues) - padding);
    const right = Math.min(design.backgroundImage.x + design.backgroundImage.width, Math.max(...xValues) + padding);
    const bottom = Math.min(design.backgroundImage.y + design.backgroundImage.height, Math.max(...yValues) + padding);
    const cropBox = {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(Math.max(design.canvas.gridSize * 4, right - left)),
      height: Math.round(Math.max(design.canvas.gridSize * 4, bottom - top))
    };

    setRecognitionCropBox(cropBox);
    setRecognitionWorkspace({ step: 'recognize', activeTool: 'select-candidate', showLowConfidence: false, showIssueMarkers: true });
    void recognizeFloorplanWithCropBox(cropBox);
  };

  const keepBackgroundAsReference = () => {
    setImportWizardOpen(false);
    setSamplingWallColor(false);
    setMode('calibrate');
    setViewMode('plan');
    setStatusText('已保留底图作为参考，可继续标定比例或手动画墙');
  };

  const startWallColorSampling = () => {
    if (!design.backgroundImage) {
      setStatusText('请先上传户型底图');
      return;
    }

    setSamplingWallColor(true);
    updateRecognitionWorkspace({ step: 'range', activeTool: 'sample-color' });
    setMode('select');
    setViewMode('plan');
    setStatusText('请在底图真实墙体上点击一次完成采样');
  };

  const handleWallColorSample = async (point: Point) => {
    if (!design.backgroundImage || !samplingWallColor) {
      return;
    }

    const sampled = await sampleBackgroundWallColor(design.backgroundImage, point);

    if (!sampled) {
      setStatusText('采样点不在户型底图内，请重新点击墙体');
      return;
    }

    setSampledWallColor(sampled);
    setSamplingWallColor(false);
    updateRecognitionWorkspace({ step: 'recognize', activeTool: 'select-candidate' });
    setStatusText(`已采样墙体颜色 RGB(${sampled.r}, ${sampled.g}, ${sampled.b})`);
  };

  const updateRecognitionCropBox = (cropBox: RecognitionCropBox) => {
    setRecognitionCropBox(cropBox);
    setRecognitionWorkspace((current) => ({ ...current, step: 'range', activeTool: 'crop' }));
    commitChange((current) => ({
      ...current,
      recognition: current.recognition
        ? {
            ...current.recognition,
            parameters: {
              ...current.recognition.parameters,
              cropBox
            }
          }
        : current.recognition
    }), null);
  };

  const createWallFromIssueMarker = (marker: RecognitionIssueMarker): RecognitionWall | null => {
    if (!marker.proposedWall) {
      return null;
    }

    return {
      ...marker.proposedWall,
      id: createId('rec-wall'),
      status: 'active',
      confidence: 0.48,
      source: 'inferred',
      updatedAt: new Date().toISOString()
    };
  };

  const applyRecognitionIssueMarker = (markerId: string) => {
    updateRecognitionLayer(
      (recognition) => {
        const markers = recognition.qualityReport?.issueMarkers ?? [];
        const marker = markers.find((item) => item.id === markerId);
        const wall = marker ? createWallFromIssueMarker(marker) : null;

        if (!marker || !wall) {
          return recognition;
        }

        return {
          ...recognition,
          workspace: {
            ...DEFAULT_RECOGNITION_WORKSPACE_STATE,
            ...(recognition.workspace ?? {}),
            step: 'review',
            activeTool: 'add-gap-wall'
          },
          selectedWallIds: [wall.id],
          walls: [...recognition.walls, wall],
          qualityReport: recognition.qualityReport
            ? {
                ...recognition.qualityReport,
                outerGapMarkers: recognition.qualityReport.outerGapMarkers.map((item) =>
                  item.id === markerId ? { ...item, status: 'resolved' } : item
                ),
                issueMarkers: recognition.qualityReport.issueMarkers.map((item) =>
                  item.id === markerId ? { ...item, status: 'resolved' } : item
                )
              }
            : recognition.qualityReport
        };
      },
      '已根据缺口标记生成补墙'
    );
  };

  const applyAllOuterGapMarkers = () => {
    updateRecognitionLayer(
      (recognition) => {
        const markers = (recognition.qualityReport?.outerGapMarkers ?? []).filter((marker) => marker.status === 'active');
        const walls = markers.map(createWallFromIssueMarker).filter((wall): wall is RecognitionWall => Boolean(wall));

        if (walls.length === 0) {
          return recognition;
        }

        const markerIds = new Set(markers.map((marker) => marker.id));

        return {
          ...recognition,
          workspace: {
            ...DEFAULT_RECOGNITION_WORKSPACE_STATE,
            ...(recognition.workspace ?? {}),
            step: 'review',
            activeTool: 'add-gap-wall'
          },
          selectedWallIds: walls.map((wall) => wall.id),
          walls: [...recognition.walls, ...walls],
          qualityReport: recognition.qualityReport
            ? {
                ...recognition.qualityReport,
                outerGapMarkers: recognition.qualityReport.outerGapMarkers.map((item) =>
                  markerIds.has(item.id) ? { ...item, status: 'resolved' } : item
                ),
                issueMarkers: recognition.qualityReport.issueMarkers.map((item) =>
                  markerIds.has(item.id) ? { ...item, status: 'resolved' } : item
                )
              }
            : recognition.qualityReport
        };
      },
      '已一键生成外框补墙候选'
    );
  };

  const ignoreRecognitionIssueMarker = (markerId: string) => {
    updateRecognitionLayer(
      (recognition) => ({
        ...recognition,
        qualityReport: recognition.qualityReport
          ? {
              ...recognition.qualityReport,
              outerGapMarkers: recognition.qualityReport.outerGapMarkers.map((item) =>
                item.id === markerId ? { ...item, status: 'ignored' } : item
              ),
              issueMarkers: recognition.qualityReport.issueMarkers.map((item) =>
                item.id === markerId ? { ...item, status: 'ignored' } : item
              )
            }
          : recognition.qualityReport
      }),
      '已忽略该识别提示'
    );
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
        selectedOpeningCandidateIds: [],
        selectedRoomCandidateIds: [],
        selectedWallIds: recognition.walls.filter((wall) => wall.status === 'active').map((wall) => wall.id)
      }),
      '已选中全部可写入识别墙'
    );
  };

  const selectAllRecognitionOpenings = () => {
    updateRecognitionLayer(
      (recognition) => ({
        ...recognition,
        selectedWallIds: [],
        selectedRoomCandidateIds: [],
        selectedOpeningCandidateIds: (recognition.openingCandidates ?? [])
          .filter((candidate) => candidate.status === 'active')
          .map((candidate) => candidate.id)
      }),
      '已选中全部门窗候选'
    );
  };

  const selectAllRecognitionRooms = () => {
    updateRecognitionLayer(
      (recognition) => ({
        ...recognition,
        selectedWallIds: [],
        selectedOpeningCandidateIds: [],
        selectedRoomCandidateIds: (recognition.roomCandidates ?? [])
          .filter((candidate) => candidate.status === 'active')
          .map((candidate) => candidate.id)
      }),
      '已选中全部房间候选'
    );
  };

  const clearRecognitionSelection = () => {
    updateRecognitionLayer(
      (recognition) => ({
        ...recognition,
        selectedWallIds: [],
        selectedOpeningCandidateIds: [],
        selectedRoomCandidateIds: []
      }),
      '已清空识别候选选择'
    );
  };

  const deleteSelectedRecognitionWalls = () => {
    const selectedIds = new Set(selectedRecognitionIds);
    const selectedOpeningIds = new Set(selectedRecognitionOpeningIds);
    const selectedRoomIds = new Set(selectedRecognitionRoomIds);

    if (selectedRecognitionCandidateCount === 0) {
      return;
    }

    updateRecognitionLayer(
      (recognition) => ({
        ...recognition,
        selectedWallIds: [],
        selectedOpeningCandidateIds: [],
        selectedRoomCandidateIds: [],
        walls: recognition.walls.map((wall) =>
          selectedIds.has(wall.id) && wall.status === 'active'
            ? { ...wall, status: 'deleted', updatedAt: new Date().toISOString() }
            : wall
        ),
        openingCandidates: (recognition.openingCandidates ?? []).map((candidate) =>
          selectedOpeningIds.has(candidate.id) && candidate.status === 'active'
            ? { ...candidate, status: 'deleted', updatedAt: new Date().toISOString() }
            : candidate
        ),
        roomCandidates: (recognition.roomCandidates ?? []).map((candidate) =>
          selectedRoomIds.has(candidate.id) && candidate.status === 'active'
            ? { ...candidate, status: 'deleted', updatedAt: new Date().toISOString() }
            : candidate
        )
      }),
      `已删除 ${selectedRecognitionCandidateCount} 个识别候选`
    );
  };

  const restoreDeletedRecognitionWalls = () => {
    updateRecognitionLayer(
      (recognition) => ({
        ...recognition,
        walls: recognition.walls.map((wall) =>
          wall.status === 'deleted' ? { ...wall, status: 'active', updatedAt: new Date().toISOString() } : wall
        ),
        openingCandidates: (recognition.openingCandidates ?? []).map((candidate) =>
          candidate.status === 'deleted' ? { ...candidate, status: 'active', updatedAt: new Date().toISOString() } : candidate
        ),
        roomCandidates: (recognition.roomCandidates ?? []).map((candidate) =>
          candidate.status === 'deleted' ? { ...candidate, status: 'active', updatedAt: new Date().toISOString() } : candidate
        )
      }),
      '已恢复删除的识别候选'
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
        workspace: {
          ...DEFAULT_RECOGNITION_WORKSPACE_STATE,
          ...(current.recognition.workspace ?? {}),
          step: 'promote',
          activeTool: 'select-candidate'
        },
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

  const promoteRecognitionOpenings = (scope: 'selected' | 'all') => {
    const selectedIds = new Set(selectedRecognitionOpeningIds);
    let promotedCount = 0;

    commitChange((current) => {
      if (!current.recognition) {
        return current;
      }

      const sourceCandidates = (current.recognition.openingCandidates ?? []).filter(
        (candidate) => candidate.status === 'active' && (scope === 'all' || selectedIds.has(candidate.id))
      );

      if (sourceCandidates.length === 0) {
        return current;
      }

      const promotedPairs = sourceCandidates.reduce<Array<{ candidateId: string; opening: DesignDocument['openings'][number] }>>(
        (items, candidate) => {
          const promotedWallId = candidate.wallId
            ? current.recognition?.walls.find((wall) => wall.id === candidate.wallId)?.promotedWallId
            : undefined;

          if (!promotedWallId) {
            return items;
          }

          items.push({
            candidateId: candidate.id,
            opening: {
              id: createId(candidate.kind),
              kind: candidate.kind,
              wallId: promotedWallId,
              x: candidate.x,
              y: candidate.y,
              width: candidate.width,
              rotation: candidate.rotation
            }
          });
          return items;
        },
        []
      );

      if (promotedPairs.length === 0) {
        return current;
      }

      promotedCount = promotedPairs.length;
      const promotedMap = new Map(promotedPairs.map((item) => [item.candidateId, item.opening.id]));
      const recognition = withRecognitionCounts({
        ...current.recognition,
        status: 'confirmed',
        workspace: {
          ...DEFAULT_RECOGNITION_WORKSPACE_STATE,
          ...(current.recognition.workspace ?? {}),
          step: 'promote',
          activeTool: 'select-candidate'
        },
        selectedOpeningCandidateIds: [],
        openingCandidates: (current.recognition.openingCandidates ?? []).map((candidate) =>
          promotedMap.has(candidate.id)
            ? {
                ...candidate,
                status: 'promoted',
                promotedOpeningId: promotedMap.get(candidate.id),
                updatedAt: new Date().toISOString()
              }
            : candidate
        )
      });

      return {
        ...current,
        openings: [...current.openings, ...promotedPairs.map((item) => item.opening)],
        recognition
      };
    });

    setStatusText(
      promotedCount > 0
        ? `已写入 ${promotedCount} 个识别门窗`
        : '请先写入相关识别墙，再写入门窗候选'
    );
  };

  const promoteRecognitionRooms = (scope: 'selected' | 'all') => {
    const selectedIds = new Set(selectedRecognitionRoomIds);
    let promotedCount = 0;

    commitChange((current) => {
      if (!current.recognition) {
        return current;
      }

      const sourceCandidates = (current.recognition.roomCandidates ?? []).filter(
        (candidate) => candidate.status === 'active' && (scope === 'all' || selectedIds.has(candidate.id))
      );

      if (sourceCandidates.length === 0) {
        return current;
      }

      const colors = ['#7cc8a8', '#8fb7e8', '#e5b56c', '#d98f8f'];
      const promotedPairs = sourceCandidates.map((candidate, index) => ({
        candidateId: candidate.id,
        roomZone: {
          id: createId('room-zone'),
          name: candidate.name ?? `识别房间 ${(current.roomZones ?? []).length + index + 1}`,
          points: candidate.points,
          label: candidate.label,
          manualAreaSqm: candidate.areaSqm,
          materialIds: { ...DEFAULT_ROOM_ZONE_MATERIAL_IDS },
          color: colors[((current.roomZones ?? []).length + index) % colors.length]
        }
      }));

      promotedCount = promotedPairs.length;
      const promotedMap = new Map(promotedPairs.map((item) => [item.candidateId, item.roomZone.id]));
      const recognition = withRecognitionCounts({
        ...current.recognition,
        status: 'confirmed',
        workspace: {
          ...DEFAULT_RECOGNITION_WORKSPACE_STATE,
          ...(current.recognition.workspace ?? {}),
          step: 'promote',
          activeTool: 'select-candidate'
        },
        selectedRoomCandidateIds: [],
        roomCandidates: (current.recognition.roomCandidates ?? []).map((candidate) =>
          promotedMap.has(candidate.id)
            ? {
                ...candidate,
                status: 'promoted',
                promotedRoomZoneId: promotedMap.get(candidate.id),
                updatedAt: new Date().toISOString()
              }
            : candidate
        )
      });

      return {
        ...current,
        roomZones: [...(current.roomZones ?? []), ...promotedPairs.map((item) => item.roomZone)],
        recognition
      };
    });
    setStatusText(scope === 'all' ? `已写入 ${promotedCount} 个房间区域` : `已写入 ${promotedCount} 个选中房间区域`);
  };

  const saveAiRecognitionDraft = () => {
    updateRecognitionLayer(
      (recognition) => ({
        ...recognition,
        aiRecognitionDraft: {
          id: createId('ai-recognition'),
          status: 'draft',
          createdAt: new Date().toISOString(),
          sourceFileName: recognition.sourceFileName,
          mode: recognition.parameters.mode,
          inputSnapshot: {
            backgroundFileName: design.backgroundImage?.fileName ?? recognition.sourceFileName,
            scalePxPerMeter: design.canvas.scalePxPerMeter,
            gridSize: design.canvas.gridSize
          },
          note: '本地保存 AI 识别草稿，后续可接入云端识别服务。'
        }
      }),
      '已保存 AI 识别草稿'
    );
  };

  const discardRecognitionLayer = () => {
    commitChange((current) => ({ ...current, recognition: undefined }), null);
    setImportWizardOpen(false);
    setStatusText('已放弃识别图层，正式方案未受影响');
  };

  const wallModeLabel = wallDrawMode === 'continuous' ? '连续' : '单段';
  const toolGuidance =
    viewMode === 'threeD'
      ? { title: '3D 预览', detail: '拖动画面旋转视角，滚轮缩放。右侧可调整灯光、材质和导出倍率。' }
      : samplingWallColor
        ? { title: '采样墙体颜色', detail: '在底图真实墙体上点击一次，系统会用该颜色补充识别浅灰墙线。' }
        : recognitionWorkspace.step === 'range' && design.backgroundImage
          ? { title: '设置识别范围', detail: '拖动蓝色范围框，只框住主体户型，尽量排除尺寸标注、指南针和空白区域。' }
          : mode === 'wall'
            ? { title: `绘制墙体 · ${wallModeLabel}`, detail: '点击两点生成墙体。Esc 取消当前起点，Enter 结束连续绘制。' }
            : mode === 'recognition-wall'
              ? { title: `补识别墙 · ${wallModeLabel}`, detail: '手动画出的墙会进入识别图层，确认后再写入正式方案。' }
              : mode === 'door' || mode === 'window'
                ? { title: mode === 'door' ? '放置门' : '放置窗', detail: '点击靠近墙体的位置放置，系统会自动吸附到最近墙体。' }
                : mode === 'room-zone'
                  ? { title: '绘制房间区域', detail: '依次点击房间边界点，回到起点附近即可闭合并计算面积。' }
                  : mode === 'material-brush'
                    ? { title: '材质刷', detail: '点击家具或房间区域应用右侧选择的材质。' }
                    : mode === 'pan'
                      ? { title: '平移画布', detail: '拖动画布查看户型，切回选择后可编辑对象。' }
                      : recognitionLayer
                        ? { title: '修正识别图层', detail: '点击绿色候选墙、门窗或房间进行选择，可删除、补全、合并或写入正式方案。' }
                        : { title: '编辑模式', detail: '选择对象查看属性；也可以从左侧点击或拖拽家具到画布。' };
  const modeText =
    viewMode === 'threeD'
      ? '3D预览'
      : mode === 'wall'
      ? `墙体绘制 · ${wallModeLabel}`
      : mode === 'recognition-wall'
        ? `识别补墙 · ${wallModeLabel}`
        : mode === 'room-zone'
          ? '房间区域绘制'
          : mode === 'material-brush'
            ? `材质刷 · ${resolveFurnitureMaterial(design.materialBrush?.materialId).name}`
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
        onExportSvg={exportSvgPlan}
        onExportJson={exportJson}
        onExportEstimateCsv={exportEstimateCsv}
        onExportHtmlReport={exportHtmlReport}
        onExportPrintLayout={exportPrintLayout}
        onExportPdfReport={exportPdfReport}
        onExportDxfDraft={exportDxfDraft}
        onExportGlbDraft={() => exportModelDraft('glb')}
        onExportObjDraft={() => exportModelDraft('obj')}
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
          favoriteFurnitureComboIds={design.favoriteFurnitureComboIds ?? []}
          importedModelAssets={design.importedModelAssets ?? []}
          recommendedRoomNames={[...design.rooms.map((room) => room.name), ...(design.roomZones ?? []).map((zone) => zone.name)]}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            resetWallDraft();
          }}
          onWallDrawModeChange={changeWallDrawMode}
          onToggleWallLengths={toggleWallLengths}
          onApplyTemplate={applyTemplate}
          onBackgroundUpload={handleBackgroundUpload}
          onModelAssetUpload={handleModelAssetUpload}
          onCategoryChange={setActiveCategory}
          onSearchChange={setSearchText}
          onFurnitureDragStart={handleFurnitureDragStart}
          onFurnitureComboDragStart={handleFurnitureComboDragStart}
          onFurnitureClick={addFurnitureToViewportCenter}
          onFurnitureComboClick={addFurnitureComboToViewportCenter}
          onModelAssetClick={addModelAssetToViewportCenter}
          onDeleteModelAsset={deleteModelAsset}
          onToggleFurnitureFavorite={toggleFurnitureFavorite}
          onToggleFurnitureComboFavorite={toggleFurnitureComboFavorite}
        />
        <div className="center-pane">
          <div className="canvas-tool-hint">
            <strong>{toolGuidance.title}</strong>
            <span>{toolGuidance.detail}</span>
          </div>
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
              recognitionCropBox={recognitionCropBox ?? design.recognition?.parameters.cropBox ?? (design.backgroundImage ? createDefaultRecognitionCropBox(design.backgroundImage) : null)}
              showRecognitionCropBox={Boolean(design.backgroundImage && (importWizardOpen || recognitionLayer) && !samplingWallColor)}
              samplingWallColor={samplingWallColor}
              materialBrush={(design.materialBrush ?? DEFAULT_MATERIAL_BRUSH) as MaterialBrushState}
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
              onRecognitionCropBoxChange={updateRecognitionCropBox}
              onWallColorSample={handleWallColorSample}
            />
          ) : (
            <ThreeDViewer
              ref={threeViewerRef}
              design={design}
              onModelLoadError={(asset) => setStatusText(`模型草案未能加载：${asset.name}`)}
            />
          )}
          {viewMode === 'plan' && selectedFurnitureItems.length > 0 && selectedFurnitureToolbarStyle && (
            <SelectedFurnitureToolbar
              style={selectedFurnitureToolbarStyle}
              canPaste={Boolean(furnitureClipboard || furnitureGroupClipboard?.length)}
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
          onExportSvg={exportSvgPlan}
          onExportEstimateCsv={exportEstimateCsv}
          onExportHtmlReport={exportHtmlReport}
          onExportPrintLayout={exportPrintLayout}
          onExportPdfReport={exportPdfReport}
          onExportDxfDraft={exportDxfDraft}
          onExportGlbDraft={() => exportModelDraft('glb')}
          onExportObjDraft={() => exportModelDraft('obj')}
          onStartCalibration={startCalibration}
          onRecognizeFloorplan={recognizeFloorplan}
          onRecognizeSelectedArea={recognizeSelectedArea}
          recognitionMode={recognitionMode}
          onRecognitionModeChange={setRecognitionMode}
          recognitionProfile={recognitionProfile}
          onRecognitionProfileChange={setRecognitionProfile}
          recognitionCropBox={recognitionCropBox ?? design.recognition?.parameters.cropBox ?? (design.backgroundImage ? createDefaultRecognitionCropBox(design.backgroundImage) : null)}
          recognitionWorkspace={recognitionWorkspace}
          onRecognitionCropBoxChange={updateRecognitionCropBox}
          onRecognitionWorkspaceChange={updateRecognitionWorkspace}
          sampledWallColor={sampledWallColor ?? design.recognition?.parameters.sampledWallColor}
          samplingWallColor={samplingWallColor}
          onStartWallColorSampling={startWallColorSampling}
          onApplyAllOuterGaps={applyAllOuterGapMarkers}
          onApplySelectedIssueMarker={applyRecognitionIssueMarker}
          onIgnoreSelectedIssueMarker={ignoreRecognitionIssueMarker}
          onKeepBackgroundReference={keepBackgroundAsReference}
          onSelectAllRecognitionWalls={selectAllRecognitionWalls}
          onSelectAllRecognitionOpenings={selectAllRecognitionOpenings}
          onSelectAllRecognitionRooms={selectAllRecognitionRooms}
          onClearRecognitionSelection={clearRecognitionSelection}
          onDeleteSelectedRecognitionWalls={deleteSelectedRecognitionWalls}
          onRestoreDeletedRecognitionWalls={restoreDeletedRecognitionWalls}
          onMergeSelectedRecognitionWalls={mergeRecognitionSelection}
          onMergeAllRecognitionWalls={mergeAllRecognitionWalls}
          onPromoteSelectedRecognitionWalls={() => promoteRecognitionWalls('selected')}
          onPromoteAllRecognitionWalls={() => promoteRecognitionWalls('all')}
          onPromoteSelectedRecognitionOpenings={() => promoteRecognitionOpenings('selected')}
          onPromoteAllRecognitionOpenings={() => promoteRecognitionOpenings('all')}
          onPromoteSelectedRecognitionRooms={() => promoteRecognitionRooms('selected')}
          onPromoteAllRecognitionRooms={() => promoteRecognitionRooms('all')}
          onSaveAiRecognitionDraft={saveAiRecognitionDraft}
          onDiscardRecognitionLayer={discardRecognitionLayer}
          recognizingFloorplan={recognizingFloorplan}
          importWizardOpen={importWizardOpen}
          recognitionLayer={recognitionLayer}
          canCaptureThreeDViewpoint={viewMode === 'threeD'}
          onCaptureThreeDViewpoint={captureThreeDViewpoint}
          onPreviewWalkthrough={previewWalkthroughPath}
        />
      </div>
    </div>
  );
}
