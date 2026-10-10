import type { JSONContent } from '@tiptap/core';
import type { ReactNode } from 'react';

const SAFE_URL = /^(https?:|mailto:)/i;

export function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  return SAFE_URL.test(trimmed) ? trimmed : null;
}

function renderText(node: JSONContent, key: number): ReactNode {
  let out: ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'code') out = <code>{out}</code>;
    else if (mark.type === 'link') {
      const href = safeHref(mark.attrs?.href);
      out = href ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">
          {out}
        </a>
      ) : (
        out
      );
    }
  }
  return <span key={key}>{out}</span>;
}

function renderNode(node: JSONContent, key: number): ReactNode {
  const kids = (node.content ?? []).map((c, i) => renderNode(c, i));
  switch (node.type) {
    case 'doc':
      return <>{kids}</>;
    case 'paragraph':
      return <p key={key}>{kids.length ? kids : <br />}</p>;
    case 'heading':
      return node.attrs?.level === 3 ? <h4 key={key}>{kids}</h4> : <h3 key={key}>{kids}</h3>;
    case 'bulletList':
      return <ul key={key}>{kids}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={typeof node.attrs?.start === 'number' ? node.attrs.start : undefined}>
          {kids}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{kids}</li>;
    case 'blockquote':
      return <blockquote key={key}>{kids}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{kids}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} />;
    case 'hardBreak':
      return <br key={key} />;
    case 'text':
      return renderText(node, key);
    default:
      // Unknown nodes render their text only; nothing is ever injected as HTML.
      return <span key={key}>{kids}</span>;
  }
}

/** Read-only rendering of a stored editor document, built from React elements only. */
export function DocView({ doc, className }: { doc: JSONContent; className?: string }) {
  return <div className={`prose ${className ?? ''}`}>{renderNode(doc, 0)}</div>;
}
