import type { RoadmapModule } from '../types';

export const ROADMAP_MODULES: RoadmapModule[] = [
  {
    key: 'floorplan-recognition',
    title: '户型识别',
    description: '上传底图、设置识别范围、墙体补全、门窗候选、房间候选、质量报告和图层精修。',
    status: 'beta',
    benchmark: 'Planner 5D / Homestyler',
    version: 'V3-V12'
  },
  {
    key: 'two-d-editing',
    title: '2D 编辑',
    description: '模板、墙体、门窗、家具、房间区域、尺寸标注、快捷键和更清晰的工具分组。',
    status: 'available',
    benchmark: 'Sweet Home 3D / Floorplanner',
    version: 'V1-V12'
  },
  {
    key: 'three-d-rendering',
    title: '3D 渲染',
    description: '实时 3D、材质、灯光、截图，后续升级高清效果图、漫游路径和更精细材质。',
    status: 'beta',
    benchmark: 'Floorplanner / Homestyler',
    version: 'V2-V6'
  },
  {
    key: 'furniture-materials',
    title: '家具材料',
    description: '家具库、收藏、推荐、组合家具、材质刷和商品字段，后续扩展模型市场。',
    status: 'available',
    benchmark: 'Planner 5D / Homestyler',
    version: 'V2-V8'
  },
  {
    key: 'estimate-report',
    title: '预算报告',
    description: '房间面积、材料用量、本地预算、HTML 报告和 CSV 清单。',
    status: 'beta',
    benchmark: 'Magicplan',
    version: 'V5'
  },
  {
    key: 'mobile-capture',
    title: '手机采集',
    description: '预留 LiDAR、AR、照片和移动端采集数据入口。',
    status: 'planned',
    benchmark: 'Magicplan',
    version: 'V15'
  },
  {
    key: 'cloud-collaboration',
    title: '云端协作',
    description: '预留账号、云保存、分享链接和多人协作草案。',
    status: 'external-required',
    benchmark: 'Homestyler / Floorplanner',
    version: 'V15'
  },
  {
    key: 'ai-design',
    title: 'AI 设计',
    description: '预留 AI 自动布局、风格方案和照片级云渲染任务。',
    status: 'planned',
    benchmark: 'Planner 5D / Homestyler',
    version: 'V16+'
  },
  {
    key: 'format-io',
    title: '格式导入导出',
    description: '支持 PNG、SVG、JSON、HTML、CSV、打印布局、PDF 打印页和 DXF/GLB/OBJ 草案。',
    status: 'beta',
    benchmark: 'Sweet Home 3D / Magicplan',
    version: 'V5-V10'
  }
];

export const createDefaultFeatureStates = () =>
  ROADMAP_MODULES.reduce(
    (states, item) => ({ ...states, [item.key]: item.status }),
    {} as Record<RoadmapModule['key'], RoadmapModule['status']>
  );
