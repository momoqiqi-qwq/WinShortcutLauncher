import { useAppStore } from '../../stores/appStore';
import { ImageBrowserPanel } from './ImageBrowserPanel';
import './ImageBrowserPanel.css';

interface ImageBrowserProps {
  open: boolean;
  onClose: () => void;
}

export function ImageBrowser({ open, onClose }: ImageBrowserProps) {
  const items = useAppStore((state) => state.imageBrowserItems);
  const settings = useAppStore((state) => state.imageBrowser);
  const setImageBrowserItems = useAppStore((state) => state.setImageBrowserItems);
  const updateImageBrowser = useAppStore((state) => state.updateImageBrowser);

  return (
    <ImageBrowserPanel
      openPanel={open}
      items={items}
      settings={settings}
      onClose={onClose}
      onChange={setImageBrowserItems}
      onUpdateSettings={updateImageBrowser}
    />
  );
}
