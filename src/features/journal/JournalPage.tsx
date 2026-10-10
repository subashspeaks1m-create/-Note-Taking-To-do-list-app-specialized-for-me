import { useState } from 'react';
import { EmptyState, PageHeader, StageNote } from '../../components/Page';
import { Icon } from '../../components/Icon';

const VIEWS = ['All entries', 'Learned', 'Built / Did', 'Reflections'] as const;

export function JournalPage() {
  const [view, setView] = useState<(typeof VIEWS)[number]>('All entries');
  return (
    <div className="page page--narrow">
      <PageHeader overline="Your written record" title="Journal" />
      <div className="journal-tools">
        <label className="search">
          <Icon name="search" size={18} />
          <span className="visually-hidden">Search your journal</span>
          <input type="search" placeholder="Search your journal" disabled />
        </label>
        <div className="segmented" role="group" aria-label="Journal view">
          {VIEWS.map((v) => (
            <button key={v} type="button" className="segmented__btn" aria-pressed={view === v} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <EmptyState icon="journal" title="Your journal is empty." body="Entries you write on Today appear here as a chronological feed you can search, filter and export." />
      <StageNote stage={4}>Search, filters, pinned entries and Markdown export arrive in stage 4. Writing starts in stage 2.</StageNote>
    </div>
  );
}
