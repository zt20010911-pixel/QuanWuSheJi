import type {
  DesignDocument,
  ExportDraftSettings,
  FurnitureInstance,
  Opening,
  PrintSettings,
  RoomZone,
  Wall
} from '../types';
import { pxToMeters, wallLengthPx } from './geometry';
import { createEstimateItems, formatCurrency, getEstimateTotal, getRoomZoneAreaSqm } from './roomMetrics';

const escapeXml = (value: string | number | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getBounds = (design: DesignDocument) => {
  const values = [
    ...design.walls.flatMap((wall) => [wall.start, wall.end]),
    ...design.openings.map((opening) => ({ x: opening.x, y: opening.y })),
    ...design.rooms.map((room) => ({ x: room.x, y: room.y })),
    ...(design.roomZones ?? []).flatMap((zone) => zone.points),
    ...design.furniture.map((item) => ({ x: item.x, y: item.y }))
  ];

  if (values.length === 0) {
    return { minX: 0, minY: 0, maxX: design.canvas.width, maxY: design.canvas.height };
  }

  return {
    minX: Math.min(...values.map((point) => point.x)) - 80,
    minY: Math.min(...values.map((point) => point.y)) - 80,
    maxX: Math.max(...values.map((point) => point.x)) + 80,
    maxY: Math.max(...values.map((point) => point.y)) + 80
  };
};

const furnitureRect = (design: DesignDocument, item: FurnitureInstance) => {
  const width = (item.width / 100) * design.canvas.scalePxPerMeter;
  const depth = (item.depth / 100) * design.canvas.scalePxPerMeter;

  return { width, depth, x: item.x - width / 2, y: item.y - depth / 2 };
};

const renderGrid = (design: DesignDocument, bounds: ReturnType<typeof getBounds>) => {
  const lines: string[] = [];

  for (let x = 0; x <= design.canvas.width; x += design.canvas.gridSize) {
    if (x < bounds.minX || x > bounds.maxX) continue;
    lines.push(`<line x1="${x}" y1="${bounds.minY}" x2="${x}" y2="${bounds.maxY}" stroke="#edf1ee" stroke-width="0.7" />`);
  }

  for (let y = 0; y <= design.canvas.height; y += design.canvas.gridSize) {
    if (y < bounds.minY || y > bounds.maxY) continue;
    lines.push(`<line x1="${bounds.minX}" y1="${y}" x2="${bounds.maxX}" y2="${y}" stroke="#edf1ee" stroke-width="0.7" />`);
  }

  return lines.join('\n');
};

const renderWallLength = (design: DesignDocument, wall: Wall) => {
  const length = pxToMeters(wallLengthPx(wall), design.canvas.scalePxPerMeter).toFixed(2);
  const x = (wall.start.x + wall.end.x) / 2;
  const y = (wall.start.y + wall.end.y) / 2 - 10;

  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="12" fill="#3d4656">${length}m</text>`;
};

const renderOpening = (design: DesignDocument, opening: Opening) => {
  const width = (opening.width / 100) * design.canvas.scalePxPerMeter;
  const color = opening.kind === 'door' ? '#9a6635' : '#2f88c5';
  const label = opening.kind === 'door' ? '门' : '窗';

  return `<g transform="translate(${opening.x} ${opening.y}) rotate(${opening.rotation})">
    <line x1="${-width / 2}" y1="0" x2="${width / 2}" y2="0" stroke="${color}" stroke-width="5" stroke-linecap="round" />
    <text x="0" y="-10" text-anchor="middle" font-size="12" fill="${color}">${label}</text>
  </g>`;
};

const renderRoomZone = (design: DesignDocument, zone: RoomZone, showRoomAreas: boolean) => {
  const points = zone.points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = zone.manualAreaSqm ?? getRoomZoneAreaSqm(zone, design.canvas.scalePxPerMeter);

  return `<g>
    <polygon points="${points}" fill="${zone.color}" fill-opacity="0.14" stroke="${zone.color}" stroke-width="2" stroke-dasharray="10 7" />
    <text x="${zone.label.x}" y="${zone.label.y - 3}" text-anchor="middle" font-size="13" font-weight="700" fill="#20372f">${escapeXml(zone.name)}</text>
    ${showRoomAreas ? `<text x="${zone.label.x}" y="${zone.label.y + 14}" text-anchor="middle" font-size="12" fill="#4b635a">${area.toFixed(1)}㎡</text>` : ''}
  </g>`;
};

export const createPlanSvg = (
  design: DesignDocument,
  options: {
    showGrid: boolean;
    showWallLengths: boolean;
    showRoomAreas: boolean;
    includeBackground: boolean;
    includeRecognitionLayer: boolean;
  }
) => {
  const bounds = getBounds(design);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const recognitionWalls =
    options.includeRecognitionLayer && design.recognition?.visible
      ? design.recognition.walls.filter((wall) => wall.status !== 'deleted')
      : [];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="${bounds.minX} ${bounds.minY} ${width} ${height}" role="img" aria-label="${escapeXml(design.name)} 平面图">
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${width}" height="${height}" fill="#fbfdfb" />
  ${options.includeBackground && design.backgroundImage?.visible ? `<image href="${design.backgroundImage.dataUrl}" x="${design.backgroundImage.x}" y="${design.backgroundImage.y}" width="${design.backgroundImage.width}" height="${design.backgroundImage.height}" opacity="${design.backgroundImage.opacity}" />` : ''}
  ${options.showGrid ? renderGrid(design, bounds) : ''}
  ${(design.roomZones ?? []).map((zone) => renderRoomZone(design, zone, options.showRoomAreas)).join('\n')}
  ${recognitionWalls.map((wall) => `<line x1="${wall.start.x}" y1="${wall.start.y}" x2="${wall.end.x}" y2="${wall.end.y}" stroke="#21a67a" stroke-width="${Math.max(8, wall.thickness)}" stroke-dasharray="18 10" stroke-linecap="round" opacity="0.72" />`).join('\n')}
  ${design.walls.map((wall) => `<line x1="${wall.start.x}" y1="${wall.start.y}" x2="${wall.end.x}" y2="${wall.end.y}" stroke="#303642" stroke-width="${wall.thickness}" stroke-linecap="round" />`).join('\n')}
  ${options.showWallLengths ? design.walls.map((wall) => renderWallLength(design, wall)).join('\n') : ''}
  ${design.openings.map((opening) => renderOpening(design, opening)).join('\n')}
  ${design.furniture.map((item) => {
    const rect = furnitureRect(design, item);
    return `<g transform="rotate(${item.rotation} ${item.x} ${item.y})">
      <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.depth}" rx="6" fill="${item.color}" stroke="${item.accentColor}" stroke-width="2" />
      <text x="${item.x}" y="${item.y + rect.depth / 2 + 15}" text-anchor="middle" font-size="12" fill="#27303f">${escapeXml(item.name)}</text>
    </g>`;
  }).join('\n')}
  ${design.rooms.map((room) => `<g><rect x="${room.x - 45}" y="${room.y - 20}" width="90" height="40" rx="6" fill="#ffffff" opacity="0.82" /><text x="${room.x}" y="${room.y - 4}" text-anchor="middle" font-size="13" font-weight="700" fill="#38404d">${escapeXml(room.name)}</text><text x="${room.x}" y="${room.y + 13}" text-anchor="middle" font-size="11" fill="#687282">${escapeXml(room.area)}</text></g>`).join('\n')}
</svg>`;
};

const createSummaryCards = (design: DesignDocument, total: number) => `
  <section class="summary">
    <div class="card">墙体<strong>${design.walls.length}</strong></div>
    <div class="card">门窗<strong>${design.openings.length}</strong></div>
    <div class="card">家具<strong>${design.furniture.length}</strong></div>
    <div class="card">总面积<strong>${design.homeAreaSqm ? design.homeAreaSqm.toFixed(1) + '㎡' : '未填写'}</strong></div>
    <div class="card">房间区域<strong>${(design.roomZones ?? []).length}</strong></div>
    <div class="card">预算<strong>${formatCurrency(total)}</strong></div>
  </section>`;

export const createDeliveryHtml = (
  design: DesignDocument,
  planImage: string,
  svgPlan: string,
  mode: 'report' | 'print',
  printSettings: PrintSettings
) => {
  const items = createEstimateItems(design);
  const total = getEstimateTotal(items);
  const roomZoneRows = (design.roomZones ?? [])
    .map((zone) => {
      const autoArea = getRoomZoneAreaSqm(zone, design.canvas.scalePxPerMeter);
      const displayArea = zone.manualAreaSqm ?? autoArea;
      return `<tr><td>${escapeXml(zone.name)}</td><td>${displayArea.toFixed(2)}㎡</td><td>${zone.manualAreaSqm ? '手动面积' : '自动面积'}</td></tr>`;
    })
    .join('');
  const estimateRows = items
    .map(
      (item) =>
        `<tr><td>${escapeXml(item.category)}</td><td>${escapeXml(item.roomName)}</td><td>${escapeXml(item.name)}</td><td>${item.quantity.toFixed(2)}${escapeXml(item.unit)}</td><td>${formatCurrency(item.total)}</td></tr>`
    )
    .join('');
  const furnitureRows = design.furniture
    .map(
      (item) => {
        const modelAsset = (design.importedModelAssets ?? []).find((asset) => asset.id === item.modelAssetId);
        const image = item.product?.imageUrl
          ? `<img class="product-thumb" src="${escapeXml(item.product.imageUrl)}" alt="${escapeXml(item.name)}" />`
          : '-';
        const link = item.product?.productUrl
          ? `<a href="${escapeXml(item.product.productUrl)}" target="_blank" rel="noreferrer">查看链接</a>`
          : '-';

        return `<tr><td>${image}</td><td>${escapeXml(item.name)}</td><td>${escapeXml(item.category)}</td><td>${escapeXml(item.material)}</td><td>${escapeXml(item.product?.brand)}</td><td>${item.product?.referencePrice ? formatCurrency(item.product.referencePrice) : '-'}</td><td>${link}</td><td>${modelAsset ? escapeXml(modelAsset.name) : '程序化体块'}</td></tr>`;
      }
    )
    .join('');
  const recognition = design.recognition;
  const recognitionSummary = recognition
    ? `<p>识别质量：外框覆盖 ${Math.round((recognition.qualityReport?.outerFrameCoverage ?? 0) * 100)}%，候选墙 ${recognition.walls.filter((wall) => wall.status === 'active').length} 面，门窗候选 ${(recognition.openingCandidates ?? []).filter((item) => item.status === 'active').length} 个，房间候选 ${(recognition.roomCandidates ?? []).filter((item) => item.status === 'active').length} 个。</p>`
    : '<p>未保存识别图层。</p>';
  const paperSize = printSettings.paperSize === 'A3' ? 'A3' : 'A4';
  const orientation = printSettings.orientation === 'portrait' ? 'portrait' : 'landscape';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(design.name)} ${mode === 'print' ? '打印布局' : '交付报告'}</title>
  <style>
    @page { size: ${paperSize} ${orientation}; margin: 12mm; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2933; background: #f5f7f4; }
    main { max-width: ${mode === 'print' ? 'none' : '1120px'}; margin: 0 auto; padding: 28px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 24px 0 10px; font-size: 17px; }
    .meta { color: #5d6874; margin-bottom: 18px; }
    .summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
    .card { background: #fff; border: 1px solid #dfe6e1; border-radius: 8px; padding: 12px; }
    .card strong { display: block; font-size: 20px; margin-top: 5px; }
    .plan { background: #fff; border: 1px solid #dfe6e1; border-radius: 8px; padding: 10px; }
    .plan img, .plan svg { display: block; max-width: 100%; max-height: ${mode === 'print' ? '62vh' : '760px'}; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dfe6e1; }
    th, td { padding: 9px 11px; border-bottom: 1px solid #edf1ee; text-align: left; font-size: 13px; }
    th { background: #eef4f0; }
    a { color: #176b8f; text-decoration: none; }
    .product-thumb { width: 42px; height: 42px; object-fit: cover; border: 1px solid #dfe6e1; border-radius: 6px; background: #f5f7f4; }
    .total { text-align: right; font-size: 19px; font-weight: 700; }
    .notice { border-left: 4px solid #2f88c5; background: #eef7fb; padding: 10px 12px; color: #36586c; }
    @media print { body { background: #fff; } main { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <main>
    <h1>${escapeXml(design.name)}</h1>
    <div class="meta">生成时间：${escapeXml(new Date(design.updatedAt).toLocaleString('zh-CN'))}</div>
    ${createSummaryCards(design, total)}
    ${mode === 'print' ? '<p class="notice no-print">PDF 导出方式：请在 Google Chrome 中使用打印功能，并选择“另存为 PDF”。</p>' : ''}
    <h2>平面图</h2>
    <section class="plan">${planImage ? `<img src="${planImage}" alt="平面图" />` : svgPlan}</section>
    ${printSettings.showLegend ? '<p>图例：深色线为正式墙体，蓝色为窗，棕色为门，彩色区域为房间区域。</p>' : ''}
    <h2>房间区域</h2>
    <table><thead><tr><th>房间</th><th>面积</th><th>来源</th></tr></thead><tbody>${roomZoneRows || '<tr><td colspan="3">尚未绘制房间区域</td></tr>'}</tbody></table>
    ${printSettings.showBudgetSummary ? `<h2>预算清单</h2><table><thead><tr><th>类别</th><th>房间</th><th>项目</th><th>数量</th><th>小计</th></tr></thead><tbody>${estimateRows || '<tr><td colspan="5">暂无预算项目</td></tr>'}</tbody></table><p class="total">预算合计：${formatCurrency(total)}</p>` : ''}
    <h2>家具商品清单</h2>
    <table><thead><tr><th>图片</th><th>名称</th><th>分类</th><th>材质</th><th>品牌</th><th>参考价</th><th>链接</th><th>3D 模型</th></tr></thead><tbody>${furnitureRows || '<tr><td colspan="8">暂无家具</td></tr>'}</tbody></table>
    <h2>识别质量摘要</h2>
    ${recognitionSummary}
  </main>
</body>
</html>`;
};

export const createSharePackageHtml = (design: DesignDocument, planImage: string, svgPlan: string) => {
  const items = createEstimateItems(design);
  const total = getEstimateTotal(items);
  const shareSettings = design.sharePackageDraft;
  const mobileImports = design.mobileCaptureDraft?.imports ?? [];
  const jsonBlock = shareSettings?.includeJson ? JSON.stringify(design, null, 2) : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(design.name)} 分享包</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2933; background: #f5f7f4; }
    main { max-width: 1120px; margin: 0 auto; padding: 28px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 24px 0 10px; font-size: 17px; }
    .meta { color: #5d6874; margin-bottom: 18px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .card { background: #fff; border: 1px solid #dfe6e1; border-radius: 8px; padding: 12px; }
    .card strong { display: block; font-size: 20px; margin-top: 5px; }
    .plan { background: #fff; border: 1px solid #dfe6e1; border-radius: 8px; padding: 10px; }
    .plan img, .plan svg { display: block; max-width: 100%; max-height: 760px; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dfe6e1; }
    th, td { padding: 9px 11px; border-bottom: 1px solid #edf1ee; text-align: left; font-size: 13px; }
    th { background: #eef4f0; }
    pre { overflow: auto; max-height: 460px; border: 1px solid #dfe6e1; border-radius: 8px; padding: 12px; background: #111827; color: #e5e7eb; }
    .notice { border-left: 4px solid #2f88c5; background: #eef7fb; padding: 10px 12px; color: #36586c; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeXml(design.name)} 分享包</h1>
    <div class="meta">生成时间：${escapeXml(new Date().toLocaleString('zh-CN'))} · 本地分享包，不包含真实公网链接。</div>
    <section class="summary">
      <div class="card">墙体<strong>${design.walls.length}</strong></div>
      <div class="card">家具<strong>${design.furniture.length}</strong></div>
      <div class="card">房屋面积<strong>${design.homeAreaSqm ? design.homeAreaSqm.toFixed(1) + '㎡' : '未填写'}</strong></div>
      <div class="card">预算<strong>${formatCurrency(total)}</strong></div>
    </section>
    <h2>平面图</h2>
    <section class="plan">${shareSettings?.includePlanImage && planImage ? `<img src="${planImage}" alt="平面图" />` : svgPlan}</section>
    ${
      shareSettings?.includeBudget
        ? `<h2>预算摘要</h2><p class="notice">预算合计：${formatCurrency(total)}，项目数量：${items.length}。</p>`
        : ''
    }
    <h2>移动采集导入</h2>
    <table><thead><tr><th>来源</th><th>文件</th><th>房间</th><th>墙体</th><th>照片</th><th>备注</th></tr></thead><tbody>${
      mobileImports
        .map(
          (item) =>
            `<tr><td>${escapeXml(item.source)}</td><td>${escapeXml(item.fileName)}</td><td>${item.roomCount}</td><td>${item.wallCount}</td><td>${item.photoCount}</td><td>${escapeXml(item.note)}</td></tr>`
        )
        .join('') || '<tr><td colspan="6">暂无移动采集导入记录</td></tr>'
    }</tbody></table>
    ${jsonBlock ? `<h2>方案 JSON</h2><pre>${escapeXml(jsonBlock)}</pre>` : ''}
  </main>
</body>
</html>`;
};

export const createDxfDraft = (design: DesignDocument, settings: ExportDraftSettings) => {
  const unitScale = settings.dxfUnit === 'millimeter' ? (1000 / design.canvas.scalePxPerMeter) : (1 / design.canvas.scalePxPerMeter);
  const lines = [
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    ...design.walls.flatMap((wall) => [
      '0',
      'LINE',
      '8',
      'WALLS',
      '10',
      (wall.start.x * unitScale).toFixed(3),
      '20',
      (wall.start.y * unitScale).toFixed(3),
      '11',
      (wall.end.x * unitScale).toFixed(3),
      '21',
      (wall.end.y * unitScale).toFixed(3)
    ]),
    '0',
    'ENDSEC',
    '0',
    'EOF'
  ];

  return lines.join('\n');
};

export const createModelDraft = (design: DesignDocument, format: 'glb' | 'obj', settings: ExportDraftSettings) =>
  JSON.stringify(
    {
      formatDraft: format.toUpperCase(),
      notice: settings.draftNotice,
      unit: settings.modelUnit,
      designId: design.id,
      name: design.name,
      importedModelAssets: (design.importedModelAssets ?? []).map((asset) => ({
        id: asset.id,
        name: asset.name,
        fileName: asset.fileName,
        format: asset.format,
        sizeBytes: asset.sizeBytes,
        category: asset.category,
        transform: asset.transform,
        hasEmbeddedDataUrl: Boolean(asset.dataUrl)
      })),
      walls: design.walls.map((wall) => ({
        start: {
          x: pxToMeters(wall.start.x, design.canvas.scalePxPerMeter),
          y: pxToMeters(wall.start.y, design.canvas.scalePxPerMeter)
        },
        end: {
          x: pxToMeters(wall.end.x, design.canvas.scalePxPerMeter),
          y: pxToMeters(wall.end.y, design.canvas.scalePxPerMeter)
        },
        height: 2.8,
        thickness: pxToMeters(wall.thickness, design.canvas.scalePxPerMeter)
      })),
      openings: design.openings,
      furniture: design.furniture.map((item) => ({
        name: item.name,
        category: item.category,
        x: pxToMeters(item.x, design.canvas.scalePxPerMeter),
        y: pxToMeters(item.y, design.canvas.scalePxPerMeter),
        width: item.width / 100,
        depth: item.depth / 100,
        height: item.height ?? 0.45,
        materialId: item.materialId,
        modelAssetId: item.modelAssetId,
        modelTransform: item.modelTransform,
        product: item.product
      }))
    },
    null,
    2
  );
