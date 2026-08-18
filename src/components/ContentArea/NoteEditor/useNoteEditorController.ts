import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type UIEvent,
} from 'react';
import type { Directory } from '../../../types';
import { useAppStore } from '../../../stores/appStore';
import {
  ensureNoteLine,
  getNoteLineCount,
  getNoteLineStart,
  insertNoteSeparatorAtLine,
  makeNoteSeparator,
} from '../../../lib/noteEditor';

interface NoteEditorControllerProps {
  directory: Directory;
}

interface SavedSelection {
  start: number;
  end: number;
  direction: 'forward' | 'backward' | 'none';
  scrollTop: number;
  hadFocus: boolean;
}

export function useNoteEditorController({ directory }: NoteEditorControllerProps) {
  const noteSettings = useAppStore((state) => state.notes);
  const setDirectoryNote = useAppStore((state) => state.setDirectoryNote);
  const setDirectoryNoteLineNumbers = useAppStore((state) => state.setDirectoryNoteLineNumbers);
  const updateNoteSettings = useAppStore((state) => state.updateNoteSettings);
  const [draftNote, setDraftNote] = useState(directory.note ?? '');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'pending'>('saved');
  const [noteMenu, setNoteMenu] = useState<{ x: number; y: number; lineStart: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineGutterRef = useRef<HTMLDivElement | null>(null);
  const selectionBeforeMenuRef = useRef<SavedSelection | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const directoryIdRef = useRef(directory.id);
  const draftRef = useRef(directory.note ?? '');
  const lastCommittedRef = useRef(directory.note ?? '');

  const showLineNumbers = noteSettings.lineNumberScope === 'current'
    ? Boolean(directory.noteShowLineNumbers)
    : Boolean(noteSettings.showLineNumbers);
  const actualLineCount = useMemo(() => Math.max(1, draftNote.split('\n').length), [draftNote]);
  const [renderedLineCount, setRenderedLineCount] = useState(actualLineCount);
  const [lineRowHeights, setLineRowHeights] = useState<number[]>([]);
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(1, actualLineCount, renderedLineCount) }, (_, index) => index + 1),
    [actualLineCount, renderedLineCount],
  );
  const editorStyle = {
    '--note-font-size': `${noteSettings.fontSize ?? 15}px`,
    '--note-line-height': String(noteSettings.lineHeight ?? 1.7),
    '--note-padding': `${noteSettings.padding ?? 16}px`,
    '--note-radius': `${noteSettings.radius ?? 16}px`,
  } as CSSProperties;

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const commitDraft = useCallback(() => {
    clearSaveTimer();
    const directoryId = directoryIdRef.current;
    const nextNote = draftRef.current;
    if (!directoryId || nextNote === lastCommittedRef.current) {
      setSaveStatus('saved');
      return;
    }
    lastCommittedRef.current = nextNote;
    setDirectoryNote(directoryId, nextNote);
    setSaveStatus('saved');
  }, [clearSaveTimer, setDirectoryNote]);

  useEffect(() => () => commitDraft(), [commitDraft]);

  useEffect(() => {
    commitDraft();
    const nextNote = directory.note ?? '';
    directoryIdRef.current = directory.id;
    draftRef.current = nextNote;
    lastCommittedRef.current = nextNote;
    setDraftNote(nextNote);
    setSaveStatus('saved');
    setNoteMenu(null);
  }, [directory.id]);

  function getTextLineCount(value = draftRef.current) {
    return getNoteLineCount(value);
  }

  function getLineMetrics(textarea: HTMLTextAreaElement) {
    const style = window.getComputedStyle(textarea);
    const fontSize = Number.parseFloat(style.fontSize) || (noteSettings.fontSize ?? 15);
    const lineHeight = style.lineHeight === 'normal'
      ? fontSize * 1.35
      : Number.parseFloat(style.lineHeight) || fontSize * (noteSettings.lineHeight ?? 1.7);
    const paddingTop = Number.parseFloat(style.paddingTop) || (noteSettings.padding ?? 16);
    const paddingRight = Number.parseFloat(style.paddingRight) || (noteSettings.padding ?? 16);
    const paddingBottom = Number.parseFloat(style.paddingBottom) || (noteSettings.padding ?? 16);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || (noteSettings.padding ?? 16);
    return { lineHeight, paddingTop, paddingRight, paddingBottom, paddingLeft };
  }

  function shallowEqualNumberArray(a: number[], b: number[]) {
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (Math.abs(a[index] - b[index]) > 0.5) return false;
    }
    return true;
  }

  function measureLogicalLineHeights(textarea: HTMLTextAreaElement, targetCount: number) {
    const value = draftRef.current;
    const style = window.getComputedStyle(textarea);
    const { lineHeight, paddingLeft, paddingRight } = getLineMetrics(textarea);
    const contentWidth = Math.max(24, textarea.clientWidth - paddingLeft - paddingRight);
    const lines = value.split('\n');
    const heights: number[] = [];

    try {
      const mirror = document.createElement('div');
      const copyProperties = [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'letterSpacing',
        'lineHeight',
        'textAlign',
        'textIndent',
        'textTransform',
        'wordSpacing',
        'tabSize',
      ] as const;
      copyProperties.forEach((property) => {
        mirror.style[property] = style[property];
      });
      mirror.style.position = 'absolute';
      mirror.style.left = '-100000px';
      mirror.style.top = '0';
      mirror.style.visibility = 'hidden';
      mirror.style.pointerEvents = 'none';
      mirror.style.width = `${contentWidth}px`;
      mirror.style.height = 'auto';
      mirror.style.minHeight = '0';
      mirror.style.overflow = 'hidden';
      mirror.style.whiteSpace = textarea.wrap === 'off' ? 'pre' : 'pre-wrap';
      mirror.style.overflowWrap = textarea.wrap === 'off' ? 'normal' : 'break-word';
      mirror.style.wordBreak = textarea.wrap === 'off' ? 'normal' : 'break-word';
      mirror.style.boxSizing = 'border-box';

      lines.forEach((line) => {
        const row = document.createElement('div');
        row.textContent = line.length ? line : '\u200b';
        row.style.minHeight = `${lineHeight}px`;
        row.style.padding = '0';
        row.style.margin = '0';
        row.style.border = '0';
        row.style.whiteSpace = 'inherit';
        row.style.overflowWrap = 'inherit';
        row.style.wordBreak = 'inherit';
        mirror.appendChild(row);
      });

      document.body.appendChild(mirror);
      const rows = Array.from(mirror.children) as HTMLDivElement[];
      rows.forEach((row) => {
        const measured = row.getBoundingClientRect().height;
        heights.push(Math.max(lineHeight, Number.isFinite(measured) ? measured : lineHeight));
      });
      document.body.removeChild(mirror);
    } catch {
      lines.forEach(() => heights.push(lineHeight));
    }

    while (heights.length < targetCount) heights.push(lineHeight);
    return heights.slice(0, targetCount);
  }

  function getLineNumberFromY(textarea: HTMLTextAreaElement, clientY: number) {
    const rect = textarea.getBoundingClientRect();
    const { lineHeight, paddingTop } = getLineMetrics(textarea);
    const y = Math.max(0, clientY - rect.top - paddingTop + textarea.scrollTop);
    const heights = lineRowHeights.length
      ? lineRowHeights
      : Array.from({ length: Math.max(actualLineCount, renderedLineCount) }, () => lineHeight);
    let offset = 0;
    for (let index = 0; index < heights.length; index += 1) {
      offset += Math.max(1, heights[index] || lineHeight);
      if (y < offset) return index + 1;
    }
    return Math.max(1, Math.floor(y / Math.max(1, lineHeight)) + 1);
  }

  function updateRenderedLineCount(textarea = textareaRef.current) {
    const actualCount = getTextLineCount();
    if (!textarea) {
      setRenderedLineCount((previous) => Math.max(previous, actualCount));
      return;
    }
    const { lineHeight, paddingTop } = getLineMetrics(textarea);
    const visibleEndLine = Math.ceil(
      Math.max(0, textarea.scrollTop + textarea.clientHeight - paddingTop) / Math.max(1, lineHeight),
    ) + 2;
    const nextCount = Math.max(actualCount, visibleEndLine);
    setRenderedLineCount((previous) => (previous === nextCount ? previous : nextCount));
  }

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !showLineNumbers) {
      setLineRowHeights([]);
      return;
    }
    const targetCount = Math.max(1, actualLineCount, renderedLineCount);
    const nextHeights = measureLogicalLineHeights(textarea, targetCount);
    setLineRowHeights((previous) => (
      shallowEqualNumberArray(previous, nextHeights) ? previous : nextHeights
    ));
  }, [
    draftNote,
    actualLineCount,
    renderedLineCount,
    noteSettings.fontSize,
    noteSettings.lineHeight,
    noteSettings.padding,
    noteSettings.wrap,
    showLineNumbers,
  ]);

  function handleScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (lineGutterRef.current) lineGutterRef.current.scrollTop = event.currentTarget.scrollTop;
    updateRenderedLineCount(event.currentTarget);
  }

  useEffect(() => {
    setRenderedLineCount(actualLineCount);
    window.requestAnimationFrame(() => updateRenderedLineCount());
  }, [directory.id, actualLineCount, noteSettings.fontSize, noteSettings.lineHeight, noteSettings.padding, showLineNumbers]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const observer = new ResizeObserver(() => updateRenderedLineCount(textarea));
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [directory.id, showLineNumbers]);

  function toggleLineNumbers() {
    const next = !showLineNumbers;
    if (noteSettings.lineNumberScope === 'current') {
      setDirectoryNoteLineNumbers(directory.id, next);
      return;
    }
    updateNoteSettings({ showLineNumbers: next });
  }

  function getLineStartFromValue(value: string, lineNumber: number) {
    return getNoteLineStart(value, lineNumber);
  }

  function handleChange(value: string) {
    setDraftNote(value);
    setSaveStatus('pending');
    draftRef.current = value;
    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(commitDraft, noteSettings.autosaveDelayMs ?? 450);
  }

  function ensureLineExists(lineNumber: number, textarea = textareaRef.current) {
    const target = Math.max(1, Math.round(lineNumber));
    const value = draftRef.current;
    const currentCount = getTextLineCount(value);
    if (currentCount >= target) return value;
    const nextValue = ensureNoteLine(value, target);
    handleChange(nextValue);
    if (textarea && textarea.value.length < nextValue.length) textarea.value = nextValue;
    setRenderedLineCount((previous) => Math.max(previous, target));
    return nextValue;
  }

  function jumpToLine(lineNumber: number, shouldScroll = true) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const target = Math.max(1, Math.round(lineNumber));
    const nextValue = ensureLineExists(target, textarea);
    const position = getLineStartFromValue(nextValue, target);

    const applyJump = (attempt = 0) => {
      const latest = textareaRef.current;
      if (!latest) return;
      if (latest.value.length < nextValue.length && attempt < 4) {
        window.setTimeout(() => applyJump(attempt + 1), 16);
        return;
      }
      latest.focus({ preventScroll: true });
      const safePosition = Math.max(0, Math.min(position, latest.value.length));
      latest.selectionStart = safePosition;
      latest.selectionEnd = safePosition;
      if (shouldScroll) {
        const { paddingTop } = getLineMetrics(latest);
        const heights = measureLogicalLineHeights(latest, Math.max(target, getTextLineCount(nextValue)));
        const beforeTargetHeight = heights.slice(0, target - 1).reduce((sum, height) => sum + height, 0);
        latest.scrollTop = Math.max(0, beforeTargetHeight - paddingTop);
      }
      if (lineGutterRef.current) lineGutterRef.current.scrollTop = latest.scrollTop;
      updateRenderedLineCount(latest);
    };
    window.requestAnimationFrame(() => applyJump());
  }

  function makeSeparator(char: string | undefined, length: number | undefined, fallback: string) {
    return makeNoteSeparator(char, length, fallback);
  }

  function saveSelectionForMenu(textarea: HTMLTextAreaElement) {
    selectionBeforeMenuRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      direction: textarea.selectionDirection,
      scrollTop: textarea.scrollTop,
      hadFocus: document.activeElement === textarea,
    };
  }

  function restoreSelectionFromMenu() {
    const textarea = textareaRef.current;
    const selection = selectionBeforeMenuRef.current;
    if (!textarea || !selection) return;
    if (selection.hadFocus) textarea.focus({ preventScroll: true });
    textarea.selectionStart = Math.max(0, Math.min(selection.start, textarea.value.length));
    textarea.selectionEnd = Math.max(0, Math.min(selection.end, textarea.value.length));
    textarea.selectionDirection = selection.direction;
    textarea.scrollTop = selection.scrollTop;
  }

  function handleMouseDown(event: MouseEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    if (event.button === 2) {
      saveSelectionForMenu(textarea);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setNoteMenu(null);
    event.stopPropagation();
  }

  function openContextMenu(event: MouseEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    event.stopPropagation();
    const textarea = event.currentTarget;
    if (!selectionBeforeMenuRef.current) saveSelectionForMenu(textarea);
    const lineNumber = getLineNumberFromY(textarea, event.clientY);
    const lineStart = getLineStartFromValue(draftRef.current, lineNumber);
    setNoteMenu({ x: event.clientX, y: event.clientY, lineStart });
    window.requestAnimationFrame(restoreSelectionFromMenu);
  }

  function insertSeparator(separator: string) {
    const value = draftRef.current;
    const lineStart = Math.max(
      0,
      Math.min(noteMenu?.lineStart ?? textareaRef.current?.selectionStart ?? value.length, value.length),
    );
    const result = insertNoteSeparatorAtLine(value, lineStart, separator);
    const nextValue = result.value;
    const nextCaret = result.caret;

    setNoteMenu(null);
    handleChange(nextValue);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.selectionStart = nextCaret;
      textarea.selectionEnd = nextCaret;
    });
  }

  function handleClick(event: MouseEvent<HTMLTextAreaElement>) {
    if (event.button !== 0) return;
    const textarea = event.currentTarget;
    const clickedLine = getLineNumberFromY(textarea, event.clientY);
    if (clickedLine > getTextLineCount()) {
      event.preventDefault();
      event.stopPropagation();
      jumpToLine(clickedLine, false);
    }
  }

  return {
    noteSettings,
    draftNote,
    saveStatus,
    showLineNumbers,
    lineNumbers,
    lineRowHeights,
    editorStyle,
    textareaRef,
    lineGutterRef,
    noteMenu,
    toggleLineNumbers,
    jumpToLine,
    handleChange,
    handleScroll,
    commitDraft,
    handleMouseDown,
    handleClick,
    openContextMenu,
    insertSeparator,
    closeMenu: () => setNoteMenu(null),
    setSeparatorLength: (length: number) => updateNoteSettings({ separatorLength: length }),
    dashSeparator: makeSeparator(noteSettings.dashSeparatorChar, noteSettings.separatorLength, '—'),
    starSeparator: makeSeparator(noteSettings.starSeparatorChar, noteSettings.separatorLength, '*'),
  };
}
