import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toasts';
import { addDays, compareKeys, formatShort, type DateKey, type WeekStart } from '../../date/localDate';
import type { PeriodDirection } from '../../domain/models';
import { periodKeyFor, periodRange, previousRange, type ActivitySource } from '../../domain/stats';
import { useDirection } from '../../storage/queries';
import { useRepo } from '../../storage/StorageProvider';
import { ReportCard, svgToPng } from './ReportCard';
import { reportKey } from './reportInbox';
import { buildReport, type ReportKind } from './reportModel';

interface Props {
  kind: ReportKind;
  anchor: DateKey;
  onAnchor: (anchor: DateKey) => void;
  source: ActivitySource;
  today: DateKey;
  minutesNow: number;
  weekStart: WeekStart;
  name: string;
  goalsBehind: string[];
  markSeen: (key: string) => void;
}

export function ReportView({ kind, anchor, onAnchor, source, today, minutesNow, weekStart, name, goalsBehind, markSeen }: Props) {
  const report = useMemo(() => buildReport(source, kind, anchor, today, weekStart, minutesNow), [source, kind, anchor, today, weekStart, minutesNow]);
  const { range } = report;
  const nextRange = periodRange(kind, addDays(range.end, 1), weekStart);
  const prevRange = previousRange(kind, range, weekStart);
  const direction = useDirection(kind, periodKeyFor(kind, range));
  const nextDirection = useDirection(kind, periodKeyFor(kind, nextRange));
  const cardRef = useRef<SVGSVGElement>(null);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const canGoNext = compareKeys(nextRange.start, today) <= 0;
  const label = kind === 'week' ? 'week' : 'month';

  useEffect(() => {
    if (report.ready) markSeen(reportKey(kind, range.start));
  }, [report.ready, kind, range.start, markSeen]);

  const exportPng = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const blob = await svgToPng(cardRef.current, 1);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pursuit-${kind}-report-${periodKeyFor(kind, range)}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
      toast({ message: 'Report saved as PNG', tone: 'success' });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const s = report.stats;
  const planned = source.tasks.filter((t) => t.scheduledDate && compareKeys(t.scheduledDate, range.start) >= 0 && compareKeys(t.scheduledDate, range.end) <= 0 && t.status !== 'canceled');
  const learned = source.entries.filter((e) => e.kind === 'learning' && e.plainText.trim() && compareKeys(e.dateKey, range.start) >= 0 && compareKeys(e.dateKey, range.end) <= 0);
  const did = source.entries.filter((e) => e.kind === 'doing' && e.plainText.trim() && compareKeys(e.dateKey, range.start) >= 0 && compareKeys(e.dateKey, range.end) <= 0);

  return (
    <div className="report">
      <div className="report__nav">
        <button type="button" className="icon-btn" aria-label={`Previous ${label}`} onClick={() => onAnchor(prevRange.start)}>
          <Icon name="chevronLeft" />
        </button>
        <span className="report__range" aria-live="polite">
          {kind === 'week' ? `${formatShort(range.start)} – ${formatShort(range.end)}` : new Date(`${range.start}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
        </span>
        <button type="button" className="icon-btn" aria-label={`Next ${label}`} disabled={!canGoNext} onClick={() => onAnchor(nextRange.start)}>
          <Icon name="chevronRight" />
        </button>
        <span className={`report__state ${report.ready ? 'is-ready' : ''}`}>
          {report.ready ? 'Ready' : `In progress · ready ${formatShort(range.end)}, 6 pm`}
        </span>
        <button type="button" className="btn btn--primary btn--sm report__export" onClick={() => void exportPng()} disabled={exporting}>
          <Icon name="sparkle" size={14} /> {exporting ? 'Saving…' : 'Save as PNG'}
        </button>
      </div>

      <div className="report__layout">
        <div className="report__card-wrap">
          <ReportCard ref={cardRef} report={report} name={name} weekStart={weekStart} goalsBehind={goalsBehind} nextFocus={nextDirection?.intention ?? ''} generatedOn={today} />
        </div>

        <div className="report__side">
          <ReviewForm key={`${kind}-${range.start}-${direction?.version ?? 0}`} kind={kind} range={range} nextRange={nextRange} direction={direction} nextDirection={nextDirection} />

          <section className="panel" aria-labelledby="evidence-heading">
            <h2 id="evidence-heading" className="panel__title">
              Evidence
            </h2>
            <p className="panel__sub">Pulled from what you recorded. Tap to open.</p>
            <dl className="evidence">
              <div>
                <dt>What I planned</dt>
                <dd>{direction?.intention ? `“${direction.intention}”` : <span className="muted">No focus was set for this {label}.</span>}</dd>
                <dd className="muted">
                  {planned.length} task{planned.length === 1 ? '' : 's'} scheduled
                </dd>
              </div>
              <div>
                <dt>What I completed</dt>
                <dd>
                  {s.completed} task{s.completed === 1 ? '' : 's'} ({s.completedLearning} learning, {s.completedDoing} doing)
                </dd>
                <EvidenceList items={source.tasks.filter((t) => t.status === 'completed' && t.completionLocalDate && compareKeys(t.completionLocalDate, range.start) >= 0 && compareKeys(t.completionLocalDate, range.end) <= 0).map((t) => ({ id: t.id, title: t.title, to: `/?date=${t.completionLocalDate}` }))} />
              </div>
              <div>
                <dt>What I learned</dt>
                <EvidenceList items={learned.map((e) => ({ id: e.id, title: e.title || e.plainText.slice(0, 80), to: `/journal/${e.id}` }))} empty="No learning entries." />
              </div>
              <div>
                <dt>What I did</dt>
                <EvidenceList items={did.map((e) => ({ id: e.id, title: e.title || e.plainText.slice(0, 80), to: `/journal/${e.id}` }))} empty="No doing entries." />
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function EvidenceList({ items, empty }: { items: { id: string; title: string; to: string }[]; empty?: string }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return empty ? <dd className="muted">{empty}</dd> : null;
  const shown = all ? items : items.slice(0, 5);
  return (
    <dd>
      <ul className="evidence__list">
        {shown.map((i) => (
          <li key={i.id}>
            <Link to={i.to}>{i.title.trim() || 'Untitled'}</Link>
          </li>
        ))}
      </ul>
      {items.length > 5 && (
        <button type="button" className="link-btn link-btn--quiet" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </dd>
  );
}

function ReviewForm({
  kind,
  range,
  nextRange,
  direction,
  nextDirection,
}: {
  kind: ReportKind;
  range: { start: DateKey; end: DateKey };
  nextRange: { start: DateKey; end: DateKey };
  direction: PeriodDirection | null | undefined;
  nextDirection: PeriodDirection | null | undefined;
}) {
  const repo = useRepo();
  const toast = useToast();
  const [review, setReview] = useState(direction?.review ?? '');
  const [blockers, setBlockers] = useState(direction?.blockers ?? '');
  const [nextFocus, setNextFocus] = useState(nextDirection?.intention ?? '');
  const [busy, setBusy] = useState(false);
  const label = kind === 'week' ? 'week' : 'month';
  const dirty = review !== (direction?.review ?? '') || blockers !== (direction?.blockers ?? '') || nextFocus.trim() !== (nextDirection?.intention ?? '');

  const save = async () => {
    setBusy(true);
    try {
      await repo.saveReview({ kind, periodKey: periodKeyFor(kind, range), startDate: range.start, endDate: range.end, review, blockers });
      if (nextFocus.trim() !== (nextDirection?.intention ?? '')) {
        await repo.saveDirection({ kind, periodKey: periodKeyFor(kind, nextRange), startDate: nextRange.start, endDate: nextRange.end, intention: nextFocus });
      }
      toast({ message: `${kind === 'week' ? 'Weekly' : 'Monthly'} review saved`, tone: 'success' });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="review-heading">
      <h2 id="review-heading" className="panel__title">
        Your review
      </h2>
      <p className="panel__sub">{direction?.reviewedAt ? 'Saved. Edit any time.' : `Two minutes, in your own words. This becomes part of your ${label}'s record.`}</p>
      <form
        className="review-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="field">
          <span className="field__label">What went well, and what did you learn about yourself?</span>
          <textarea className="input input--area" rows={3} value={review} maxLength={2000} onChange={(e) => setReview(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">What got in the way?</span>
          <textarea className="input input--area" rows={2} value={blockers} maxLength={1000} onChange={(e) => setBlockers(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">
            Next {label}'s focus <span className="field__hint">shows on Today</span>
          </span>
          <input className="input" value={nextFocus} maxLength={280} onChange={(e) => setNextFocus(e.target.value)} placeholder={kind === 'week' ? "What is next week's focus?" : "What will next month bring?"} />
        </label>
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save review'}
        </button>
      </form>
    </section>
  );
}
