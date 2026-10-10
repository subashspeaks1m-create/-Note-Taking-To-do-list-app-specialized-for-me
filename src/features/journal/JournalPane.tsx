import { Icon, type IconName } from '../../components/Icon';
import { formatLong, type DateKey } from '../../date/localDate';

interface Props {
  selected: DateKey;
}

const ENTRY_KINDS: { kind: 'learning' | 'doing' | 'reflection'; label: string; prompt: string; icon: IconName }[] = [
  { kind: 'learning', label: 'What I learned', prompt: 'What changed in your understanding?', icon: 'learning' },
  { kind: 'doing', label: 'What I did', prompt: 'What did you make or finish?', icon: 'doing' },
  { kind: 'reflection', label: 'Daily reflection', prompt: 'What was difficult, and what is your next step?', icon: 'reflection' },
];

/**
 * Right side of the workbench: a full page for paragraph logs. The editor,
 * autosave and save-state indicator arrive in stage 2.
 */
export function JournalPane({ selected }: Props) {
  return (
    <section className="pane pane--journal" aria-labelledby="journal-heading">
      <header className="pane__head">
        <h2 id="journal-heading" className="pane__title">
          What happened
        </h2>
        <span className="pane__meta">0 entries</span>
      </header>

      <div className="pane__scroll journal-page">
        <p className="journal-page__date">{formatLong(selected)}</p>
        <div className="empty empty--journal">
          <p className="empty__title empty__title--read">Leave a trace of today.</p>
          <p className="empty__body">Write what you actually learned or did, in your own words. Each entry gets its own time, category and links.</p>
          <ul className="entry-starters">
            {ENTRY_KINDS.map((k) => (
              <li key={k.kind}>
                <button type="button" className={`entry-starter entry-starter--${k.kind}`} disabled aria-describedby="journal-stage-note">
                  <span className="entry-starter__icon">
                    <Icon name={k.icon} size={18} />
                  </span>
                  <span className="entry-starter__text">
                    <span className="entry-starter__label">{k.label}</span>
                    <span className="entry-starter__prompt">{k.prompt}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p id="journal-stage-note" className="capture__hint">
            Writing and autosave start in stage 2.
          </p>
        </div>
      </div>
    </section>
  );
}
