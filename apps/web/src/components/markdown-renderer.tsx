import React, { type ReactNode } from 'react';

/**
 * Pure React AST Markdown renderer.
 * 
 * Guarantees 100% XSS-safety by outputting native React elements without ever
 * touching dangerouslySetInnerHTML or evaluating arbitrary HTML.
 */

function sanitizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (/^(https?:|mailto:|\/|#)/i.test(trimmed)) {
    return trimmed;
  }
  return '#';
}

function parseInlineFormatting(text: string): ReactNode[] {
  const elements: ReactNode[] = [];
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      elements.push(
        <code className="markdown-inline-code" key={`code-${match.index}`}>
          {token.slice(1, -1)}
        </code>
      );
    } else if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      elements.push(
        <strong key={`bold-${match.index}`}>
          {parseInlineFormatting(token.slice(2, -2))}
        </strong>
      );
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      elements.push(
        <em key={`italic-${match.index}`}>
          {parseInlineFormatting(token.slice(1, -1))}
        </em>
      );
    } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const splitIdx = token.indexOf('](');
      const label = token.slice(1, splitIdx);
      const rawUrl = token.slice(splitIdx + 2, -1);
      elements.push(
        <a
          className="markdown-link"
          href={sanitizeUrl(rawUrl)}
          key={`link-${match.index}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {label}
        </a>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length ? elements : [text];
}

interface MarkdownRendererProps {
  content?: string | null;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  if (!content || !content.trim()) return null;

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]?.trim().startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      if (i < lines.length && lines[i]?.trim().startsWith('```')) {
        i++;
      }
      blocks.push(
        <pre className="markdown-code-block" key={`code-block-${i}`}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(<h1 className="markdown-h1" key={`h1-${i}`}>{parseInlineFormatting(trimmed.slice(2))}</h1>);
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(<h2 className="markdown-h2" key={`h2-${i}`}>{parseInlineFormatting(trimmed.slice(3))}</h2>);
      i++;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push(<h3 className="markdown-h3" key={`h3-${i}`}>{parseInlineFormatting(trimmed.slice(4))}</h3>);
      i++;
      continue;
    }
    if (trimmed.startsWith('#### ')) {
      blocks.push(<h4 className="markdown-h4" key={`h4-${i}`}>{parseInlineFormatting(trimmed.slice(5))}</h4>);
      i++;
      continue;
    }

    if (trimmed.startsWith('> ') || trimmed === '>') {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i]?.trim().startsWith('> ') || lines[i]?.trim() === '>')) {
        const qLine = lines[i]?.trim() ?? '';
        quoteLines.push(qLine.startsWith('> ') ? qLine.slice(2) : qLine.slice(1));
        i++;
      }
      blocks.push(
        <blockquote className="markdown-blockquote" key={`quote-${i}`}>
          {quoteLines.map((ql, qIdx) => (
            <p key={`quote-p-${qIdx}`}>{parseInlineFormatting(ql)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i]?.trim() ?? '')) {
        const itemLine = lines[i]?.trim() ?? '';
        items.push(itemLine.replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul className="markdown-ul" key={`ul-${i}`}>
          {items.map((item, idx) => (
            <li key={`ul-item-${idx}`}>{parseInlineFormatting(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]?.trim() ?? '')) {
        const itemLine = lines[i]?.trim() ?? '';
        items.push(itemLine.replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol className="markdown-ol" key={`ol-${i}`}>
          {items.map((item, idx) => (
            <li key={`ol-item-${idx}`}>{parseInlineFormatting(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1]?.trim() ?? '')) {
      const headerCells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i]?.trim().startsWith('|') && lines[i]?.trim().endsWith('|')) {
        const rowCells = (lines[i]?.trim() ?? '').slice(1, -1).split('|').map((c) => c.trim());
        bodyRows.push(rowCells);
        i++;
      }
      blocks.push(
        <div className="markdown-table-wrap" key={`table-${i}`}>
          <table className="markdown-table">
            <thead>
              <tr>
                {headerCells.map((cell, cIdx) => (
                  <th key={`th-${cIdx}`}>{parseInlineFormatting(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr key={`tr-${rIdx}`}>
                  {row.map((cell, cIdx) => (
                    <td key={`td-${rIdx}-${cIdx}`}>{parseInlineFormatting(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]?.trim() &&
      !lines[i]?.trim().startsWith('#') &&
      !lines[i]?.trim().startsWith('```') &&
      !lines[i]?.trim().startsWith('> ') &&
      !/^[-*+]\s+/.test(lines[i]?.trim() ?? '') &&
      !/^\d+\.\s+/.test(lines[i]?.trim() ?? '') &&
      !(lines[i]?.trim().startsWith('|') && lines[i]?.trim().endsWith('|'))
    ) {
      pLines.push(lines[i] ?? '');
      i++;
    }

    if (pLines.length) {
      blocks.push(
        <p className="markdown-paragraph" key={`p-${i}`}>
          {pLines.map((pLine, idx) => (
            <React.Fragment key={`pline-${idx}`}>
              {idx > 0 ? <br /> : null}
              {parseInlineFormatting(pLine)}
            </React.Fragment>
          ))}
        </p>
      );
    }
  }

  return <div className={`learning-markdown ${className}`}>{blocks}</div>;
}
