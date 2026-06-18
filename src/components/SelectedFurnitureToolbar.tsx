import { Clipboard, Copy, RotateCw, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';

type SelectedFurnitureToolbarProps = {
  style: CSSProperties;
  canPaste: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onRotate: () => void;
  onDelete: () => void;
};

export default function SelectedFurnitureToolbar({
  style,
  canPaste,
  onCopy,
  onPaste,
  onRotate,
  onDelete
}: SelectedFurnitureToolbarProps) {
  return (
    <div className="selection-toolbar" style={style}>
      <button type="button" onClick={onCopy} title="复制家具" aria-label="复制家具">
        <Copy size={15} />
      </button>
      <button type="button" onClick={onPaste} disabled={!canPaste} title="粘贴家具" aria-label="粘贴家具">
        <Clipboard size={15} />
      </button>
      <button type="button" onClick={onRotate} title="旋转 90°" aria-label="旋转 90°">
        <RotateCw size={15} />
      </button>
      <button type="button" onClick={onDelete} title="删除家具" aria-label="删除家具">
        <Trash2 size={15} />
      </button>
    </div>
  );
}
