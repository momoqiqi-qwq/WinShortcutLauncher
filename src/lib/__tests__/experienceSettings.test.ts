import { describe, expect, it } from 'vitest';
import { AREA_CONTEXT_MENU_IDS, DIRECTORY_CONTEXT_MENU_IDS, GROUP_CONTEXT_MENU_IDS, defaultExperience, normalizeExperience } from '../experienceSettings';

describe('experience settings migration', () => {
  it('fills all missing settings from defaults', () => {
    expect(normalizeExperience({ rememberLastPage: false })).toEqual({
      ...defaultExperience,
      rememberLastPage: false
    });
  });

  it('uses strict booleans for opt-in settings', () => {
    expect(normalizeExperience({ showLaunchNotice: true, reduceMotion: true })).toMatchObject({
      showLaunchNotice: true,
      reduceMotion: true
    });
    expect(normalizeExperience({ showLaunchNotice: false, reduceMotion: false })).toMatchObject({
      showLaunchNotice: false,
      reduceMotion: false
    });
  });

  it('normalizes navigation and context-menu freedom settings', () => {
    expect(normalizeExperience({
      directoryRightClickMode: 'manage',
      promptDirectoryNameOnCreate: true,
      activateNewDirectoryAfterCreate: false,
      compactContextMenus: true,
      showContextMenuIcons: false,
    })).toMatchObject({
      directoryRightClickMode: 'manage',
      promptDirectoryNameOnCreate: true,
      activateNewDirectoryAfterCreate: false,
      compactContextMenus: true,
      showContextMenuIcons: false,
    });
  });


  it('normalizes hidden items for the three context-menu categories', () => {
    const normalized = normalizeExperience({
      directoryContextMenuHiddenItems: ['rename', 'rename', 'bad-value' as never],
      groupContextMenuHiddenItems: ['merge'],
      areaContextMenuHiddenItems: ['addUrl', 'clearDirectory' as never],
    });
    expect(normalized.directoryContextMenuHiddenItems).toEqual(['rename']);
    expect(normalized.groupContextMenuHiddenItems).toEqual(['merge']);
    expect(normalized.areaContextMenuHiddenItems).toEqual(['addUrl']);
  });

  it('keeps parent, child and blank-area menu definitions independent', () => {
    expect(GROUP_CONTEXT_MENU_IDS).toEqual(['create', 'merge', 'color', 'delete']);
    expect(DIRECTORY_CONTEXT_MENU_IDS).toEqual(['rename', 'merge', 'switchToNotes', 'switchToNormal', 'clear', 'delete']);
    expect(AREA_CONTEXT_MENU_IDS).toEqual(['createDirectory', 'addFile', 'addFolder', 'addUrl', 'addSystem', 'iconSize', 'viewMode', 'sortMode', 'globalIconSize', 'globalViewMode', 'globalSortMode', 'refreshIcons']);
    expect(DIRECTORY_CONTEXT_MENU_IDS.filter((id) => AREA_CONTEXT_MENU_IDS.includes(id as never))).toEqual([]);
  });

  it('keeps per-category settings scroll memory enabled by default and allows disabling it', () => {
    expect(normalizeExperience({}).rememberSettingsScrollPosition).toBe(true);
    expect(normalizeExperience({ rememberSettingsScrollPosition: false }).rememberSettingsScrollPosition).toBe(false);
  });

  it('shows settings descriptions by default and persists concise mode', () => {
    expect(normalizeExperience({}).showSettingsDescriptions).toBe(true);
    expect(normalizeExperience({ showSettingsDescriptions: false }).showSettingsDescriptions).toBe(false);
  });

});
