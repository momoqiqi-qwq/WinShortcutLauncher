import { describe, expect, it } from 'vitest';
import { chooseIconResolveCommand, isImageIconFilePath } from '../iconCache';

describe('website/local image icon format coverage', () => {
  it('routes common WebView image files through the raw image reader', () => {
    const extensions = ['png', 'apng', 'jpg', 'jpeg', 'jfif', 'webp', 'gif', 'svg', 'ico', 'bmp', 'avif'];
    for (const extension of extensions) {
      const path = `C:/icons/site.${extension}`;
      expect(isImageIconFilePath(path)).toBe(true);
      expect(chooseIconResolveCommand(path, false, 'auto')).toBe('read_icon_as_data_url');
    }
  });

  it('keeps executable icon extraction on the shell icon path', () => {
    expect(isImageIconFilePath('C:/Apps/tool.exe')).toBe(false);
    expect(chooseIconResolveCommand('C:/Apps/tool.exe', true, 'auto')).toBe('get_file_icon');
  });
});
