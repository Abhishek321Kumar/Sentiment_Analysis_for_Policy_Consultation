import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold, Italic, Underline, List, ListOrdered, Quote,
  Edit3, Eye, RotateCcw, RotateCw
} from 'lucide-react';
import MarkdownViewer from './MarkdownViewer';

export default function MarkdownEditor({
  value = '',
  onChange,
  placeholder = 'Provide background context, rationale, and policy background for invited stakeholders...',
  minHeight = '150px',
  maxHeight = '300px',
  required = false,
  label = '',
  helpText = '',
}) {
  const [activeTab, setActiveTab] = useState('write'); // 'write' | 'preview'
  const textareaRef = useRef(null);

  // Undo / Redo history state
  const historyRef = useRef([{ text: value, start: 0, end: 0 }]);
  const historyIndexRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Keep history updated
  const pushHistory = useCallback((nextText, start, end) => {
    const history = historyRef.current.slice(0, historyIndexRef.current + 1);
    history.push({ text: nextText, start, end });
    // Cap history length at 50
    if (history.length > 50) history.shift();
    historyRef.current = history;
    historyIndexRef.current = history.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    const textarea = textareaRef.current;
    const savedWindowY = window.scrollY;
    const savedScrollTop = textarea ? textarea.scrollTop : 0;

    historyIndexRef.current -= 1;
    const item = historyRef.current[historyIndexRef.current];
    onChange(item.text);

    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);

    setTimeout(() => {
      if (textarea) {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(item.start, item.end);
        textarea.scrollTop = savedScrollTop;
      }
      window.scrollTo(0, savedWindowY);
    }, 0);
  }, [onChange]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    const textarea = textareaRef.current;
    const savedWindowY = window.scrollY;
    const savedScrollTop = textarea ? textarea.scrollTop : 0;

    historyIndexRef.current += 1;
    const item = historyRef.current[historyIndexRef.current];
    onChange(item.text);

    setCanUndo(true);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);

    setTimeout(() => {
      if (textarea) {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(item.start, item.end);
        textarea.scrollTop = savedScrollTop;
      }
      window.scrollTo(0, savedWindowY);
    }, 0);
  }, [onChange]);

  // Synchronize history when value changes externally (e.g. on load)
  useEffect(() => {
    if (historyRef.current.length === 1 && historyRef.current[0].text === '' && value) {
      historyRef.current = [{ text: value, start: 0, end: 0 }];
      historyIndexRef.current = 0;
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [value]);

  // Smart Toggle for Bold, Italic, Underline
  const toggleInlineFormat = useCallback((formatType) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const savedScrollTop = textarea.scrollTop;
    const savedScrollLeft = textarea.scrollLeft;
    const savedWindowY = window.scrollY;

    let start = textarea.selectionStart;
    let end = textarea.selectionEnd;
    let text = value;

    // If no text selected, try to expand to current word under cursor
    if (start === end) {
      const isWordChar = (ch) => ch && !/\s/.test(ch);
      let wordStart = start;
      let wordEnd = end;
      while (wordStart > 0 && isWordChar(text[wordStart - 1])) {
        wordStart--;
      }
      while (wordEnd < text.length && isWordChar(text[wordEnd])) {
        wordEnd++;
      }
      if (wordEnd > wordStart) {
        start = wordStart;
        end = wordEnd;
      }
    }

    const selected = text.substring(start, end);
    let nextValue = text;
    let nextStart = start;
    let nextEnd = end;

    if (formatType === 'bold') {
      const prefix = '**';
      const suffix = '**';

      // Check 1: Selection itself starts & ends with **
      if (selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length >= 4) {
        // Toggle OFF (unwrap)
        const inner = selected.slice(2, -2);
        nextValue = text.substring(0, start) + inner + text.substring(end);
        nextStart = start;
        nextEnd = start + inner.length;
      }
      // Check 2: Immediately surrounded by ** on outside
      else if (start >= 2 && text.substring(start - 2, start) === prefix && text.substring(end, end + 2) === suffix) {
        // Toggle OFF (unwrap outside)
        nextValue = text.substring(0, start - 2) + selected + text.substring(end + 2);
        nextStart = start - 2;
        nextEnd = nextStart + selected.length;
      }
      // Toggle ON
      else {
        const replacement = selected ? `**${selected}**` : `**bold text**`;
        nextValue = text.substring(0, start) + replacement + text.substring(end);
        nextStart = start + 2;
        nextEnd = selected ? end + 2 : start + 2 + 'bold text'.length;
      }
    } else if (formatType === 'italic') {
      // Check 1: Selection itself starts & ends with single * (not **)
      const isSingleItalic = selected.startsWith('*') && !selected.startsWith('**') && selected.endsWith('*') && !selected.endsWith('**') && selected.length >= 2;
      // Check 2: Outer characters are single * (not **)
      const isOuterSingleItalic = start >= 1 && text[start - 1] === '*' && text[start - 2] !== '*' && text[end] === '*' && text[end + 1] !== '*';

      if (isSingleItalic) {
        // Toggle OFF
        const inner = selected.slice(1, -1);
        nextValue = text.substring(0, start) + inner + text.substring(end);
        nextStart = start;
        nextEnd = start + inner.length;
      } else if (isOuterSingleItalic) {
        // Toggle OFF (unwrap outside)
        nextValue = text.substring(0, start - 1) + selected + text.substring(end + 1);
        nextStart = start - 1;
        nextEnd = nextStart + selected.length;
      } else {
        // Toggle ON (wrap in single *)
        const replacement = selected ? `*${selected}*` : `*italic text*`;
        nextValue = text.substring(0, start) + replacement + text.substring(end);
        nextStart = start + 1;
        nextEnd = selected ? end + 1 : start + 1 + 'italic text'.length;
      }
    } else if (formatType === 'underline') {
      const openTag = '<u>';
      const closeTag = '</u>';

      if (selected.startsWith(openTag) && selected.endsWith(closeTag) && selected.length >= 7) {
        // Toggle OFF
        const inner = selected.slice(3, -4);
        nextValue = text.substring(0, start) + inner + text.substring(end);
        nextStart = start;
        nextEnd = start + inner.length;
      } else if (start >= 3 && text.substring(start - 3, start) === openTag && text.substring(end, end + 4) === closeTag) {
        // Toggle OFF (unwrap outside)
        nextValue = text.substring(0, start - 3) + selected + text.substring(end + 4);
        nextStart = start - 3;
        nextEnd = nextStart + selected.length;
      } else {
        // Toggle ON
        const replacement = selected ? `<u>${selected}</u>` : `<u>underlined text</u>`;
        nextValue = text.substring(0, start) + replacement + text.substring(end);
        nextStart = start + 3;
        nextEnd = selected ? end + 3 : start + 3 + 'underlined text'.length;
      }
    }

    pushHistory(nextValue, nextStart, nextEnd);
    onChange(nextValue);

    // Keep textarea focus, cursor, and scroll position perfectly intact
    setTimeout(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(nextStart, nextEnd);
      textarea.scrollTop = savedScrollTop;
      textarea.scrollLeft = savedScrollLeft;
      window.scrollTo(0, savedWindowY);
    }, 0);
  }, [value, onChange, pushHistory]);

  // Smart Toggle for Line Formats (H1, H2, H3, Bullet, Numbered, Quote)
  const toggleLinePrefix = useCallback((prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const savedScrollTop = textarea.scrollTop;
    const savedScrollLeft = textarea.scrollLeft;
    const savedWindowY = window.scrollY;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = value;

    // Find the start of the first selected line and end of the last selected line
    const blockStart = text.lastIndexOf('\n', start - 1) + 1;
    let blockEnd = text.indexOf('\n', end);
    if (blockEnd === -1) blockEnd = text.length;

    const targetBlock = text.substring(blockStart, blockEnd);
    const lines = targetBlock.split('\n');

    let processedLines = [];

    // Is it a heading prefix? ('# ', '## ', '### ')
    if (prefix === '# ' || prefix === '## ' || prefix === '### ') {
      // Check if all lines already start with this exact heading prefix
      const allHaveExactPrefix = lines.every(l => l.startsWith(prefix));

      if (allHaveExactPrefix) {
        // Toggle OFF: remove the heading prefix
        processedLines = lines.map(l => l.substring(prefix.length));
      } else {
        // Toggle ON: strip any existing heading/list/quote and apply this heading
        processedLines = lines.map(l => {
          const stripped = l.replace(/^#{1,3}\s+/, '').replace(/^([-*•]|>|\d+[.)])\s+/, '');
          return `${prefix}${stripped}`;
        });
      }
    }
    // Is it a bullet list? ('- ')
    else if (prefix === '- ') {
      const allHaveBullet = lines.every(l => l.startsWith('- ') || l.startsWith('* ') || l.startsWith('• '));
      if (allHaveBullet) {
        // Toggle OFF: remove bullet
        processedLines = lines.map(l => l.replace(/^[-*•]\s+/, ''));
      } else {
        // Toggle ON: replace numbered or quote with bullet
        processedLines = lines.map(l => {
          const stripped = l.replace(/^(\d+[.)]|>|#{1,3})\s+/, '');
          return `- ${stripped.replace(/^[-*•]\s+/, '')}`;
        });
      }
    }
    // Is it a numbered list? ('1. ')
    else if (prefix === '1. ') {
      const allHaveNumbers = lines.every(l => /^\d+[.)]\s+/.test(l));
      if (allHaveNumbers) {
        // Toggle OFF: remove numbering
        processedLines = lines.map(l => l.replace(/^\d+[.)]\s+/, ''));
      } else {
        // Toggle ON: add sequential numbers
        processedLines = lines.map((l, idx) => {
          const stripped = l.replace(/^([-*•]|>|#{1,3}|\d+[.)])\s+/, '');
          return `${idx + 1}. ${stripped}`;
        });
      }
    }
    // Is it a blockquote? ('> ')
    else if (prefix === '> ') {
      const allHaveQuote = lines.every(l => l.startsWith('> '));
      if (allHaveQuote) {
        // Toggle OFF: remove quote
        processedLines = lines.map(l => l.replace(/^>\s+/, ''));
      } else {
        // Toggle ON
        processedLines = lines.map(l => `> ${l.replace(/^>\s*/, '')}`);
      }
    }

    const newBlock = processedLines.join('\n');
    const nextValue = text.substring(0, blockStart) + newBlock + text.substring(blockEnd);
    const nextStart = blockStart;
    const nextEnd = blockStart + newBlock.length;

    pushHistory(nextValue, nextStart, nextEnd);
    onChange(nextValue);

    setTimeout(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(nextStart, nextEnd);
      textarea.scrollTop = savedScrollTop;
      textarea.scrollLeft = savedScrollLeft;
      window.scrollTo(0, savedWindowY);
    }, 0);
  }, [value, onChange, pushHistory]);

  // Handle typing & keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+B, Ctrl+I, Ctrl+U)
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey)) {
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (key === 'b') {
        e.preventDefault();
        toggleInlineFormat('bold');
      } else if (key === 'i') {
        e.preventDefault();
        toggleInlineFormat('italic');
      } else if (key === 'u') {
        e.preventDefault();
        toggleInlineFormat('underline');
      }
    }
  };

  const handleTextareaChange = (e) => {
    const nextVal = e.target.value;
    onChange(nextVal);
    // Push typed changes to history
    pushHistory(nextVal, e.target.selectionStart, e.target.selectionEnd);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <label className="dash-label" style={{ margin: 0 }}>
            {label} {required && <span style={{ color: 'var(--sentiment-negative)' }}>*</span>}
          </label>
          {helpText && (
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {helpText}
            </span>
          )}
        </div>
      )}

      {/* Formatting, History & View Toggle Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.4rem',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderBottom: 'none',
          borderRadius: '8px 8px 0 0',
          padding: '0.4rem 0.6rem',
        }}
      >
        {/* Formatting Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexWrap: 'wrap' }}>
          {/* Headings */}
          <button
            type="button"
            title="Toggle Heading 1 (#)"
            disabled={activeTab === 'preview'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => toggleLinePrefix('# ')}
            style={toolbarBtnStyle}
          >
            <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>H1</span>
          </button>
          <button
            type="button"
            title="Toggle Heading 2 (##)"
            disabled={activeTab === 'preview'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => toggleLinePrefix('## ')}
            style={toolbarBtnStyle}
          >
            <span style={{ fontWeight: 700, fontSize: '0.78rem' }}>H2</span>
          </button>
          <button
            type="button"
            title="Toggle Heading 3 (###)"
            disabled={activeTab === 'preview'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => toggleLinePrefix('### ')}
            style={toolbarBtnStyle}
          >
            <span style={{ fontWeight: 600, fontSize: '0.75rem' }}>H3</span>
          </button>

          <div style={toolbarDividerStyle} />

          {/* Text Styling */}
          <button
            type="button"
            title="Toggle Bold (**text**)"
            disabled={activeTab === 'preview'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => toggleInlineFormat('bold')}
            style={toolbarBtnStyle}
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            title="Toggle Italic (*text*)"
            disabled={activeTab === 'preview'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => toggleInlineFormat('italic')}
            style={toolbarBtnStyle}
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            title="Toggle Underline (<u>text</u>)"
            disabled={activeTab === 'preview'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => toggleInlineFormat('underline')}
            style={toolbarBtnStyle}
          >
            <Underline size={14} />
          </button>

          <div style={toolbarDividerStyle} />

          {/* Lists & Quotes */}
          <button
            type="button"
            title="Toggle Bullet List (- item)"
            disabled={activeTab === 'preview'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => toggleLinePrefix('- ')}
            style={toolbarBtnStyle}
          >
            <List size={14} />
          </button>
          <button
            type="button"
            title="Toggle Numbered List (1. item)"
            disabled={activeTab === 'preview'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => toggleLinePrefix('1. ')}
            style={toolbarBtnStyle}
          >
            <ListOrdered size={14} />
          </button>
          <button
            type="button"
            title="Toggle Blockquote (> quote)"
            disabled={activeTab === 'preview'}
            onMouseDown={e => e.preventDefault()}
            onClick={() => toggleLinePrefix('> ')}
            style={toolbarBtnStyle}
          >
            <Quote size={13} />
          </button>

          <div style={toolbarDividerStyle} />

          {/* Undo and Redo buttons */}
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            disabled={activeTab === 'preview' || !canUndo}
            onMouseDown={e => e.preventDefault()}
            onClick={handleUndo}
            style={{
              ...toolbarBtnStyle,
              opacity: canUndo && activeTab === 'write' ? 1 : 0.4,
              cursor: canUndo && activeTab === 'write' ? 'pointer' : 'not-allowed',
            }}
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            title="Redo (Ctrl+Y)"
            disabled={activeTab === 'preview' || !canRedo}
            onMouseDown={e => e.preventDefault()}
            onClick={handleRedo}
            style={{
              ...toolbarBtnStyle,
              opacity: canRedo && activeTab === 'write' ? 1 : 0.4,
              cursor: canRedo && activeTab === 'write' ? 'pointer' : 'not-allowed',
            }}
          >
            <RotateCw size={13} />
          </button>
        </div>

        {/* Tab Switcher: Write vs Preview */}
        <div style={{ display: 'inline-flex', background: 'var(--bg-card)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => setActiveTab('write')}
            style={{
              padding: '0.25rem 0.65rem',
              fontSize: '0.76rem',
              fontWeight: 600,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: activeTab === 'write' ? 'var(--brand-accent)' : 'transparent',
              color: activeTab === 'write' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            <Edit3 size={12} />
            <span>Write</span>
          </button>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => setActiveTab('preview')}
            style={{
              padding: '0.25rem 0.65rem',
              fontSize: '0.76rem',
              fontWeight: 600,
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: activeTab === 'preview' ? 'var(--brand-accent)' : 'transparent',
              color: activeTab === 'preview' ? '#ffffff' : 'var(--text-secondary)',
              transition: 'all 0.15s ease',
            }}
          >
            <Eye size={12} />
            <span>Preview</span>
          </button>
        </div>
      </div>

      {/* Editor Body */}
      {activeTab === 'write' ? (
        <textarea
          ref={textareaRef}
          required={required}
          className="dash-textarea"
          placeholder={placeholder}
          value={value}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            maxWidth: '100%',
            minHeight,
            maxHeight,
            height: minHeight,
            resize: 'vertical',
            overflowY: 'auto',
            borderRadius: '0 0 8px 8px',
            borderTop: 'none',
            boxSizing: 'border-box',
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.86rem',
            lineHeight: '1.6',
            padding: '0.75rem 0.9rem',
          }}
        />
      ) : (
        <div
          style={{
            minHeight,
            maxHeight,
            overflowY: 'auto',
            background: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-color)',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            padding: '0.9rem 1.1rem',
            boxSizing: 'border-box',
          }}
        >
          <MarkdownViewer content={value} />
        </div>
      )}

      {/* Editor Footer Status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
          marginTop: '0.35rem',
          padding: '0 0.15rem',
        }}
      >
        <span>{value.length} characters</span>
      </div>
    </div>
  );
}

const toolbarBtnStyle = {
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: '5px',
  padding: '0.25rem 0.45rem',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '26px',
  height: '26px',
  transition: 'all 0.15s ease',
};

const toolbarDividerStyle = {
  width: '1px',
  height: '16px',
  background: 'var(--border-color)',
  margin: '0 0.2rem',
};
