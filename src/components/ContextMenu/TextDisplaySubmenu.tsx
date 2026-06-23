import type { ShortcutItem } from '../../types';
import { useAppStore } from '../../stores/appStore';

interface TextDisplaySubmenuProps {
  item: ShortcutItem;
  onDone?: () => void;
}

export function TextDisplaySubmenu({ item, onDone }: TextDisplaySubmenuProps) {
  const display = useAppStore((state) => state.display);
  const updateDisplay = useAppStore((state) => state.updateDisplay);
  const setItemLabelLines = useAppStore((state) => state.setItemLabelLines);
  const applyDisplayToAllItems = useAppStore((state) => state.applyDisplayToAllItems);
  const effective = item.labelLines ?? display.labelLines;

  return (
    <div className="menu-surface text-submenu" onClick={(event) => event.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((line) => (
        <div
          key={line}
          className="menu-item"
          onClick={() => {
            setItemLabelLines(item.id, line);
            onDone?.();
          }}
        >
          <span>显示 {line} 行</span>
          <span>{effective === line ? '✓' : ''}</span>
        </div>
      ))}
      <div className="menu-separator" />
      <label className="menu-item menu-item-input">
        <span>换行字数</span>
        <input
          value={display.charsPerLine}
          type="number"
          min={4}
          max={20}
          onChange={(event) => updateDisplay({ charsPerLine: Number(event.target.value) })}
          onClick={(event) => event.stopPropagation()}
        />
      </label>
      <div
        className="menu-item"
        onClick={() => {
          applyDisplayToAllItems(effective);
          onDone?.();
        }}
      >
        应用到全部项目
      </div>
      {item.labelLines !== undefined && (
        <div
          className="menu-item"
          onClick={() => {
            setItemLabelLines(item.id, undefined);
            onDone?.();
          }}
        >
          恢复继承全局
        </div>
      )}
    </div>
  );
}
