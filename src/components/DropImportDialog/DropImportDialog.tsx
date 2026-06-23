import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { byOrder } from '../../lib/sort';
import { createFastShortcutItemsFromPaths, hydrateShortcutItemsFromPaths } from '../../lib/createShortcutItems';

interface DropImportDialogProps {
  paths: string[];
  onClose: () => void;
}

export function DropImportDialog({ paths, onClose }: DropImportDialogProps) {
  const groups = useAppStore((state) => state.groups);
  const activeGroupId = useAppStore((state) => state.activeGroupId);
  const activeDirectoryId = useAppStore((state) => state.activeDirectoryId);
  const addItems = useAppStore((state) => state.addItems);
  const updateItem = useAppStore((state) => state.updateItem);
  const options = useMemo(() => groups.slice().sort(byOrder).flatMap((group) =>
    group.directories.slice().sort(byOrder).filter((directory) => (directory.kind ?? 'normal') === 'normal').map((directory) => ({
      value: `${group.id}::${directory.id}`,
      label: `${group.name} / ${directory.name}`,
      groupId: group.id,
      directoryId: directory.id
    }))
  ), [groups]);
  const initialTarget = options.find((option) => option.value === `${activeGroupId}::${activeDirectoryId}`)?.value ?? options[0]?.value ?? '';
  const [target, setTarget] = useState(initialTarget);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    const option = options.find((entry) => entry.value === target) ?? options[0];
    if (!option) return;
    setBusy(true);
    const created = createFastShortcutItemsFromPaths(paths);
    addItems(option.groupId, option.directoryId, created);
    onClose();
    void hydrateShortcutItemsFromPaths(paths, created.map((item) => item.id), updateItem);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card drop-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="settings-header">
          <div>
            <h2>添加快捷项目</h2>
            <p>已拖入 {paths.length} 个文件/文件夹/快捷方式，选择要加入的普通目录。</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="drop-dialog-body">
          <select className="soft-input" value={target} onChange={(event) => setTarget(event.target.value)}>
            {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
          <div className="dropped-list">
            {paths.map((path) => <div key={path} title={path}>{path}</div>)}
          </div>
          <div className="button-row">
            <button className="btn-secondary" onClick={onClose}>取消</button>
            <button className="btn-primary" onClick={confirm} disabled={busy || !options.length}>{busy ? '正在添加...' : '添加'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
