import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { formatShort } from '../../date/localDate';
import type { EntryKind, Goal, ID, VisionPlan } from '../../domain/models';
import { kindMeta } from './entryKinds';
import { filtersToParams, NO_FILTERS, parseFilters, type JournalFilters, type Snippet, type TextPart } from './search';

/** Journal filters live in the URL so they survive reloads, links and the reading page round trip. */
export function useJournalFilters() {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(search)), [search]);
  const update = useCallback(
    (patch: Partial<JournalFilters>) => {
      setParams((prev) => filtersToParams({ ...parseFilters(prev), ...patch }), { replace: true });
    },
    [setParams],
  );
  const clear = useCallback((keepView: boolean) => {
    setParams((prev) => filtersToParams({ ...NO_FILTERS, view: keepView ? parseFilters(prev).view : 'all' }), { replace: true });
  }, [setParams]);
  return { filters, search: filtersToParams(filters).toString(), update, clear };
}

export function Marked({ parts }: { parts: TextPart[] }) {
  return (
    <>
      {parts.map((p, i) => (p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}

export function SnippetText({ snippet }: { snippet: Snippet }) {
  return (
    <>
      {snippet.before && '… '}
      <Marked parts={snippet.parts} />
      {snippet.after && ' …'}
    </>
  );
}

export function KindChip({ kind }: { kind: EntryKind }) {
  const meta = kindMeta(kind);
  return (
    <span className={`entry__kind entry__kind--${meta.tone}`}>
      <Icon name={meta.icon} size={14} /> {meta.label}
    </span>
  );
}

/** Goals grouped under their plan for a select's optgroups. Archived goals are left out unless selected. */
export function goalGroups(goals: Goal[], plans: VisionPlan[], selected: ID | null): { label: string; goals: Goal[] }[] {
  const byPlan = new Map<ID | null, Goal[]>();
  for (const g of goals) {
    if (g.status === 'archived' && g.id !== selected) continue;
    const list = byPlan.get(g.planId) ?? [];
    list.push(g);
    byPlan.set(g.planId, list);
  }
  const groups = [...plans]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .filter((p) => byPlan.has(p.id))
    .map((p) => ({ label: `${p.title} (${formatShort(p.startDate)} to ${formatShort(p.endDate)})`, goals: byPlan.get(p.id)! }));
  const loose = [...byPlan.entries()].filter(([planId]) => planId === null || !plans.some((p) => p.id === planId)).flatMap(([, list]) => list);
  if (loose.length) groups.push({ label: 'Standalone goals', goals: loose });
  return groups;
}

/** Saves text as a file through a temporary link. */
export function downloadText(text: string, fileName: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readingHref(id: ID, search: string): string {
  return `/journal/${id}${search ? `?${search}` : ''}`;
}
