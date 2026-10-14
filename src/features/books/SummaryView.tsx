import { useState } from 'react';
import { Icon } from '../../components/Icon';
import type { BookSummary } from './schema';

export function SummaryView({ summary }: { summary: BookSummary }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const allOpen = open.size === summary.chapters.length;
  return (
    <div className="summary">
      <section className="hero-card">
        <p className="overline">The book in one sentence</p>
        <p className="hero-card__line">{summary.oneSentence}</p>
        <div className="hero-card__cols">
          <div>
            <h3 className="mini-title">The big idea</h3>
            <p>{summary.bigIdea}</p>
          </div>
          <div>
            <h3 className="mini-title">Who it's for</h3>
            <p>{summary.whoItIsFor}</p>
          </div>
        </div>
      </section>

      <section className="reading">
        <h2 className="section-title">Complete summary</h2>
        {summary.overview.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>

      <section>
        <div className="section-row">
          <h2 className="section-title">Chapter by chapter</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(allOpen ? new Set() : new Set(summary.chapters.map((_, i) => i)))}>
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
        <ol className="chapters">
          {summary.chapters.map((c, i) => {
            const isOpen = open.has(i);
            return (
              <li key={i} className={`chapter ${isOpen ? 'chapter--open' : ''}`}>
                <button
                  type="button"
                  className="chapter__head"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                >
                  <span className="chapter__num tabular">{i + 1}</span>
                  <span className="chapter__title">{c.title}</span>
                  {c.pages && <span className="chapter__pages tabular">p. {c.pages}</span>}
                  <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={16} />
                </button>
                {isOpen && (
                  <div className="chapter__body">
                    <p>{c.summary}</p>
                    <ul className="bullets">
                      {c.keyPoints.map((k, j) => (
                        <li key={j}>{k}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {summary.keyConcepts.length > 0 && (
        <section>
          <h2 className="section-title">Key concepts</h2>
          <dl className="concepts">
            {summary.keyConcepts.map((k, i) => (
              <div key={i} className="concept">
                <dt>{k.term}</dt>
                <dd>{k.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {summary.quotes.length > 0 && (
        <section>
          <h2 className="section-title">Quotes worth keeping</h2>
          <div className="quotes">
            {summary.quotes.map((q, i) => (
              <figure key={i} className="quote">
                <blockquote>“{q.text}”</blockquote>
                <figcaption>
                  {q.page && <span className="tabular">p. {q.page} · </span>}
                  {q.whyItMatters}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {summary.caveats.length > 0 && (
        <section>
          <h2 className="section-title">Read with care</h2>
          <ul className="bullets bullets--muted">
            {summary.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
