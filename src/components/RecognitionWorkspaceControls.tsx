import type { RecognitionWorkspaceState } from '../types';

type RecognitionWorkspaceControlsProps = {
  recognitionWorkspace: RecognitionWorkspaceState;
  hasBackgroundImage: boolean;
  recognizingFloorplan: boolean;
  samplingWallColor: boolean;
  onRecognitionWorkspaceChange: (patch: Partial<RecognitionWorkspaceState>) => void;
  onStartWallColorSampling: () => void;
};

const steps: Array<{
  step: RecognitionWorkspaceState['step'];
  label: string;
  tool: RecognitionWorkspaceState['activeTool'];
}> = [
  { step: 'range', label: '设置范围', tool: 'crop' },
  { step: 'recognize', label: '识别墙体', tool: 'select-candidate' },
  { step: 'review', label: '修正并写入', tool: 'select-candidate' }
];

export default function RecognitionWorkspaceControls({
  recognitionWorkspace,
  hasBackgroundImage,
  recognizingFloorplan,
  samplingWallColor,
  onRecognitionWorkspaceChange,
  onStartWallColorSampling
}: RecognitionWorkspaceControlsProps) {
  return (
    <>
      <div className="recognition-stepper" aria-label="识别流程">
        {steps.map((item, index) => (
          <button
            className={recognitionWorkspace.step === item.step ? 'is-active' : ''}
            key={item.step}
            type="button"
            onClick={() => onRecognitionWorkspaceChange({ step: item.step, activeTool: item.tool })}
          >
            <span>{index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>
      <div className="recognition-quick-actions">
        <button
          className={recognitionWorkspace.activeTool === 'crop' ? 'is-active' : ''}
          type="button"
          onClick={() => onRecognitionWorkspaceChange({ step: 'range', activeTool: 'crop' })}
        >
          范围框
        </button>
        <button
          className={recognitionWorkspace.activeTool === 'sample-color' || samplingWallColor ? 'is-active' : ''}
          type="button"
          onClick={onStartWallColorSampling}
          disabled={!hasBackgroundImage || recognizingFloorplan}
        >
          采样墙色
        </button>
        <button
          className={recognitionWorkspace.activeTool === 'select-candidate' ? 'is-active' : ''}
          type="button"
          onClick={() => onRecognitionWorkspaceChange({ step: 'review', activeTool: 'select-candidate' })}
        >
          选择候选
        </button>
      </div>
    </>
  );
}
