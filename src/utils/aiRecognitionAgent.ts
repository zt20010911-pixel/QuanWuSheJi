import type {
  AiRecognitionRunDraft,
  DesignDocument,
  RecognitionOpeningCandidate,
  RecognitionRoomCandidate,
  RecognitionSession,
  RecognitionWall
} from '../types';
import { createId } from './geometry';

type DeepSeekRecognitionResponse = {
  summary?: string;
  walls?: Array<Partial<RecognitionWall>>;
  openings?: Array<Partial<RecognitionOpeningCandidate>>;
  rooms?: Array<Partial<RecognitionRoomCandidate>>;
};

export const createAiRecognitionRunDraft = (
  design: DesignDocument,
  recognition: RecognitionSession,
  status: AiRecognitionRunDraft['status'],
  resultSummary: string,
  lastError?: string
): AiRecognitionRunDraft => ({
  id: createId('ai-recognition-run'),
  status,
  createdAt: new Date().toISOString(),
  inputSnapshot: {
    backgroundFileName: design.backgroundImage?.fileName ?? recognition.sourceFileName,
    scalePxPerMeter: design.canvas.scalePxPerMeter,
    gridSize: design.canvas.gridSize,
    localWallCount: recognition.walls.filter((wall) => wall.status === 'active').length,
    localOpeningCount: (recognition.openingCandidates ?? []).filter((candidate) => candidate.status === 'active').length,
    localRoomCount: (recognition.roomCandidates ?? []).filter((candidate) => candidate.status === 'active').length
  },
  resultSummary,
  lastError
});

const extractJsonPayload = (content: string) => {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? content;
  return JSON.parse(raw) as DeepSeekRecognitionResponse;
};

const normalizeAiWall = (wall: Partial<RecognitionWall>, index: number): RecognitionWall | null => {
  if (!wall.start || !wall.end) {
    return null;
  }

  return {
    id: wall.id ?? createId('ai-wall'),
    start: wall.start,
    end: wall.end,
    thickness: wall.thickness ?? 14,
    roomId: wall.roomId,
    status: 'active',
    confidence: wall.confidence ?? 0.68,
    source: 'ai-draft',
    updatedAt: wall.updatedAt ?? new Date(Date.now() + index).toISOString()
  };
};

const normalizeAiOpening = (opening: Partial<RecognitionOpeningCandidate>, index: number): RecognitionOpeningCandidate | null => {
  if (!opening.kind || typeof opening.x !== 'number' || typeof opening.y !== 'number') {
    return null;
  }

  return {
    id: opening.id ?? createId('ai-opening'),
    kind: opening.kind,
    wallId: opening.wallId,
    x: opening.x,
    y: opening.y,
    width: opening.width ?? (opening.kind === 'door' ? 85 : 120),
    rotation: opening.rotation ?? 0,
    status: 'active',
    confidence: opening.confidence ?? 0.66,
    source: 'ai-draft',
    evidence: Array.from(new Set([...(opening.evidence ?? []), 'ai'])),
    updatedAt: opening.updatedAt ?? new Date(Date.now() + index).toISOString()
  };
};

const normalizeAiRoom = (room: Partial<RecognitionRoomCandidate>, index: number): RecognitionRoomCandidate | null => {
  if (!room.points?.length || !room.label) {
    return null;
  }

  return {
    id: room.id ?? createId(room.roomKind === 'balcony' ? 'ai-balcony' : 'ai-room'),
    name: room.name ?? (room.roomKind === 'balcony' ? `AI 阳台 ${index + 1}` : `AI 房间 ${index + 1}`),
    points: room.points,
    label: room.label,
    areaSqm: room.areaSqm,
    roomKind: room.roomKind ?? 'room',
    status: 'active',
    confidence: room.confidence ?? 0.62,
    source: 'ai-draft',
    updatedAt: room.updatedAt ?? new Date(Date.now() + index).toISOString()
  };
};

export const runDeepSeekRecognition = async ({
  endpoint,
  apiKey,
  model,
  design,
  recognition
}: {
  endpoint: string;
  apiKey: string;
  model: string;
  design: DesignDocument;
  recognition: RecognitionSession;
}) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            '你是全屋设计户型识别 Agent。只返回 JSON，不要解释。字段为 summary、walls、openings、rooms。所有候选只作为草稿，不要生成不存在的门窗。'
        },
        {
          role: 'user',
          content: JSON.stringify({
            canvas: design.canvas,
            backgroundImage: design.backgroundImage
              ? {
                  fileName: design.backgroundImage.fileName,
                  width: design.backgroundImage.width,
                  height: design.backgroundImage.height,
                  dataUrl: design.backgroundImage.dataUrl
                }
              : null,
            recognition: {
              cropBox: recognition.parameters.cropBox,
              walls: recognition.walls,
              openingCandidates: recognition.openingCandidates ?? [],
              roomCandidates: recognition.roomCandidates ?? []
            }
          })
        }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek 识别请求失败：${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const payload = extractJsonPayload(typeof content === 'string' ? content : JSON.stringify(data));

  return {
    summary: payload.summary ?? 'AI 精修已返回候选',
    walls: (payload.walls ?? []).map(normalizeAiWall).filter((item): item is RecognitionWall => Boolean(item)),
    openings: (payload.openings ?? []).map(normalizeAiOpening).filter((item): item is RecognitionOpeningCandidate => Boolean(item)),
    rooms: (payload.rooms ?? []).map(normalizeAiRoom).filter((item): item is RecognitionRoomCandidate => Boolean(item))
  };
};
