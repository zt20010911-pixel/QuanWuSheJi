import type Konva from 'konva';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Arc, Circle, Ellipse, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { FURNITURE_LIBRARY } from '../data/furniture';
import { DEFAULT_ROOM_ZONE_MATERIAL_IDS } from '../data/materials';
import type {
  BackgroundImage as BackgroundImageData,
  DesignDocument,
  FurnitureInstance,
  Opening,
  Point,
  RecognitionSession,
  RecognitionWall,
  RoomLabel,
  RoomZone,
  Selection,
  ToolMode,
  Wall,
  WallDrawMode
} from '../types';
import {
  createId,
  findNearestWall,
  projectPointOnWall,
  pxToMeters,
  radiansToDegrees,
  snapPoint,
  wallAngle,
  wallLengthPx
} from '../utils/geometry';
import { getRoomZoneAreaSqm, polygonCentroid } from '../utils/roomMetrics';

type DesignerCanvasProps = {
  design: DesignDocument;
  mode: ToolMode;
  selection: Selection | null;
  stageRef: React.RefObject<Konva.Stage | null>;
  zoom: number;
  stagePosition: Point;
  draggedFurnitureId: string | null;
  recognitionLayer?: RecognitionSession | null;
  wallDrawMode: WallDrawMode;
  showWallLengths: boolean;
  showGrid?: boolean;
  wallDraftResetSignal?: number;
  fitViewSignal?: number;
  centerViewSignal?: number;
  onSelectionChange: (selection: Selection | null) => void;
  onCommitChange: (updater: (current: DesignDocument) => DesignDocument, selection?: Selection | null) => void;
  onDraftStart: () => void;
  onDraftChange: (updater: (current: DesignDocument) => DesignDocument) => void;
  onDraftEnd: () => void;
  onZoomChange: (zoom: number) => void;
  onStagePositionChange: (position: Point) => void;
};

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const useHtmlImage = (src?: string) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    const nextImage = new window.Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = src;
  }, [src]);

  return image;
};

const isPointInBackground = (point: Point, backgroundImage: BackgroundImageData) =>
  point.x >= backgroundImage.x &&
  point.x <= backgroundImage.x + backgroundImage.width &&
  point.y >= backgroundImage.y &&
  point.y <= backgroundImage.y + backgroundImage.height;

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const extendBounds = (bounds: Bounds, x: number, y: number) => ({
  minX: Math.min(bounds.minX, x),
  minY: Math.min(bounds.minY, y),
  maxX: Math.max(bounds.maxX, x),
  maxY: Math.max(bounds.maxY, y)
});

const getDesignBounds = (design: DesignDocument, recognitionLayer?: RecognitionSession | null) => {
  let bounds: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  };

  const recognitionWalls = recognitionLayer?.visible
    ? recognitionLayer.walls.filter((wall) => wall.status !== 'deleted')
    : [];
  const walls = recognitionWalls.length ? recognitionWalls : design.walls;
  walls.forEach((wall) => {
    bounds = extendBounds(bounds, wall.start.x, wall.start.y);
    bounds = extendBounds(bounds, wall.end.x, wall.end.y);
  });

  design.furniture.forEach((item) => {
    const widthPx = (item.width / 100) * design.canvas.scalePxPerMeter;
    const depthPx = (item.depth / 100) * design.canvas.scalePxPerMeter;
    bounds = extendBounds(bounds, item.x - widthPx / 2, item.y - depthPx / 2);
    bounds = extendBounds(bounds, item.x + widthPx / 2, item.y + depthPx / 2);
  });

  (design.roomZones ?? []).forEach((zone) => {
    zone.points.forEach((point) => {
      bounds = extendBounds(bounds, point.x, point.y);
    });
  });

  if (design.backgroundImage?.visible) {
    bounds = extendBounds(bounds, design.backgroundImage.x, design.backgroundImage.y);
    bounds = extendBounds(
      bounds,
      design.backgroundImage.x + design.backgroundImage.width,
      design.backgroundImage.y + design.backgroundImage.height
    );
  }

  if (!Number.isFinite(bounds.minX)) {
    return {
      minX: 0,
      minY: 0,
      maxX: design.canvas.width,
      maxY: design.canvas.height
    };
  }

  return bounds;
};

export default function DesignerCanvas({
  design,
  mode,
  selection,
  stageRef,
  zoom,
  stagePosition,
  draggedFurnitureId,
  recognitionLayer,
  wallDrawMode,
  showWallLengths,
  showGrid = true,
  wallDraftResetSignal = 0,
  fitViewSignal = 0,
  centerViewSignal = 0,
  onSelectionChange,
  onCommitChange,
  onDraftStart,
  onDraftChange,
  onDraftEnd,
  onZoomChange,
  onStagePositionChange
}: DesignerCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 700 });
  const [wallStart, setWallStart] = useState<Point | null>(null);
  const [wallPreview, setWallPreview] = useState<Point | null>(null);
  const [roomZoneDraft, setRoomZoneDraft] = useState<Point[]>([]);
  const [roomZonePreview, setRoomZonePreview] = useState<Point | null>(null);
  const lastFitViewSignalRef = useRef(0);
  const lastCenterViewSignalRef = useRef(0);
  const lastWallDraftResetSignalRef = useRef(wallDraftResetSignal);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const gridLines = useMemo(() => {
    const lines: Array<{ points: number[]; major: boolean; key: string }> = [];
    const { width, height, gridSize } = design.canvas;

    for (let x = 0; x <= width; x += gridSize) {
      lines.push({ points: [x, 0, x, height], major: x % (gridSize * 5) === 0, key: `v-${x}` });
    }

    for (let y = 0; y <= height; y += gridSize) {
      lines.push({ points: [0, y, width, y], major: y % (gridSize * 5) === 0, key: `h-${y}` });
    }

    return lines;
  }, [design.canvas]);

  const applyViewportToBounds = (fit: boolean) => {
    const bounds = getDesignBounds(design, recognitionLayer);
    const padding = 72;
    const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
    const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
    const nextZoom = fit
      ? clampZoom(Math.min((stageSize.width - padding * 2) / contentWidth, (stageSize.height - padding * 2) / contentHeight))
      : zoom;

    onZoomChange(nextZoom);
    onStagePositionChange({
      x: stageSize.width / 2 - ((bounds.minX + bounds.maxX) / 2) * nextZoom,
      y: stageSize.height / 2 - ((bounds.minY + bounds.maxY) / 2) * nextZoom
    });
  };

  useEffect(() => {
    if (fitViewSignal === lastFitViewSignalRef.current) {
      return;
    }

    lastFitViewSignalRef.current = fitViewSignal;
    applyViewportToBounds(true);
  }, [fitViewSignal]);

  useEffect(() => {
    if (centerViewSignal === lastCenterViewSignalRef.current) {
      return;
    }

    lastCenterViewSignalRef.current = centerViewSignal;
    applyViewportToBounds(false);
  }, [centerViewSignal]);

  useEffect(() => {
    if (wallDraftResetSignal === lastWallDraftResetSignalRef.current) {
      return;
    }

    lastWallDraftResetSignalRef.current = wallDraftResetSignal;
    setWallStart(null);
    setWallPreview(null);
    setRoomZoneDraft([]);
    setRoomZonePreview(null);
  }, [wallDraftResetSignal]);

  useEffect(() => {
    if (mode !== 'wall' && mode !== 'recognition-wall') {
      setWallStart(null);
      setWallPreview(null);
    }

    if (mode !== 'room-zone') {
      setRoomZoneDraft([]);
      setRoomZonePreview(null);
    }
  }, [mode]);

  const getPointerWorldPoint = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();

    if (!pointer) {
      return null;
    }

    return {
      x: (pointer.x - stagePosition.x) / zoom,
      y: (pointer.y - stagePosition.y) / zoom
    };
  };

  const getWorldPointFromClient = (clientX: number, clientY: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();

    if (!bounds) {
      return null;
    }

    return {
      x: (clientX - bounds.left - stagePosition.x) / zoom,
      y: (clientY - bounds.top - stagePosition.y) / zoom
    };
  };

  const handleCanvasClick = () => {
    const rawPoint = getPointerWorldPoint();

    if (!rawPoint) {
      return;
    }

    if (mode === 'calibrate') {
      const backgroundImage = design.backgroundImage;

      if (!backgroundImage || !backgroundImage.visible || !isPointInBackground(rawPoint, backgroundImage)) {
        return;
      }

      onCommitChange(
        (current) => {
          if (!current.backgroundImage) {
            return current;
          }

          const currentCalibration = current.backgroundImage.calibration ?? {};
          const nextCalibration =
            !currentCalibration.start || currentCalibration.end
              ? { ...currentCalibration, start: rawPoint, end: undefined }
              : { ...currentCalibration, start: currentCalibration.start, end: rawPoint };

          return {
            ...current,
            backgroundImage: {
              ...current.backgroundImage,
              calibration: nextCalibration
            }
          };
        },
        null
      );
      return;
    }

    const point = snapPoint(rawPoint, design.canvas.gridSize);

    if (mode === 'select') {
      onSelectionChange(null);

      if (design.recognition?.selectedWallIds.length) {
        onCommitChange((current) =>
          current.recognition
            ? {
                ...current,
                recognition: {
                  ...current.recognition,
                  selectedWallIds: []
                }
              }
            : current
        );
      }

      return;
    }

    if (mode === 'room-zone') {
      const firstPoint = roomZoneDraft[0];
      const closingDistance = firstPoint ? Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y) : Number.POSITIVE_INFINITY;
      const shouldClose = roomZoneDraft.length >= 3 && closingDistance <= design.canvas.gridSize;

      if (shouldClose) {
        const points = roomZoneDraft;
        const zoneId = createId('room-zone');
        const label = polygonCentroid(points);

        onCommitChange(
          (current) => ({
            ...current,
            roomZones: [
              ...(current.roomZones ?? []),
              {
                id: zoneId,
                name: `房间${(current.roomZones ?? []).length + 1}`,
                points,
                label,
                materialIds: { ...DEFAULT_ROOM_ZONE_MATERIAL_IDS },
                color: ['#7cc8a8', '#8fb7e8', '#e5b56c', '#d98f8f'][(current.roomZones ?? []).length % 4]
              }
            ]
          }),
          { type: 'roomZone', id: zoneId }
        );
        setRoomZoneDraft([]);
        setRoomZonePreview(null);
        return;
      }

      const lastPoint = roomZoneDraft[roomZoneDraft.length - 1];
      const isDuplicate = lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < design.canvas.gridSize / 2;

      if (!isDuplicate) {
        setRoomZoneDraft((current) => [...current, point]);
        setRoomZonePreview(point);
      }
      return;
    }

    if (mode === 'wall' || mode === 'recognition-wall') {
      if (!wallStart) {
        setWallStart(point);
        setWallPreview(point);
        return;
      }

      const length = Math.hypot(point.x - wallStart.x, point.y - wallStart.y);

      if (length < design.canvas.gridSize) {
        return;
      }

      const wallId = createId(mode === 'recognition-wall' ? 'rec-wall' : 'wall');

      if (mode === 'recognition-wall') {
        const recognitionWall: RecognitionWall = {
          id: wallId,
          start: wallStart,
          end: point,
          thickness: 14,
          confidence: 1,
          source: 'inferred',
          status: 'active'
        };

        onCommitChange((current) => {
          const recognition = current.recognition ?? {
            id: createId('recognition'),
            createdAt: new Date().toISOString(),
            sourceFileName: '手动补墙',
            status: 'draft' as const,
            visible: true,
            opacity: 0.72,
            locked: false,
            selectedWallIds: [],
            walls: [],
            wallCount: 0,
            horizontalCount: 0,
            verticalCount: 0,
            confidence: '中' as const,
            parameters: {
              mode: 'complete' as const,
              gridSize: current.canvas.gridSize,
              minWallLength: current.canvas.gridSize * 3,
              rawWallCount: 0,
              candidateWallCount: 0,
              inferredWallCount: 1
            }
          };
          const walls = [...recognition.walls, recognitionWall];

          return {
            ...current,
            recognition: {
              ...recognition,
              selectedWallIds: [wallId],
              walls,
              wallCount: walls.filter((wall) => wall.status !== 'deleted').length
            }
          };
        }, null);
      } else {
        onCommitChange(
          (current) => ({
            ...current,
            walls: [
              ...current.walls,
              {
                id: wallId,
                start: wallStart,
                end: point,
                thickness: 14
              }
            ]
          }),
          { type: 'wall', id: wallId }
        );
      }
      if (wallDrawMode === 'continuous') {
        setWallStart(point);
        setWallPreview(point);
      } else {
        setWallStart(null);
        setWallPreview(null);
      }
      return;
    }

    if (mode === 'door' || mode === 'window') {
      const nearestWall = findNearestWall(rawPoint, design.walls);

      if (!nearestWall) {
        return;
      }

      const projectedPoint = projectPointOnWall(rawPoint, nearestWall);
      const openingId = createId(mode);
      const rotation = radiansToDegrees(wallAngle(nearestWall));

      onCommitChange(
        (current) => ({
          ...current,
          openings: [
            ...current.openings,
            {
              id: openingId,
              kind: mode,
              wallId: nearestWall.id,
              x: projectedPoint.x,
              y: projectedPoint.y,
              width: mode === 'door' ? 90 : 120,
              rotation
            }
          ]
        }),
        { type: 'opening', id: openingId }
      );
    }
  };

  const addFurnitureAtPoint = (furnitureId: string, point: Point) => {
    const definition = FURNITURE_LIBRARY.find((item) => item.id === furnitureId);

    if (!definition) {
      return;
    }

    const instanceId = createId('furniture');
    const position = snapPoint(point, design.canvas.gridSize);

    onCommitChange(
      (current) => ({
        ...current,
        furniture: [
          ...current.furniture,
          {
            ...definition,
            instanceId,
            x: position.x,
            y: position.y,
            rotation: 0
          }
        ]
      }),
      { type: 'furniture', id: instanceId }
    );
  };

  const roomZoneDraftPoints = (roomZonePreview && roomZoneDraft.length ? [...roomZoneDraft, roomZonePreview] : roomZoneDraft)
    .flatMap((point) => [point.x, point.y]);

  return (
    <main
      className="canvas-shell"
      ref={containerRef}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const furnitureId = event.dataTransfer.getData('text/plain') || draggedFurnitureId;
        const point = getWorldPointFromClient(event.clientX, event.clientY);

        if (furnitureId && point) {
          addFurnitureAtPoint(furnitureId, point);
        }
      }}
    >
      <Stage
        width={stageSize.width}
        height={stageSize.height}
        ref={stageRef}
        draggable={mode === 'pan'}
        x={stagePosition.x}
        y={stagePosition.y}
        scaleX={zoom}
        scaleY={zoom}
        onDragEnd={(event) => {
          if (event.target !== event.target.getStage()) {
            return;
          }

          onStagePositionChange({ x: event.target.x(), y: event.target.y() });
        }}
        onWheel={(event) => {
          event.evt.preventDefault();
          const stage = stageRef.current;
          const pointer = stage?.getPointerPosition();

          if (!pointer) {
            return;
          }

          const factor = event.evt.deltaY > 0 ? 0.92 : 1.08;
          const nextZoom = clampZoom(zoom * factor);
          const mousePoint = {
            x: (pointer.x - stagePosition.x) / zoom,
            y: (pointer.y - stagePosition.y) / zoom
          };

          onZoomChange(nextZoom);
          onStagePositionChange({
            x: pointer.x - mousePoint.x * nextZoom,
            y: pointer.y - mousePoint.y * nextZoom
          });
        }}
        onMouseMove={() => {
          const point = getPointerWorldPoint();

          if (!point) {
            return;
          }

          if ((mode === 'wall' || mode === 'recognition-wall') && wallStart) {
            setWallPreview(snapPoint(point, design.canvas.gridSize));
            return;
          }

          if (mode === 'room-zone' && roomZoneDraft.length) {
            setRoomZonePreview(snapPoint(point, design.canvas.gridSize));
          }
        }}
        onMouseDown={(event) => {
          const targetName = event.target.name();
          const clickedEmptyArea =
            event.target === event.target.getStage() || targetName === 'canvas-bg' || targetName === 'floorplan-bg';

          if (clickedEmptyArea) {
            handleCanvasClick();
          }
        }}
      >
        <Layer>
          <Rect
            name="canvas-bg"
            width={design.canvas.width}
            height={design.canvas.height}
            fill="#f8faf6"
            stroke="#cbd5d1"
            strokeWidth={1}
          />
          <BackgroundImageShape
            backgroundImage={design.backgroundImage}
            mode={mode}
            onSelect={() => onSelectionChange(null)}
            onDraftStart={onDraftStart}
            onDraftEnd={onDraftEnd}
            onDraftChange={onDraftChange}
          />
          {showGrid &&
            gridLines.map((line) => (
              <Line
                key={line.key}
                points={line.points}
                stroke={line.major ? '#d6ded9' : '#edf1ee'}
                strokeWidth={line.major ? 1 : 0.7}
                listening={false}
              />
            ))}
          {design.backgroundImage?.visible && <CalibrationGuide backgroundImage={design.backgroundImage} />}
        </Layer>

        <Layer>
          {recognitionLayer && (
            <RecognitionLayerShape
              design={design}
              recognition={recognitionLayer}
              mode={mode}
              onSelectionChange={onSelectionChange}
              onCommitChange={onCommitChange}
            />
          )}

          {(design.roomZones ?? []).map((zone) => (
            <RoomZoneShape
              key={zone.id}
              design={design}
              zone={zone}
              mode={mode}
              selected={selection?.type === 'roomZone' && selection.id === zone.id}
              onSelect={() => onSelectionChange({ type: 'roomZone', id: zone.id })}
              onDraftStart={onDraftStart}
              onDraftEnd={onDraftEnd}
              onDraftChange={onDraftChange}
            />
          ))}

          {roomZoneDraft.length > 0 && mode === 'room-zone' && (
            <Group listening={false}>
              <Line
                points={roomZoneDraftPoints}
                stroke="#22a06b"
                strokeWidth={3}
                dash={[12, 8]}
                lineCap="round"
                lineJoin="round"
                closed={false}
              />
              <Circle x={roomZoneDraft[0].x} y={roomZoneDraft[0].y} radius={7} fill="#ffffff" stroke="#22a06b" strokeWidth={3} />
              <Text
                x={roomZoneDraft[0].x + 12}
                y={roomZoneDraft[0].y - 24}
                text="点击首点闭合房间"
                fontSize={12}
                fill="#14745b"
                listening={false}
              />
            </Group>
          )}

          {design.rooms.map((room) => (
            <RoomLabelShape
              key={room.id}
              room={room}
              mode={mode}
              selected={selection?.type === 'room' && selection.id === room.id}
              onSelect={() => onSelectionChange({ type: 'room', id: room.id })}
              onDraftStart={onDraftStart}
              onDraftEnd={onDraftEnd}
              onDraftChange={onDraftChange}
            />
          ))}

          {design.walls.map((wall) => (
            <WallShape
              key={wall.id}
              design={design}
              wall={wall}
              mode={mode}
              selected={selection?.type === 'wall' && selection.id === wall.id}
              showLengthLabel={showWallLengths || (selection?.type === 'wall' && selection.id === wall.id)}
              onSelect={() => onSelectionChange({ type: 'wall', id: wall.id })}
              onDraftStart={onDraftStart}
              onDraftEnd={onDraftEnd}
              onDraftChange={onDraftChange}
            />
          ))}

          {wallStart && wallPreview && (mode === 'wall' || mode === 'recognition-wall') && (
            <Line
              points={[wallStart.x, wallStart.y, wallPreview.x, wallPreview.y]}
              stroke={mode === 'recognition-wall' ? '#21a67a' : '#2f80ed'}
              strokeWidth={10}
              dash={[14, 10]}
              lineCap="round"
              listening={false}
            />
          )}

          {design.openings.map((opening) => (
            <OpeningShape
              key={opening.id}
              design={design}
              opening={opening}
              mode={mode}
              selected={selection?.type === 'opening' && selection.id === opening.id}
              onSelect={() => onSelectionChange({ type: 'opening', id: opening.id })}
              onDraftStart={onDraftStart}
              onDraftEnd={onDraftEnd}
              onDraftChange={onDraftChange}
            />
          ))}

          {design.furniture.map((item) => (
            <FurnitureShape
              key={item.instanceId}
              design={design}
              furniture={item}
              mode={mode}
              selected={selection?.type === 'furniture' && selection.id === item.instanceId}
              onSelect={() => onSelectionChange({ type: 'furniture', id: item.instanceId })}
              onDraftStart={onDraftStart}
              onDraftEnd={onDraftEnd}
              onDraftChange={onDraftChange}
            />
          ))}
        </Layer>
      </Stage>
    </main>
  );
}

function RecognitionLayerShape({
  design,
  recognition,
  mode,
  onSelectionChange,
  onCommitChange
}: {
  design: DesignDocument;
  recognition: RecognitionSession;
  mode: ToolMode;
  onSelectionChange: (selection: Selection | null) => void;
  onCommitChange: (updater: (current: DesignDocument) => DesignDocument, selection?: Selection | null) => void;
}) {
  if (!recognition.visible) {
    return null;
  }

  const selectedIds = new Set(recognition.selectedWallIds);
  const visibleWalls = recognition.walls.filter((wall) => wall.status !== 'deleted');

  return (
    <Group name="recognition-layer" opacity={recognition.opacity}>
      {visibleWalls.map((wall) => {
        const selected = selectedIds.has(wall.id);
        const promoted = wall.status === 'promoted';
        const selectable = mode !== 'pan' && !recognition.locked && wall.status === 'active';

        return (
          <Group key={wall.id} listening={selectable}>
            {selected && (
              <Line
                points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
                stroke="#f2a23a"
                strokeWidth={Math.max(14, wall.thickness + 8)}
                opacity={0.55}
                lineCap="round"
                listening={false}
              />
            )}
            <Line
              points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
              stroke={promoted ? '#6f8991' : '#21a67a'}
              strokeWidth={Math.max(8, wall.thickness)}
              dash={promoted ? [6, 7] : [18, 10]}
              lineCap="round"
              onMouseDown={(event) => {
                if (!selectable) {
                  return;
                }

                event.cancelBubble = true;
                const additive = event.evt.ctrlKey || event.evt.metaKey;
                onSelectionChange({ type: 'recognitionWall', id: wall.id });
                onCommitChange((current) => {
                  if (!current.recognition) {
                    return current;
                  }

                  const currentIds = current.recognition.selectedWallIds;
                  const selectedSet = new Set(additive ? currentIds : []);

                  if (additive && selectedSet.has(wall.id)) {
                    selectedSet.delete(wall.id);
                  } else {
                    selectedSet.add(wall.id);
                  }

                  return {
                    ...current,
                    recognition: {
                      ...current.recognition,
                      selectedWallIds: Array.from(selectedSet)
                    }
                  };
                }, { type: 'recognitionWall', id: wall.id });
              }}
            />
          </Group>
        );
      })}
      {mode === 'recognition-wall' && !design.recognition && (
        <Text x={24} y={24} text="点击画布补识别墙" fontSize={14} fill="#176b61" listening={false} />
      )}
    </Group>
  );
}

function BackgroundImageShape({
  backgroundImage,
  mode,
  onDraftStart,
  onDraftEnd,
  onDraftChange
}: {
  backgroundImage?: BackgroundImageData;
  mode: ToolMode;
  onSelect: () => void;
  onDraftStart: () => void;
  onDraftEnd: () => void;
  onDraftChange: (updater: (current: DesignDocument) => DesignDocument) => void;
}) {
  const image = useHtmlImage(backgroundImage?.dataUrl);

  if (!backgroundImage || !backgroundImage.visible || !image) {
    return null;
  }

  const canEditBackground = mode === 'select' && !backgroundImage.locked;

  return (
    <KonvaImage
      name="floorplan-bg"
      image={image}
      x={backgroundImage.x}
      y={backgroundImage.y}
      width={backgroundImage.width}
      height={backgroundImage.height}
      opacity={backgroundImage.opacity}
      draggable={canEditBackground}
      listening={mode === 'calibrate' || canEditBackground}
      onDragStart={(event) => {
        event.cancelBubble = true;
        onDraftStart();
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        onDraftChange((current) => {
          if (!current.backgroundImage) {
            return current;
          }

          return {
            ...current,
            backgroundImage: {
              ...current.backgroundImage,
              x: event.target.x(),
              y: event.target.y()
            }
          };
        });
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onDraftEnd();
      }}
    />
  );
}

function CalibrationGuide({ backgroundImage }: { backgroundImage: BackgroundImageData }) {
  const start = backgroundImage.calibration?.start;
  const end = backgroundImage.calibration?.end;

  if (!start && !end) {
    return null;
  }

  return (
    <Group listening={false}>
      {start && (
        <>
          <Circle x={start.x} y={start.y} radius={7} fill="#ffffff" stroke="#d36d2f" strokeWidth={3} />
          <Text x={start.x + 10} y={start.y - 22} text="点 1" fontSize={13} fill="#9a4a1c" fontStyle="bold" />
        </>
      )}
      {start && end && <Line points={[start.x, start.y, end.x, end.y]} stroke="#d36d2f" strokeWidth={3} dash={[10, 6]} />}
      {end && (
        <>
          <Circle x={end.x} y={end.y} radius={7} fill="#ffffff" stroke="#d36d2f" strokeWidth={3} />
          <Text x={end.x + 10} y={end.y - 22} text="点 2" fontSize={13} fill="#9a4a1c" fontStyle="bold" />
        </>
      )}
    </Group>
  );
}

function WallLengthLabel({ design, wall, selected }: { design: DesignDocument; wall: Wall; selected: boolean }) {
  const length = pxToMeters(wallLengthPx(wall), design.canvas.scalePxPerMeter);
  const label = `${length.toFixed(2)}m`;
  const x = (wall.start.x + wall.end.x) / 2;
  const y = (wall.start.y + wall.end.y) / 2;
  const width = Math.max(56, label.length * 8 + 16);

  return (
    <Group x={x} y={y} listening={false}>
      <Rect
        x={-width / 2}
        y={-28}
        width={width}
        height={20}
        fill={selected ? '#fff7e5' : '#ffffff'}
        stroke={selected ? '#f2a23a' : '#d7dfdb'}
        strokeWidth={1}
        cornerRadius={5}
        opacity={0.92}
      />
      <Text x={-width / 2} y={-24} width={width} text={label} align="center" fontSize={12} fill="#384353" />
    </Group>
  );
}

function WallShape({
  design,
  wall,
  mode,
  selected,
  showLengthLabel,
  onSelect,
  onDraftStart,
  onDraftEnd,
  onDraftChange
}: {
  design: DesignDocument;
  wall: Wall;
  mode: ToolMode;
  selected: boolean;
  showLengthLabel: boolean;
  onSelect: () => void;
  onDraftStart: () => void;
  onDraftEnd: () => void;
  onDraftChange: (updater: (current: DesignDocument) => DesignDocument) => void;
}) {
  const updateWallPoint = (key: 'start' | 'end', point: Point) => {
    const nextPoint = snapPoint(point, design.canvas.gridSize);
    onDraftChange((current) => ({
      ...current,
      walls: current.walls.map((item) => (item.id === wall.id ? { ...item, [key]: nextPoint } : item)),
      openings: current.openings.map((opening) => {
        if (opening.wallId !== wall.id) {
          return opening;
        }

        const updatedWall = current.walls.find((item) => item.id === wall.id);
        const wallForProjection = updatedWall ? { ...updatedWall, [key]: nextPoint } : wall;
        const projected = projectPointOnWall(opening, wallForProjection);

        return {
          ...opening,
          ...projected,
          rotation: radiansToDegrees(wallAngle(wallForProjection))
        };
      })
    }));
  };

  return (
    <Group listening={mode !== 'pan'}>
      {selected && (
        <Line
          points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
          stroke="#f2a23a"
          strokeWidth={wall.thickness + 10}
          opacity={0.32}
          lineCap="round"
          listening={false}
        />
      )}
      <Line
        points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
        stroke="#303642"
        strokeWidth={wall.thickness}
        lineCap="round"
        onMouseDown={(event) => {
          event.cancelBubble = true;
          onSelect();
        }}
      />
      {showLengthLabel && <WallLengthLabel design={design} wall={wall} selected={selected} />}
      {selected && mode === 'select' && (
        <>
          <Circle
            x={wall.start.x}
            y={wall.start.y}
            radius={8}
            fill="#ffffff"
            stroke="#2f80ed"
            strokeWidth={2}
            draggable
            onDragStart={(event) => {
              event.cancelBubble = true;
              onDraftStart();
            }}
            onDragMove={(event) => {
              event.cancelBubble = true;
              updateWallPoint('start', { x: event.target.x(), y: event.target.y() });
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true;
              onDraftEnd();
            }}
          />
          <Circle
            x={wall.end.x}
            y={wall.end.y}
            radius={8}
            fill="#ffffff"
            stroke="#2f80ed"
            strokeWidth={2}
            draggable
            onDragStart={(event) => {
              event.cancelBubble = true;
              onDraftStart();
            }}
            onDragMove={(event) => {
              event.cancelBubble = true;
              updateWallPoint('end', { x: event.target.x(), y: event.target.y() });
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true;
              onDraftEnd();
            }}
          />
        </>
      )}
    </Group>
  );
}

function OpeningShape({
  design,
  opening,
  mode,
  selected,
  onSelect,
  onDraftStart,
  onDraftEnd,
  onDraftChange
}: {
  design: DesignDocument;
  opening: Opening;
  mode: ToolMode;
  selected: boolean;
  onSelect: () => void;
  onDraftStart: () => void;
  onDraftEnd: () => void;
  onDraftChange: (updater: (current: DesignDocument) => DesignDocument) => void;
}) {
  const widthPx = (opening.width / 100) * design.canvas.scalePxPerMeter;

  return (
    <Group
      x={opening.x}
      y={opening.y}
      rotation={opening.rotation}
      draggable={mode === 'select'}
      listening={mode !== 'pan'}
      onMouseDown={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        onDraftStart();
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        const point = { x: event.target.x(), y: event.target.y() };
        onDraftChange((current) => {
          const wall = current.walls.find((item) => item.id === opening.wallId);

          if (!wall) {
            return current;
          }

          const projected = projectPointOnWall(point, wall);

          return {
            ...current,
            openings: current.openings.map((item) =>
              item.id === opening.id
                ? {
                    ...item,
                    ...projected,
                    rotation: radiansToDegrees(wallAngle(wall))
                  }
                : item
            )
          };
        });
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onDraftEnd();
      }}
    >
      <Line points={[-widthPx / 2, 0, widthPx / 2, 0]} stroke="#f8faf6" strokeWidth={24} lineCap="round" />
      {opening.kind === 'door' ? (
        <>
          <Line points={[-widthPx / 2, 0, -widthPx / 2, widthPx]} stroke="#8b5e34" strokeWidth={5} />
          <Arc
            x={-widthPx / 2}
            y={0}
            innerRadius={widthPx}
            outerRadius={widthPx}
            angle={90}
            rotation={0}
            stroke="#8b5e34"
            strokeWidth={2}
          />
          <Line points={[-widthPx / 2, widthPx, widthPx / 2, 0]} stroke="#8b5e34" strokeWidth={2} opacity={0.7} />
        </>
      ) : (
        <>
          <Line points={[-widthPx / 2, -6, widthPx / 2, -6]} stroke="#3486a8" strokeWidth={3} />
          <Line points={[-widthPx / 2, 6, widthPx / 2, 6]} stroke="#3486a8" strokeWidth={3} />
        </>
      )}
      {selected && <Rect x={-widthPx / 2 - 8} y={-16} width={widthPx + 16} height={32} stroke="#f2a23a" dash={[6, 5]} />}
    </Group>
  );
}

function FurnitureShape({
  design,
  furniture,
  mode,
  selected,
  onSelect,
  onDraftStart,
  onDraftEnd,
  onDraftChange
}: {
  design: DesignDocument;
  furniture: FurnitureInstance;
  mode: ToolMode;
  selected: boolean;
  onSelect: () => void;
  onDraftStart: () => void;
  onDraftEnd: () => void;
  onDraftChange: (updater: (current: DesignDocument) => DesignDocument) => void;
}) {
  const widthPx = (furniture.width / 100) * design.canvas.scalePxPerMeter;
  const depthPx = (furniture.depth / 100) * design.canvas.scalePxPerMeter;

  return (
    <Group
      x={furniture.x}
      y={furniture.y}
      rotation={furniture.rotation}
      draggable={mode === 'select'}
      listening={mode !== 'pan'}
      onMouseDown={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        onDraftStart();
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        const point = snapPoint({ x: event.target.x(), y: event.target.y() }, design.canvas.gridSize);
        onDraftChange((current) => ({
          ...current,
          furniture: current.furniture.map((item) => (item.instanceId === furniture.instanceId ? { ...item, ...point } : item))
        }));
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onDraftEnd();
      }}
    >
      <FurnitureSymbol furniture={furniture} widthPx={widthPx} depthPx={depthPx} />
      {selected && (
        <Rect
          x={-widthPx / 2 - 7}
          y={-depthPx / 2 - 7}
          width={widthPx + 14}
          height={depthPx + 14}
          stroke="#f2a23a"
          strokeWidth={2}
          dash={[8, 5]}
        />
      )}
      <Text
        x={-widthPx / 2}
        y={Math.min(depthPx / 2 + 4, 92)}
        width={widthPx}
        text={furniture.name}
        align="center"
        fontSize={12}
        fill="#27303f"
        listening={false}
      />
    </Group>
  );
}

function FurnitureSymbol({
  furniture,
  widthPx,
  depthPx
}: {
  furniture: FurnitureInstance;
  widthPx: number;
  depthPx: number;
}) {
  const commonProps = {
    fill: furniture.color,
    stroke: furniture.accentColor,
    strokeWidth: 2,
    cornerRadius: 6
  };

  if (furniture.shape === 'round') {
    return (
      <Group>
        <Ellipse radiusX={widthPx / 2} radiusY={depthPx / 2} fill={furniture.color} stroke={furniture.accentColor} strokeWidth={2} />
        <Ellipse
          radiusX={Math.max(widthPx / 2 - 10, 4)}
          radiusY={Math.max(depthPx / 2 - 10, 4)}
          stroke={furniture.accentColor}
          strokeWidth={1}
          dash={[5, 4]}
        />
      </Group>
    );
  }

  if (furniture.shape === 'bed') {
    return (
      <Group>
        <Rect x={-widthPx / 2} y={-depthPx / 2} width={widthPx} height={depthPx} {...commonProps} />
        <Rect x={-widthPx / 2 + 8} y={-depthPx / 2 + 8} width={widthPx / 2 - 12} height={depthPx * 0.22} fill="#fff6ef" stroke={furniture.accentColor} />
        <Rect x={2} y={-depthPx / 2 + 8} width={widthPx / 2 - 12} height={depthPx * 0.22} fill="#fff6ef" stroke={furniture.accentColor} />
        <Line points={[-widthPx / 2 + 8, -depthPx * 0.12, widthPx / 2 - 8, -depthPx * 0.12]} stroke={furniture.accentColor} />
      </Group>
    );
  }

  if (furniture.shape === 'sofa') {
    return (
      <Group>
        <Rect x={-widthPx / 2} y={-depthPx / 2} width={widthPx} height={depthPx} {...commonProps} />
        <Rect x={-widthPx / 2 + 8} y={-depthPx / 2 + 8} width={widthPx - 16} height={depthPx * 0.38} fill="#ffffff" opacity={0.55} />
        <Line points={[-widthPx / 2 + 10, 0, widthPx / 2 - 10, 0]} stroke={furniture.accentColor} strokeWidth={1.5} />
        <Line points={[0, -depthPx / 2 + 10, 0, depthPx / 2 - 10]} stroke={furniture.accentColor} strokeWidth={1.2} opacity={0.7} />
      </Group>
    );
  }

  if (furniture.shape === 'dining') {
    return (
      <Group>
        <Rect x={-widthPx / 2} y={-depthPx / 2} width={widthPx} height={depthPx} {...commonProps} />
        <Circle x={-widthPx / 2 - 14} y={0} radius={10} fill="#ffffff" stroke={furniture.accentColor} />
        <Circle x={widthPx / 2 + 14} y={0} radius={10} fill="#ffffff" stroke={furniture.accentColor} />
        <Circle x={-widthPx * 0.25} y={-depthPx / 2 - 14} radius={10} fill="#ffffff" stroke={furniture.accentColor} />
        <Circle x={widthPx * 0.25} y={-depthPx / 2 - 14} radius={10} fill="#ffffff" stroke={furniture.accentColor} />
      </Group>
    );
  }

  if (furniture.shape === 'sanitary') {
    return (
      <Group>
        <Rect x={-widthPx / 2} y={-depthPx / 2} width={widthPx} height={depthPx} {...commonProps} />
        <Ellipse radiusX={widthPx * 0.28} radiusY={depthPx * 0.28} fill="#ffffff" stroke={furniture.accentColor} />
      </Group>
    );
  }

  if (furniture.shape === 'appliance') {
    return (
      <Group>
        <Rect x={-widthPx / 2} y={-depthPx / 2} width={widthPx} height={depthPx} {...commonProps} />
        <Circle x={0} y={0} radius={Math.min(widthPx, depthPx) * 0.24} fill="#eef5f8" stroke={furniture.accentColor} />
      </Group>
    );
  }

  if (furniture.shape === 'desk') {
    return (
      <Group>
        <Rect x={-widthPx / 2} y={-depthPx / 2} width={widthPx} height={depthPx} {...commonProps} />
        <Line points={[-widthPx / 2 + 8, 0, widthPx / 2 - 8, 0]} stroke={furniture.accentColor} strokeWidth={1.5} />
      </Group>
    );
  }

  if (furniture.shape === 'storage' || furniture.shape === 'cabinet') {
    return (
      <Group>
        <Rect x={-widthPx / 2} y={-depthPx / 2} width={widthPx} height={depthPx} {...commonProps} />
        <Line points={[0, -depthPx / 2 + 6, 0, depthPx / 2 - 6]} stroke={furniture.accentColor} strokeWidth={1.2} />
        <Line points={[-widthPx / 2 + 6, 0, widthPx / 2 - 6, 0]} stroke={furniture.accentColor} strokeWidth={1.2} />
      </Group>
    );
  }

  return <Rect x={-widthPx / 2} y={-depthPx / 2} width={widthPx} height={depthPx} {...commonProps} />;
}

function RoomZoneShape({
  design,
  zone,
  mode,
  selected,
  onSelect,
  onDraftStart,
  onDraftEnd,
  onDraftChange
}: {
  design: DesignDocument;
  zone: RoomZone;
  mode: ToolMode;
  selected: boolean;
  onSelect: () => void;
  onDraftStart: () => void;
  onDraftEnd: () => void;
  onDraftChange: (updater: (current: DesignDocument) => DesignDocument) => void;
}) {
  const area = getRoomZoneAreaSqm(zone, design.canvas.scalePxPerMeter);
  const displayArea = zone.manualAreaSqm ?? area;
  const points = zone.points.flatMap((point) => [point.x, point.y]);
  const labelPosition = zone.label ?? polygonCentroid(zone.points);

  return (
    <Group
      draggable={mode === 'select'}
      listening={mode === 'select'}
      onMouseDown={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        onDraftStart();
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        const dx = event.target.x();
        const dy = event.target.y();
        event.target.position({ x: 0, y: 0 });

        onDraftChange((current) => ({
          ...current,
          roomZones: (current.roomZones ?? []).map((item) =>
            item.id === zone.id
              ? {
                  ...item,
                  points: item.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
                  label: { x: item.label.x + dx, y: item.label.y + dy }
                }
              : item
          )
        }));
        onDraftEnd();
      }}
    >
      <Line
        points={points}
        closed
        fill={selected ? 'rgba(34, 160, 107, 0.18)' : 'rgba(34, 160, 107, 0.1)'}
        stroke={selected ? '#14745b' : '#22a06b'}
        strokeWidth={selected ? 3 : 2}
        dash={selected ? [10, 7] : undefined}
        lineJoin="round"
      />
      <Rect x={labelPosition.x - 42} y={labelPosition.y - 18} width={84} height={36} fill="#ffffff" opacity={0.86} cornerRadius={6} />
      <Text x={labelPosition.x - 42} y={labelPosition.y - 13} width={84} text={zone.name} align="center" fontSize={12} fontStyle="bold" fill="#1f3f35" />
      <Text x={labelPosition.x - 42} y={labelPosition.y + 4} width={84} text={displayArea.toFixed(1) + '㎡'} align="center" fontSize={11} fill="#4b635a" />
    </Group>
  );
}

function RoomLabelShape({
  room,
  mode,
  selected,
  onSelect,
  onDraftStart,
  onDraftEnd,
  onDraftChange
}: {
  room: RoomLabel;
  mode: ToolMode;
  selected: boolean;
  onSelect: () => void;
  onDraftStart: () => void;
  onDraftEnd: () => void;
  onDraftChange: (updater: (current: DesignDocument) => DesignDocument) => void;
}) {
  return (
    <Group
      x={room.x}
      y={room.y}
      draggable={mode === 'select'}
      listening={mode !== 'pan'}
      onMouseDown={(event) => {
        event.cancelBubble = true;
        onSelect();
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        onDraftStart();
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        onDraftChange((current) => ({
          ...current,
          rooms: current.rooms.map((item) =>
            item.id === room.id ? { ...item, x: event.target.x(), y: event.target.y() } : item
          )
        }));
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onDraftEnd();
      }}
    >
      <Rect x={-45} y={-20} width={90} height={40} fill="#ffffff" opacity={0.82} cornerRadius={6} />
      <Text x={-45} y={-15} width={90} text={room.name} align="center" fontSize={14} fontStyle="bold" fill="#38404d" />
      <Text x={-45} y={4} width={90} text={room.area} align="center" fontSize={12} fill="#687282" />
      {selected && <Rect x={-49} y={-24} width={98} height={48} stroke="#f2a23a" dash={[6, 5]} cornerRadius={6} />}
    </Group>
  );
}
