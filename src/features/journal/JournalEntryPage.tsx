import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/Page';
import { useToast } from '../../components/Toasts';
import { dateKeyInZone, formatLong, formatMedium, formatTimeInZone } from '../../date/localDate';
import type { JournalEntry } from '../../domain/models';
import { useProfile, useRepo } from '../../storage/StorageProvider';
import { DocView } from './DocView';
import { kindMeta } from './entryKinds';
import { useJournalData } from './journalQueries';
import { KindChip, readingHref, useJournalFilters } from './journalParts';
import { entryGoalIds, entryHeading, filterEntries } from './search';

/** One entry on its own page, with the feed's filters kept for Back, Newer and Older. */
export function JournalEntryPage() {
  const { entryId } = useParams();
  const data = useJournalData();
  const profile = useProfile();
  const repo = useRepo();
  const toast = useToast();
  const { filters, search } = useJournalFilters();
  const [busy, setBusy] = useState(false);
  const feed = useMemo(() => (data ? filterEntries(data.entries, filters, data.tasks) : []), [data, filters]);
  const back = `/journal${search ? `?${search}` : ''}`;

  if (!data) {
    return (
      <div className="page page--journal-read">
        <div className="skeleton-list" aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
    );
  }
  const entry = data.entries.find((e) => e.id === entryId);
  if (!entry) {
    return (
      <div className="page page--journal-read">
        <EmptyState icon="journal" title="This entry isn't here." body="It may have been deleted, or the link is old.">
          <Link to={back} className="btn btn--primary">
            Back to Journal
          </Link>
        </EmptyState>
      </div>
    );
  }

  const meta = kindMeta(entry.kind);
  const at = feed.findIndex((e) => e.id === entry.id);
  const newer = at > 0 ? feed[at - 1] : undefined;
  const older = at !== -1 ? feed[at + 1] : undefined;
  const zone = entry.recordedTimezone || profile.timeZone;
  const goals = [...entryGoalIds(entry, data.tasks)].map((id) => data.goals.find((g) => g.id === id)).filter((g) => !!g);
  const empty = !entry.plainText.trim();

  const togglePin = async () => {
    setBusy(true);
    try {
      await repo.updateEntryMeta(entry.id, { pinned: !entry.pinned });
      toast({
        message: entry.pinned ? 'Unpinned' : 'Pinned to the top of your journal',
        tone: 'success',
        action: { label: 'Undo', run: () => repo.updateEntryMeta(entry.id, { pinned: entry.pinned }).then(() => undefined) },
      });
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page--journal-read">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to={back}>Journal</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/?date=${entry.dateKey}`}>{formatMedium(entry.dateKey)}</Link>
      </nav>

      <article className={`journal-read journal-read--${entry.kind}`} aria-labelledby="entry-title">
        <header className="journal-read__head">
          <div className="entry__meta">
            <KindChip kind={entry.kind} />
            {entry.documentedAt && (
              <span className="entry__badge" title={`Marked documented on ${formatMedium(dateKeyInZone(new Date(entry.documentedAt), zone))}`}>
                Documented
              </span>
            )}
            {entry.pinned && <span className="entry__badge entry__badge--quiet">Pinned</span>}
          </div>
          <h1 id="entry-title" className="journal-read__title">
            {entry.title.trim() || entryHeading(entry).title || meta.label}
          </h1>
          <p className="journal-read__when">
            <Link to={`/?date=${entry.dateKey}`} className="journal-read__date">
              {formatLong(entry.dateKey)}
            </Link>
            <span aria-hidden="true"> · </span>
            <span className="tabular">{formatTimeInZone(new Date(entry.happenedAt), zone)}</span>
            {zone !== profile.timeZone && <span className="journal-read__zone"> ({zone.replace(/_/g, ' ')})</span>}
          </p>
          <div className="journal-read__actions">
            <Link to={`/?date=${entry.dateKey}`} className="btn btn--primary">
              <Icon name="pen" size={16} /> Edit on this day
            </Link>
            <button type="button" className="btn btn--quiet" onClick={togglePin} disabled={busy} aria-pressed={entry.pinned}>
              {entry.pinned ? 'Unpin' : 'Pin'}
            </button>
          </div>
        </header>

        {empty ? <p className="entry__empty">Nothing written yet.</p> : <DocView doc={entry.doc} className="journal-read__body" />}

        {(entry.taskIds.length > 0 || goals.length > 0 || entry.tags.length > 0) && (
          <dl className="journal-read__links">
            {entry.taskIds.length > 0 && (
              <div>
                <dt>Linked tasks</dt>
                <dd>
                  {entry.taskIds.map((id) => {
                    const t = data.tasks.get(id);
                    return t ? (
                      <Link key={id} to={`/?date=${t.scheduledDate ?? entry.dateKey}`} className={`link-chip link-chip--${t.category}`}>
                        <span aria-hidden="true">↗</span> {t.title}
                        {t.scheduledDate && t.scheduledDate !== entry.dateKey && <span className="link-chip__note"> · {formatMedium(t.scheduledDate)}</span>}
                      </Link>
                    ) : (
                      <span key={id} className="link-chip">
                        Removed task
                      </span>
                    );
                  })}
                </dd>
              </div>
            )}
            {goals.length > 0 && (
              <div>
                <dt>Vision goals</dt>
                <dd>
                  {goals.map((g) => (
                    <Link key={g.id} to={`/goals/${g.id}`} className="link-chip link-chip--goal">
                      <Icon name="vision" size={12} /> {g.title}
                    </Link>
                  ))}
                </dd>
              </div>
            )}
            {entry.tags.length > 0 && (
              <div>
                <dt>Tags</dt>
                <dd>
                  {entry.tags.map((t) => (
                    <Link key={t} to={`/journal?tag=${encodeURIComponent(t)}`} className="link-chip link-chip--tag">
                      #{t}
                    </Link>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}

        {entry.kind !== 'reflection' && (
          <p className="journal-read__evidence">
            {entry.kind === 'learning' ? 'Learning evidence' : 'Doing evidence'} in your own words. It records what happened; it does not certify mastery.
          </p>
        )}
      </article>

      {(newer || older) && (
        <nav className="journal-pager" aria-label="More entries">
          {newer ? <PagerLink entry={newer} search={search} dir="newer" /> : <span />}
          {older ? <PagerLink entry={older} search={search} dir="older" /> : <span />}
        </nav>
      )}
    </div>
  );
}

function PagerLink({ entry, search, dir }: { entry: JournalEntry; search: string; dir: 'newer' | 'older' }) {
  return (
    <Link to={readingHref(entry.id, search)} className={`journal-pager__link journal-pager__link--${dir}`} rel={dir === 'newer' ? 'prev' : 'next'}>
      <span className="journal-pager__dir">
        {dir === 'newer' && <Icon name="chevronLeft" size={14} />}
        {dir === 'newer' ? 'Newer' : 'Older'}
        {dir === 'older' && <Icon name="chevronRight" size={14} />}
      </span>
      <span className="journal-pager__title">{entryHeading(entry).title}</span>
      <span className="journal-pager__date">{formatMedium(entry.dateKey)}</span>
    </Link>
  );
}
