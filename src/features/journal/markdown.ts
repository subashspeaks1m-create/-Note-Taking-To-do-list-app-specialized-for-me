/**
 * Markdown export. Converts stored editor documents (TipTap JSON) to
 * CommonMark and assembles a dated journal file. Pure: no DOM, no database.
 */
import type { JSONContent } from '@tiptap/core';
import { formatLong, formatMedium, formatTimeInZone, type DateKey } from '../../date/localDate';
import type { ID, JournalEntry } from '../../domain/models';
import { safeHref } from './DocView';
import { kindMeta } from './entryKinds';

/* ---------- Inline text ---------- */

/** Escapes characters that would otherwise turn plain words into Markdown. */
export function escapeInline(text: string): string {
  return text
    .replace(/[\\`*[\]<]/g, '\\$&')
    .replace(/~~/g, '\\~\\~')
    // Underscores only matter at word edges; snake_case stays readable.
    .replace(/(^|[^\p{L}\p{N}])_|_(?=$|[^\p{L}\p{N}])/gu, (m) => m.replace('_', '\\_'));
}

/** Escapes a line start that Markdown would read as a heading, list, quote or rule. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)(#{1,6}(?:\s|$)|[-+](?=\s|-|$)|>)/, (_, ws: string, mark: string) => `${ws}\\${mark}`)
    .replace(/^(\s*\d+)([.)])(?=\s)/, '$1\\$2');
}

type Mark = { type: string; href?: string };

// Outermost first. Code is innermost because its content is literal.
const MARK_ORDER = ['link', 'bold', 'italic', 'strike', 'code'];

function marksOf(node: JSONContent): Mark[] {
  const out: Mark[] = [];
  for (const m of node.marks ?? []) {
    if (m.type === 'link') {
      const href = safeHref(m.attrs?.href);
      if (href) out.push({ type: 'link', href });
    } else if (MARK_ORDER.includes(m.type)) out.push({ type: m.type });
  }
  return out.sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
}

const sameMark = (a: Mark, b: Mark) => a.type === b.type && a.href === b.href;

function openMark(m: Mark): string {
  return m.type === 'link' ? '[' : m.type === 'bold' ? '**' : m.type === 'italic' ? '*' : m.type === 'strike' ? '~~' : '';
}

const URL_ESCAPES: Record<string, string> = { '(': '%28', ')': '%29' };

function closeMark(m: Mark): string {
  return m.type === 'link' ? `](${m.href!.replace(/[()\s]/g, (c) => URL_ESCAPES[c] ?? '%20')})` : openMark(m);
}

function codeSpan(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/**
 * Inline content with properly nested emphasis. Marks shared with the next
 * text node stay open, and whitespace is moved outside delimiters, because
 * `** bold**` is not bold in Markdown.
 */
function renderInline(nodes: JSONContent[]): string {
  let out = '';
  const stack: Mark[] = [];
  let pendingSpace = '';

  const closeTo = (keep: number) => {
    while (stack.length > keep) out += closeMark(stack.pop()!);
  };

  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      out += '\\\n';
      pendingSpace = '';
      continue;
    }
    if (node.type !== 'text') {
      // Unknown inline nodes contribute their text only.
      const inner = renderInline(node.content ?? []);
      if (inner) {
        closeTo(0);
        out += pendingSpace + inner;
        pendingSpace = '';
      }
      continue;
    }
    const raw = node.text ?? '';
    const lead = /^\s*/.exec(raw)![0];
    const core = raw.trim();
    if (!core) {
      pendingSpace += raw;
      continue;
    }
    const trail = raw.slice(lead.length + core.length);
    const marks = marksOf(node);
    let keep = 0;
    while (keep < stack.length && keep < marks.length && sameMark(stack[keep]!, marks[keep]!)) keep++;
    closeTo(keep);
    out += pendingSpace + lead;
    for (const m of marks.slice(keep)) {
      out += openMark(m);
      stack.push(m);
    }
    out += marks.some((m) => m.type === 'code') ? codeSpan(core) : escapeInline(core);
    pendingSpace = trail;
  }
  closeTo(0);
  return out.replace(/^[ \t]+/, '');
}

/* ---------- Blocks ---------- */

export interface MarkdownOptions {
  /** Added to every heading level so entry content nests under export headings. */
  headingOffset?: number;
}

const indent = (text: string, by: string) =>
  text
    .split('\n')
    .map((line) => (line ? by + line : line))
    .join('\n');

function renderList(node: JSONContent, opts: Required<MarkdownOptions>): string {
  const ordered = node.type === 'orderedList';
  const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
  return (node.content ?? [])
    .map((item, i) => {
      const marker = ordered ? `${start + i}. ` : '- ';
      const body = renderBlocks(item.content ?? [], opts, true);
      const [first = '', ...rest] = body.split('\n');
      const pad = ' '.repeat(marker.length);
      return marker + first + (rest.length ? `\n${indent(rest.join('\n'), pad)}` : '');
    })
    .join('\n');
}

function renderBlock(node: JSONContent, opts: Required<MarkdownOptions>): string {
  switch (node.type) {
    case 'paragraph':
      return escapeLineStart(renderInline(node.content ?? []));
    case 'heading': {
      const level = Math.min(6, Math.max(1, (Number(node.attrs?.level) || 1) + opts.headingOffset));
      return `${'#'.repeat(level)} ${renderInline(node.content ?? [])}`.trimEnd();
    }
    case 'bulletList':
    case 'orderedList':
      return renderList(node, opts);
    case 'blockquote':
      return renderBlocks(node.content ?? [], opts)
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'codeBlock': {
      const text = (node.content ?? []).map((c) => c.text ?? '').join('');
      const runs = text.match(/`{3,}/g) ?? [];
      const fence = '`'.repeat(Math.max(3, ...runs.map((r) => r.length + 1)));
      const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      return `${fence}${lang}\n${text.replace(/\n$/, '')}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case 'listItem':
      return renderBlocks(node.content ?? [], opts, true);
    default:
      // Unknown blocks: keep any nested blocks, otherwise their inline text.
      if (node.content?.some((c) => c.type !== 'text' && c.type !== 'hardBreak')) return renderBlocks(node.content, opts);
      return escapeLineStart(renderInline(node.content ?? []));
  }
}

function renderBlocks(nodes: JSONContent[], opts: Required<MarkdownOptions>, tight = false): string {
  const parts = nodes.map((n) => renderBlock(n, opts)).filter((s) => s.trim() !== '');
  if (!tight) return parts.join('\n\n');
  // Inside a list item, a nested list follows its paragraph directly.
  return parts.reduce((acc, part, i) => (i === 0 ? part : acc + (/^(\d+\. |- )/.test(part) ? '\n' : '\n\n') + part), '');
}

/** Converts a TipTap document to Markdown. Returns '' for an empty or unreadable document. */
export function docToMarkdown(doc: JSONContent | null | undefined, options: MarkdownOptions = {}): string {
  if (!doc || typeof doc !== 'object') return '';
  const opts = { headingOffset: options.headingOffset ?? 0 };
  const blocks = doc.type === 'doc' ? (doc.content ?? []) : [doc];
  return renderBlocks(blocks, opts).trim();
}

/** Plain text kept as paragraphs, escaped so it reads back as the same text. */
export function plainTextToMarkdown(text: string): string {
  return text
    .trim()
    .split(/\n{2,}|\n/)
    .map((p) => escapeLineStart(escapeInline(p.trim())))
    .filter(Boolean)
    .join('\n\n');
}

/** The entry body: the converted document, or its plain text when the document gives nothing. */
export function entryBodyMarkdown(entry: Pick<JournalEntry, 'doc' | 'plainText'>, options: MarkdownOptions = {}): string {
  let md = '';
  try {
    md = docToMarkdown(entry.doc, options);
  } catch {
    md = '';
  }
  return md || plainTextToMarkdown(entry.plainText);
}

/* ---------- Journal file ---------- */

export interface ExportContext {
  /** Profile zone, used when an entry has no recorded zone. */
  timeZone: string;
  exportedOn: DateKey;
  /** One line describing the view and filters, e.g. "Learned · Sep 1 to Oct 10". */
  scope?: string;
  taskTitle?: (id: ID) => string | undefined;
  goalTitle?: (id: ID) => string | undefined;
}

export function exportFileName(exportedOn: DateKey): string {
  return `pursuit-journal-${exportedOn}.md`;
}

/** A Markdown journal of the given entries in the order given, with one heading per day. */
export function entriesToMarkdown(entries: JournalEntry[], ctx: ExportContext): string {
  const lines: string[] = ['# Pursuit of Greatness journal', ''];
  const count = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  lines.push(`Exported ${formatMedium(ctx.exportedOn)} · ${count}${ctx.scope ? ` · ${escapeInline(ctx.scope)}` : ''}`, '');

  let day: DateKey | null = null;
  for (const e of entries) {
    if (e.dateKey !== day) {
      day = e.dateKey;
      lines.push(`## ${formatLong(day)}`, '');
    }
    const meta = kindMeta(e.kind);
    lines.push(`### ${escapeInline(e.title.trim() || meta.label)}`, '');
    const facts = [meta.label, formatTimeInZone(new Date(e.happenedAt), e.recordedTimezone || ctx.timeZone)];
    if (e.documentedAt) facts.push('Documented');
    if (e.pinned) facts.push('Pinned');
    lines.push(`*${facts.join(' · ')}*`, '');

    const body = entryBodyMarkdown(e, { headingOffset: 2 });
    if (body) lines.push(body, '');

    const tasks = e.taskIds.map((id) => ctx.taskTitle?.(id)).filter((t): t is string => !!t);
    const goals = e.goalIds.map((id) => ctx.goalTitle?.(id)).filter((t): t is string => !!t);
    if (tasks.length) lines.push(`Linked tasks: ${tasks.map(escapeInline).join(', ')}  `);
    if (goals.length) lines.push(`Goals: ${goals.map(escapeInline).join(', ')}  `);
    if (e.tags.length) lines.push(`Tags: ${e.tags.map((t) => `#${escapeInline(t)}`).join(' ')}  `);
    if (tasks.length || goals.length || e.tags.length) {
      lines[lines.length - 1] = lines[lines.length - 1]!.trimEnd();
      lines.push('');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
