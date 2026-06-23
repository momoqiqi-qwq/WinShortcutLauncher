export type SearchOpenAction = 'open' | 'locate';
export type IconResolveMode = 'auto' | 'read_icon_as_data_url' | 'get_file_icon';
export type ImageNamePosition = 'inside' | 'top' | 'bottom' | 'hidden';

export interface GlobalSearchSettings {
  enabled: boolean;
  placeholder: string;
  maxResults: number;
  debounceMs: number;
  iconSize: number;
  iconResolveMode: IconResolveMode;
  iconParallelTasks: number;
  showItemIcon: boolean;
  showGroupPath: boolean;
  showFullPath: boolean;
  highlightMatches: boolean;
  searchInName: boolean;
  searchInPath: boolean;
  searchInUrl: boolean;
  searchInGroup: boolean;
  searchInSubGroup: boolean;
  includeNotes: boolean;
  includeSystemTools: boolean;
  enterAction: SearchOpenAction;
  ctrlEnterAction: SearchOpenAction;
}

export interface ImageBrowserGroup {
  id: string;
  name: string;
  order: number;
}

export interface ImageBrowserSettings {
  enabled: boolean;
  panelWidth: number;
  thumbnailPaneWidth: number;
  thumbnailWidth: number;
  showFileName: boolean;
  imageNamePosition: ImageNamePosition;
  previewFit: 'contain' | 'cover' | 'actual';
  previewBackground: string;
  previewPadding: number;
  previewRadius: number;
  panelOpacity: number;
  showHint: boolean;
  showImageMeta: boolean;
  acceptExternalDrops: boolean;
  dragExportAction: 'copy' | 'move';
  confirmClear: boolean;
  groups: ImageBrowserGroup[];
  activeGroupId: string;
  showAddButton: boolean;
  showCopyAllButton: boolean;
  showClearButton: boolean;
  showActiveActions: boolean;
}

export interface ImageBrowserItem {
  id: string;
  name: string;
  path: string;
  groupId?: string;
  dataUrl?: string;
  addedAt: number;
}

export interface TransferStationSettings {
  enabled: boolean;
  panelWidth: number;
  acceptExternalDrops: boolean;
  dragToShortcutFolders: boolean;
  dropAction: 'copy' | 'move';
  iconSize: number;
  showIcon: boolean;
  confirmClear: boolean;
}

export interface TransferStationItem {
  id: string;
  name: string;
  path: string;
  icon?: string;
  kind: 'file' | 'folder' | 'unknown';
  addedAt: number;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  vars: Record<string, string>;
  preview?: {
    bg: string;
    panel: string;
    accent: string;
    text: string;
  };
}

export const DEFAULT_GLOBAL_SEARCH_SETTINGS: GlobalSearchSettings = {
  enabled: true,
  placeholder: '全局搜索应用、文件、网址或路径',
  maxResults: 80,
  debounceMs: 80,
  iconSize: 28,
  iconResolveMode: 'auto',
  iconParallelTasks: 6,
  showItemIcon: true,
  showGroupPath: true,
  showFullPath: true,
  highlightMatches: true,
  searchInName: true,
  searchInPath: true,
  searchInUrl: true,
  searchInGroup: true,
  searchInSubGroup: true,
  includeNotes: false,
  includeSystemTools: true,
  enterAction: 'open',
  ctrlEnterAction: 'locate',
};

export const DEFAULT_IMAGE_BROWSER_SETTINGS: ImageBrowserSettings = {
  enabled: true,
  panelWidth: 860,
  thumbnailPaneWidth: 170,
  thumbnailWidth: 132,
  showFileName: true,
  imageNamePosition: 'bottom',
  previewFit: 'contain',
  previewBackground: 'rgba(0, 0, 0, 0.28)',
  previewPadding: 12,
  previewRadius: 4,
  panelOpacity: 0.96,
  showHint: true,
  showImageMeta: true,
  acceptExternalDrops: true,
  dragExportAction: 'copy',
  confirmClear: true,
  groups: [{ id: 'default', name: '默认', order: 0 }],
  activeGroupId: 'default',
  showAddButton: true,
  showCopyAllButton: true,
  showClearButton: true,
  showActiveActions: true,
};

export const DEFAULT_TRANSFER_STATION_SETTINGS: TransferStationSettings = {
  enabled: true,
  panelWidth: 420,
  acceptExternalDrops: true,
  dragToShortcutFolders: true,
  dropAction: 'copy',
  iconSize: 28,
  showIcon: true,
  confirmClear: true,
};
