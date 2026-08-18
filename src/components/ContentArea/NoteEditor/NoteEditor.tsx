import { ListOrdered, StickyNote } from 'lucide-react';
import type { Directory } from '../../../types';
import { NoteContextMenu } from '../../ContextMenu/NoteContextMenu';
import { useNoteEditorController } from './useNoteEditorController';

interface NoteEditorProps {
  directory: Directory;
}

export function NoteEditor({ directory }: NoteEditorProps) {
  const controller = useNoteEditorController({ directory });
  const {
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
    closeMenu,
    setSeparatorLength,
    dashSeparator,
    starSeparator,
  } = controller;

  return (
    <div
      className={`notes-panel ${noteSettings.showTitle === false ? 'notes-title-hidden' : ''}`}
      style={editorStyle}
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest('.menu-surface')) closeMenu();
      }}
    >
      <div className="notes-title-row">
        {noteSettings.showTitle !== false ? (
          <div className="notes-title"><StickyNote size={18} />{directory.name || '便签'}</div>
        ) : <span />}
        <div className="notes-title-actions">
          <span className={`notes-save-status ${saveStatus}`}>{saveStatus === 'pending' ? '等待保存' : '已保存'}</span>
          <button
          type="button"
          className={`notes-line-toggle ${showLineNumbers ? 'active' : ''}`}
          title={showLineNumbers ? '隐藏每行行号' : '显示每行行号'}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={toggleLineNumbers}
        >
          <ListOrdered size={15} />
          <span>{showLineNumbers ? '行号开' : '行号关'}</span>
          </button>
        </div>
      </div>
      <div className={`notes-editor-wrap ${showLineNumbers ? 'with-line-numbers' : ''}`}>
        {showLineNumbers && (
          <div ref={lineGutterRef} className="notes-line-number-gutter" aria-label="便签行号，点击数字跳转到对应行">
            {lineNumbers.map((line) => {
              const rowHeight = lineRowHeights[line - 1];
              return (
                <button
                  key={line}
                  type="button"
                  className="notes-line-number"
                  style={rowHeight ? { height: `${rowHeight}px` } : undefined}
                  title={`跳转到第 ${line} 行`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    jumpToLine(line);
                  }}
                >
                  {line}
                </button>
              );
            })}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className="notes-textarea"
          placeholder="在这里写作、记录临时想法。便签不会出现在「全部」标签里。"
          value={draftNote}
          onChange={(event) => handleChange(event.target.value)}
          onScroll={handleScroll}
          onBlur={commitDraft}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
          onContextMenu={openContextMenu}
          wrap={noteSettings.wrap === false ? 'off' : 'soft'}
          spellCheck={false}
        />
      </div>
      {noteMenu && (
        <NoteContextMenu
          x={noteMenu.x}
          y={noteMenu.y}
          separatorLength={noteSettings.separatorLength}
          dashSeparator={dashSeparator}
          starSeparator={starSeparator}
          onSeparatorLengthChange={setSeparatorLength}
          onInsertSeparator={insertSeparator}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
