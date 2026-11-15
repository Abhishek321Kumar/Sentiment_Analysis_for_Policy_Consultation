import React from 'react';

/**
 * Safely parse inline markdown tokens:
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - <u>underline</u>
 * - `code`
 */
function renderInlineMarkdown(text) {
  if (!text) return null;

  // Regex matching inline tokens
  const tokenRegex = /(\*\*.*?\*\*|__.*?__|\*[^\s*].*?[^\s*]\*|_[^\s_].*?[^\s_]_|<u>.*?<\/u>|`.*?`)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Bold
    if ((part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
        (part.startsWith('__') && part.endsWith('__') && part.length >= 4)) {
      return (
        <strong key={idx} style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic
    if ((part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length >= 2)) {
      return (
        <em key={idx} style={{ fontStyle: 'italic' }}>
          {part.slice(1, -1)}
        </em>
      );
    }

    // Underline
    if (part.startsWith('<u>') && part.endsWith('</u>') && part.length >= 7) {
      return <u key={idx}>{part.slice(3, -4)}</u>;
    }

    // Inline code
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          style={{
            background: 'rgba(0, 0, 0, 0.06)',
            padding: '0.15rem 0.4rem',
            borderRadius: '4px',
            fontSize: '0.85em',
            fontFamily: 'monospace',
            color: 'var(--brand-accent)',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return part;
  });
}

/**
 * Parses block-level Markdown into clean React elements:
 * - Headings (#, ##, ###)
 * - Bullet lists (-, *, •)
 * - Numbered lists (1., 2.)
 * - Blockquotes (>)
 * - Clauses (Clause X - ...)
 * - Paragraphs
 */
export default function MarkdownViewer({ content, style = {}, maxHeight, className = '' }) {
  if (!content || !content.trim()) {
    return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No description provided.</span>;
  }

  let processed = content;
  // Backward compatibility: If no markdown headings (#) are present, split known legacy sections & clauses
  if (!/^#{1,3}\s+/m.test(content)) {
    const KNOWN_SECTIONS = [
      'WHY WE ARE CONSULTING',
      'CURRENT SUPPORT POLICY (IN FORCE TODAY)',
      'CURRENT SUPPORT POLICY',
      'CURRENT POLICY (IN FORCE TODAY)',
      'CURRENT POLICY',
      'IMPROVEMENTS UNDER CONSIDERATION (NOT DECIDED)',
      'IMPROVEMENTS UNDER CONSIDERATION',
      'PROPOSED IMPROVEMENTS',
      'WHERE YOUR INPUT MATTERS',
      'HOW YOUR FEEDBACK WILL BE USED',
      'HOW FEEDBACK WILL BE USED',
      'BACKGROUND & CONTEXT',
      'BACKGROUND',
      'POLICY OBJECTIVES',
      'POLICY SCOPE',
    ];
    KNOWN_SECTIONS.forEach(sec => {
      const re = new RegExp(`(?<!\\n\\n|^)(${sec.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')})`, 'g');
      processed = processed.replace(re, '\n\n## $1\n');
    });
  }

  const rawLines = processed.split('\n');
  const blocks = [];
  let currentList = null; // { type: 'ul' | 'ol', items: [] }
  let currentQuote = null; // { lines: [] }
  let currentParagraph = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      blocks.push({
        type: 'paragraph',
        lines: [...currentParagraph],
      });
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (currentList) {
      blocks.push({ ...currentList });
      currentList = null;
    }
  };

  const flushQuote = () => {
    if (currentQuote) {
      blocks.push({ ...currentQuote });
      currentQuote = null;
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // Blank line
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    // Headings
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    const h3Match = trimmed.match(/^###\s+(.+)$/);

    if (h1Match || h2Match || h3Match) {
      flushParagraph();
      flushList();
      flushQuote();

      if (h1Match) {
        blocks.push({ type: 'h1', text: h1Match[1] });
      } else if (h2Match) {
        blocks.push({ type: 'h2', text: h2Match[1] });
      } else if (h3Match) {
        blocks.push({ type: 'h3', text: h3Match[1] });
      }
      continue;
    }

    // Blockquote
    const quoteMatch = trimmed.match(/^>\s*(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      if (!currentQuote) currentQuote = { type: 'blockquote', lines: [] };
      currentQuote.lines.push(quoteMatch[1]);
      continue;
    } else {
      flushQuote();
    }

    // Bullet List
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (currentList && currentList.type !== 'ul') flushList();
      if (!currentList) currentList = { type: 'ul', items: [] };
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // Numbered List
    const numMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numMatch) {
      flushParagraph();
      if (currentList && currentList.type !== 'ol') flushList();
      if (!currentList) currentList = { type: 'ol', items: [] };
      currentList.items.push(numMatch[1]);
      continue;
    }

    // Regular text (accumulate into paragraph)
    flushList();
    currentParagraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushQuote();

  const containerStyle = {
    fontSize: '0.88rem',
    lineHeight: '1.65',
    color: 'var(--text-secondary)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem',
    ...(maxHeight ? { maxHeight, overflowY: 'auto' } : {}),
    ...style,
  };

  return (
    <div className={`markdown-viewer ${className}`} style={containerStyle}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'h1':
            return (
              <h3
                key={idx}
                style={{
                  margin: '0.65rem 0 0.2rem 0',
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  fontFamily: 'Outfit, sans-serif',
                  color: 'var(--brand-accent)',
                  letterSpacing: '0.01em',
                  borderBottom: '1px solid rgba(234, 88, 12, 0.25)',
                  paddingBottom: '0.35rem',
                }}
              >
                {renderInlineMarkdown(block.text)}
              </h3>
            );

          case 'h2':
            return (
              <h4
                key={idx}
                style={{
                  margin: '0.55rem 0 0.15rem 0',
                  fontSize: '1.02rem',
                  fontWeight: 700,
                  fontFamily: 'Outfit, sans-serif',
                  color: 'var(--text-primary)',
                  letterSpacing: '0.01em',
                }}
              >
                {renderInlineMarkdown(block.text)}
              </h4>
            );

          case 'h3':
            return (
              <h5
                key={idx}
                style={{
                  margin: '0.45rem 0 0.1rem 0',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                {renderInlineMarkdown(block.text)}
              </h5>
            );

          case 'ul':
            return (
              <ul
                key={idx}
                style={{
                  margin: '0.2rem 0 0.4rem 0',
                  paddingLeft: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                {block.items.map((item, iIdx) => (
                  <li key={iIdx} style={{ lineHeight: '1.55' }}>
                    {renderInlineMarkdown(item)}
                  </li>
                ))}
              </ul>
            );

          case 'ol':
            return (
              <ol
                key={idx}
                style={{
                  margin: '0.2rem 0 0.4rem 0',
                  paddingLeft: '1.35rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                {block.items.map((item, iIdx) => (
                  <li key={iIdx} style={{ lineHeight: '1.55' }}>
                    {renderInlineMarkdown(item)}
                  </li>
                ))}
              </ol>
            );

          case 'blockquote':
            return (
              <div
                key={idx}
                style={{
                  margin: '0.4rem 0',
                  padding: '0.65rem 0.95rem',
                  background: 'rgba(234, 88, 12, 0.05)',
                  borderLeft: '3px solid var(--brand-accent)',
                  borderRadius: '0 6px 6px 0',
                  fontStyle: 'italic',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.3rem',
                }}
              >
                {block.lines.map((l, lIdx) => (
                  <div key={lIdx}>{renderInlineMarkdown(l)}</div>
                ))}
              </div>
            );

          case 'paragraph':
          default:
            return (
              <p
                key={idx}
                style={{
                  margin: '0 0 0.35rem 0',
                  fontSize: '0.88rem',
                  lineHeight: '1.6',
                  color: 'var(--text-secondary)',
                }}
              >
                {block.lines.map((line, lIdx) => (
                  <React.Fragment key={lIdx}>
                    {renderInlineMarkdown(line)}
                    {lIdx < block.lines.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
